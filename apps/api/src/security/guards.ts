import { createHash } from "node:crypto";
import { auth } from "../auth";
import { client } from "../db";

export class SecurityError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function securityActor(request: Request) {
  const current = await auth.api.getSession({ headers: request.headers });
  if (!current) throw new SecurityError(401, "Authentication required.");
  if (!current.user.emailVerified)
    throw new SecurityError(403, "Email verification required.");
  const [owner] =
    await client`select account_status, security_version from "user" where id=${current.user.id}`;
  if (!owner || owner.account_status !== "active")
    throw new SecurityError(401, "Account is unavailable.");
  let [state] =
    await client`select s.*, d.lock_enabled, d.pin_hash is not null as has_pin, d.revoked_at,
    d.failures, d.cooldown_until from session_security s join security_devices d on d.id=s.device_id
    where s.session_id=${current.session.id}`;
  if (!state) {
    // Binding lives on the server. Removing cookies/localStorage cannot replace it.
    state = await client.begin(async (tx) => {
      await tx`select id from session where id=${current.session.id} for update`;
      const [existing] =
        await tx`select s.*,d.lock_enabled,d.pin_hash is not null as has_pin,d.revoked_at,d.failures,d.cooldown_until
        from session_security s join security_devices d on d.id=s.device_id where s.session_id=${current.session.id}`;
      if (existing) return existing;
      const opaqueCookie = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)capybudget_browser=([A-Za-z0-9_-]{43})/)?.[1];
      const tokenDigest = opaqueCookie
        ? createHash("sha256").update(opaqueCookie).digest("hex")
        : null;
      const [registered] = tokenDigest
        ? await tx`select id,lock_enabled,pin_hash is not null as has_pin,failures,cooldown_until from security_devices where user_id=${current.user.id} and token_digest=${tokenDigest} and revoked_at is null`
        : [];
      if (registered) {
        const [bound] =
          await tx`insert into session_security(session_id,user_id,device_id,unlocked_until) values(${current.session.id},${current.user.id},${registered.id},now()+interval '15 minutes') returning *`;
        return {
          ...bound,
          ...registered,
          device_id: registered.id,
          revoked_at: null,
        };
      }
      const [device] =
        await tx`insert into security_devices(user_id,label) values(${current.user.id},${(request.headers.get("user-agent") || "Browser").slice(0, 120)}) returning id`;
      const [bound] =
        await tx`insert into session_security(session_id,user_id,device_id) values(${current.session.id},${current.user.id},${device!.id}) returning *`;
      return {
        ...bound,
        lock_enabled: false,
        has_pin: false,
        revoked_at: null,
        failures: 0,
        cooldown_until: null,
      };
    });
  }
  if (state!.revoked_at)
    throw new SecurityError(401, "Browser registration revoked.");
  const now = Date.now();
  const locked = Boolean(
    state!.lock_enabled &&
    (state!.locked_at ||
      !state!.unlocked_until ||
      new Date(state!.unlocked_until).getTime() <= now ||
      new Date(state!.last_activity_at).getTime() + 300_000 <= now),
  );
  return {
    ...current,
    state: state!,
    locked,
    version: Number(owner.security_version),
  };
}
export async function securityGuard(request: Request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/") || path === "/api/health" || path === "/api")
    return;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expected =
      process.env.WEB_ORIGIN ??
      process.env.BETTER_AUTH_URL ??
      "http://localhost:5173";
    if (origin && origin !== expected)
      return Response.json(
        { message: "Untrusted request origin." },
        { status: 403 },
      );
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return Response.json(
        { message: "Cross-site request denied." },
        { status: 403 },
      );
  }
  if (path === "/api/privacy/deletion/receipt" && request.method === "POST")
    return;
  if(request.method==='GET'&&/^\/api\/payments\/qris\/[0-9a-f]{64}$/.test(path))return;
  if(request.method==='POST'&&/^\/api\/payments\/qris\/[0-9a-f]{64}\/simulate$/.test(path))return;
  // Provider callbacks authenticate inside their handlers: DOKU HMAC or Pakasir X-Secret.
  if(request.method==='POST'&&/^\/api\/payments\/(?:doku|pakasir)\/[0-9a-f-]{36}$/i.test(path))return;
  if ((request.method === 'GET' && path === '/api/business/invitations/flow') ||
      (request.method === 'POST' && ['/api/business/invitations/flow/start','/api/business/invitations/flow/cancel'].includes(path))) return;
  if (path.startsWith("/api/auth/")) return;
  try {
    const actor = await securityActor(request);
    const allowed = new Set([
      "/api/security/status",
      "/api/security/lock",
      "/api/security/unlock/pin",
      "/api/security/reauthenticate",
      "/api/security/webauthn/unlock/options",
      "/api/security/webauthn/unlock/verify",
    ]);
    if (actor.locked && !allowed.has(path))
      return Response.json(
        { code: "APP_LOCKED", message: "Unlock this browser to continue." },
        { status: 423, headers: { "Cache-Control": "no-store" } },
      );
    // GET polling never renews inactivity or the absolute unlock lease.
    if (
      !actor.locked &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !path.startsWith("/api/security/")
    ) {
      await client`update session_security set last_activity_at=now() where session_id=${actor.session.id}`;
    }
  } catch (error) {
    if (error instanceof SecurityError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
}
export async function consumeGrant(request: Request, purpose: string) {
  const actor = await securityActor(request);
  if (actor.locked) throw new SecurityError(423, "Unlock this browser first.");
  const grant = request.headers.get("x-security-grant");
  if (!grant || !/^[0-9a-f-]{36}$/i.test(grant))
    throw new SecurityError(403, "Recent full authentication required.");
  const rows =
    await client`update security_challenges set consumed_at=now() where id=${grant} and session_id=${actor.session.id}
    and purpose=${purpose} and security_version=${actor.version} and consumed_at is null and expires_at>now() returning id`;
  if (!rows.length)
    throw new SecurityError(
      403,
      "Authentication grant expired or already used.",
    );
  return actor;
}
