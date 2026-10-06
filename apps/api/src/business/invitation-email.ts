import { client } from '../db';
import { revealRow } from '../security/business-fields';
import { enqueueEmail } from '../email/queue';
import { sendEmail } from '../email/mailer';
import { classifySmtpError } from '../email/smtp-outcome';
import { UnrecoverableError } from 'bullmq';
import type { EmailMessage } from '../email/types';

let dispatching = false;
export async function dispatchInvitationEmails() {
  if (dispatching) return;
  dispatching = true;
  try {
    const businesses = await client`select id,owner_user_id,name from workspaces where kind='business' and archived_at is null`;
    for (const business of businesses) {
      await client.begin(async tx => {
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)", [business.owner_user_id,business.id]);
        await tx.unsafe("update business_invitations set email_state='uncertain',email_lease_until=null where workspace_id=$1 and email_state='sending' and email_lease_until<now()", [business.id]);
        const due = await tx.unsafe(`with due as (
          select id from business_invitations where workspace_id=$1 and token_snapshot is not null
          and accepted_at is null and revoked_at is null and expires_at>now() and email_attempts<5
          and ((email_state='pending' and email_next_attempt_at<=now()) or (email_state='queued' and email_lease_until<now()))
          order by created_at for update skip locked limit 25)
          update business_invitations i set email_state='queued',email_lease_until=now()+interval '3 minutes'
          from due where i.id=due.id returning i.*`, [business.id]);
        for (const raw of due) {
          const invite = revealRow(raw,business.id);
          const url = new URL('/join', process.env.PUBLIC_APP_URL ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173');
          url.hash = invite.token_snapshot;
          try {
            await enqueueEmail({kind:'business-invitation',to:invite.email_snapshot,url:url.href,
              businessName:business.name,role:invite.role,workspaceId:business.id,invitationId:invite.id,
              requestedBy:business.owner_user_id,locale:invite.email_locale,expiresAt:new Date(invite.expires_at).getTime()},
              `business-invitation-${invite.id}-${invite.email_attempts}`);
          } catch {
            await tx.unsafe("update business_invitations set email_state='pending',email_lease_until=null,email_next_attempt_at=now()+interval '30 seconds' where id=$1",[invite.id]);
          }
        }
      });
    }
  } catch {
    console.error('Invitation email outbox is temporarily unavailable');
  } finally { dispatching = false; }
}

export async function sendInvitationEmail(message: Extract<EmailMessage,{kind:'business-invitation'}>, deliver=sendEmail) {
  const claimed = await client.begin(async tx => {
    await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);
    const [raw] = await tx.unsafe(`update business_invitations set email_state='sending',email_attempts=email_attempts+1,email_lease_until=now()+interval '2 minutes'
      where workspace_id=$1 and id=$2 and email_state='queued' and accepted_at is null and revoked_at is null
      and expires_at>now() and email_attempts<5 returning *`,[message.workspaceId,message.invitationId]);
    return raw ? revealRow(raw,message.workspaceId) : null;
  });
  if (!claimed) return;
  // Rebuild the recipient and link from the durable invitation, not a stale queue snapshot.
  const url = new URL('/join',process.env.PUBLIC_APP_URL ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173');
  url.hash = claimed.token_snapshot;
  let state = 'accepted';
  try { await deliver({...message,to:claimed.email_snapshot,url:url.href}); }
  catch (error) {
    const outcome = classifySmtpError(error);
    state = outcome.uncertain ? 'uncertain' : outcome.permanent || claimed.email_attempts>=5 ? 'failed' : 'pending';
  }
  await client.begin(async tx => {
    await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.requestedBy,message.workspaceId]);
    await tx.unsafe("update business_invitations set email_state=$3,email_lease_until=null,email_next_attempt_at=now()+interval '30 seconds' where workspace_id=$1 and id=$2 and email_state='sending'",[message.workspaceId,message.invitationId,state]);
  });
  if (state !== 'accepted') throw new UnrecoverableError('Invitation email delivery did not complete');
}
