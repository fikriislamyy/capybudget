import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { decryptEmailMessage } from './crypto';
import { sendEmail } from './mailer';
import { EMAIL_QUEUE_NAME } from './queue';
import type { EncryptedEmailJob } from './types';
import { client } from '../db';
import { markInvoiceDeliveryFailed, markInvoiceReminderFailed, sendInvoicePdf, sendInvoiceReminder } from '../business/worker';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const worker = new Worker<EncryptedEmailJob>(
  EMAIL_QUEUE_NAME,
  async (job) => {
    if (job.data.expiresAt <= Date.now()) return;
    let message;
    try {
      message = decryptEmailMessage(job.data);
    } catch {
      throw new UnrecoverableError('Email job expired or could not be decrypted');
    }
    if(message.kind==='bill-reminder'){
      const canSend=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);
        const [occurrence]=await tx.unsafe("select id from bill_occurrences where workspace_id=$1 and id=$2 and status='unpaid'",[message.workspaceId,message.occurrenceId]);
        const [preference]=await tx.unsafe("select enabled from finance_notification_preferences where workspace_id=$1 and user_id=$2 and event_type='bill-reminder' and channel='email'",[message.workspaceId,message.userId]);
        return Boolean(occurrence)&&preference?.enabled!==false;
      });
      if(!canSend){console.info('Discarded stale bill reminder email');return;}
    }
    if(message.kind==='invoice-delivery'){
      try { await sendInvoicePdf(message); }
      catch(error) {
        const uncertain=Boolean((error as {code?:string}).code?.startsWith('ETIMEDOUT'));
        if(uncertain){await markInvoiceDeliveryFailed(message,true);throw new UnrecoverableError('SMTP delivery outcome is uncertain');}
        if(job.attemptsMade+1 >= (job.opts.attempts??5))await markInvoiceDeliveryFailed(message);
        throw error;
      }
      return;
    }
    if(message.kind==='invoice-reminder'){
      try{await sendInvoiceReminder(message);}
      catch(error){const uncertain=Boolean((error as {code?:string}).code?.startsWith('ETIMEDOUT'));if(uncertain){await markInvoiceReminderFailed(message,true);throw new UnrecoverableError('SMTP delivery outcome is uncertain');}if(job.attemptsMade+1 >= (job.opts.attempts??5))await markInvoiceReminderFailed(message);throw error;}
      return;
    }
    if(message.kind==='assistant-alert'){
      const canSend=await client.begin(async(tx)=>{
        await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);
        const [row]=await tx.unsafe(`select n.id from finance_notifications n
          join assistant_suggestions s on s.workspace_id=n.workspace_id and s.user_id=n.user_id and s.id=n.assistant_suggestion_id
          join forecast_runs r on r.workspace_id=s.workspace_id and r.id=s.run_id
          join assistant_settings a on a.workspace_id=n.workspace_id and a.user_id=n.user_id
          join assistant_refresh_state f on f.workspace_id=n.workspace_id and f.user_id=n.user_id
          join finance_notification_preferences p on p.workspace_id=n.workspace_id and p.user_id=n.user_id and p.event_type='assistant-alert' and p.channel='email' and p.enabled=true
          where n.workspace_id=$1 and n.user_id=$2 and n.id=$3 and n.kind in ('cashflow-shortfall','cashflow-low-balance','assistant-invoice-followup') and n.resolved_at is null and n.email_sent_at is null
          and s.state in ('active','reviewing') and s.expires_at>now() and a.local_forecast_enabled and a.suggestions_enabled and a.consent_version=r.consent_version and f.checked_at>=n.created_at
          and not (s.facts->>'scope'='account' and exists(select 1 from finance_notifications wn join assistant_suggestions ws on ws.workspace_id=wn.workspace_id and ws.user_id=wn.user_id and ws.id=wn.assistant_suggestion_id where wn.workspace_id=n.workspace_id and wn.user_id=n.user_id and wn.kind=n.kind and wn.resolved_at is null and ws.state in ('active','reviewing') and ws.facts->>'scope'='workspace' and ws.facts->>'date'=s.facts->>'date'))`,[message.workspaceId,message.userId,message.notificationId]);
        return Boolean(row);
      });
      if(!canSend)return;
      await sendEmail(message);
      await client.begin(async(tx)=>{await tx.unsafe("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[message.userId,message.workspaceId]);await tx.unsafe('update finance_notifications set email_sent_at=coalesce(email_sent_at,now()) where workspace_id=$1 and user_id=$2 and id=$3 and resolved_at is null',[message.workspaceId,message.userId,message.notificationId]);});
      return;
    }
    await sendEmail(message);
  },
  {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 5,
    lockDuration: 30_000
  }
);

worker.on('completed', (job) => {
  if (job.data.expiresAt <= Date.now()) console.info('Discarded expired email job');
});
worker.on('failed', (job) => {
  // Do not log recipients, OTPs, URLs, provider errors, or encrypted payloads.
  console.error('Email delivery attempt failed', { attempts: job?.attemptsMade ?? 0 });
});
worker.on('error', () => console.error('Email worker connection error'));
console.info('CapyBudget email worker is running');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await worker.close();
    process.exit(0);
  });
}
