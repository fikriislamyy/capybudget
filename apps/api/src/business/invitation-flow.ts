import { createHash, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { client } from '../db';
import { revealRow } from '../security/business-fields';

export const INVITATION_COOKIE = 'capybudget_invitation';
export const invitationDigest = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = /^[A-Za-z0-9_-]{43}$/;
let redis: Redis | undefined;
function store() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
      connectTimeout: 1500, commandTimeout: 2000, retryStrategy: () => null
    });
    redis.on('error', () => {});
  }
  return redis;
}
async function connected() {
  const connection = store();
  if (connection.status === 'wait' || connection.status === 'end') await connection.connect();
  if (connection.status !== 'ready') throw new Error('Invitation store unavailable');
  return connection;
}
export function invitationCookie(headers: Headers) {
  return headers.get('cookie')?.match(/(?:^|;\s*)capybudget_invitation=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
}
const key = (id: string) => `capybudget:invitation-flow:${invitationDigest(id)}`;
export function flowCookie(value: string, maxAge: number) {
  return `${INVITATION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
type ResolvedInvitation = { id: string; workspace_id: string; email_snapshot: string; role: string; expires_at: string | Date; accepted_by: string | null; business_name: string };
export async function resolveInvitation(tokenHash: string): Promise<ResolvedInvitation | null> {
  const [raw] = await client.unsafe('select * from capybudget_resolve_business_invite($1)', [tokenHash]);
  return raw ? revealRow(raw, raw.workspace_id) as ResolvedInvitation : null;
}
export async function beginInvitation(token: unknown, headers: Headers) {
  if (typeof token !== 'string' || !opaque.test(token)) return null;
  const tokenHash = invitationDigest(token), invite = await resolveInvitation(tokenHash);
  // Used email links cannot start a new registration flow.
  if (!invite || invite.accepted_by) return null;
  const id = randomBytes(32).toString('base64url');
  const ttl = Math.min(7 * 86400, Math.floor((new Date(invite.expires_at).getTime() - Date.now()) / 1000));
  if (ttl <= 0) return null;
  const connection = await connected();
  await connection.set(key(id), tokenHash, 'EX', ttl);
  const previous = invitationCookie(headers);
  if (previous) await connection.del(key(previous));
  return { id, ttl };
}
export async function invitationFromHeaders(headers: Headers) {
  const id = invitationCookie(headers);
  if (!id) return null;
  const tokenHash = await (await connected()).get(key(id));
  if (!tokenHash || !/^[0-9a-f]{64}$/.test(tokenHash)) return null;
  const invite = await resolveInvitation(tokenHash);
  return invite ? { ...invite, tokenHash } : null;
}
export async function clearInvitation(headers: Headers) {
  const id = invitationCookie(headers);
  if (id) await (await connected()).del(key(id));
}
export async function invitationStatus(headers: Headers, signedIn?: { id: string; email: string } | null) {
  const invite = await invitationFromHeaders(headers);
  if (!invite) return { stage: 'unavailable' as const };
  const email = String(invite.email_snapshot).trim().toLowerCase();
  const [account] = await client`select id,email_verified,account_status from "user" where lower(trim(email))=${email}`;
  const needsOnboarding = invite.accepted_by === signedIn?.id && signedIn ? await invitationNeedsOnboarding(signedIn.id) : false;
  const stage = signedIn && signedIn.email.toLowerCase() !== email ? 'wrong-account'
    : invite.accepted_by && invite.accepted_by !== signedIn?.id ? 'unavailable'
    : account?.account_status && account.account_status !== 'active' ? 'unavailable'
    : !account ? 'register' : !account.email_verified ? 'verify'
    : !signedIn ? 'login' : invite.accepted_by ? needsOnboarding ? 'onboarding' : 'complete' : 'accept';
  return { stage, email, businessName: String(invite.business_name), role: String(invite.role), workspaceId: String(invite.workspace_id) };
}

export async function invitationNeedsOnboarding(userId: string) {
  return client.begin(async tx => {
    await tx.unsafe("select set_config('app.user_id',$1,true)",[userId]);
    const [state] = await tx.unsafe('select completed_at from onboarding_state where user_id=$1',[userId]);
    return !state?.completed_at;
  });
}
