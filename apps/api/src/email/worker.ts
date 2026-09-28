import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { decryptEmailMessage } from './crypto';
import { sendEmail } from './mailer';
import { EMAIL_QUEUE_NAME } from './queue';
import type { EncryptedEmailJob } from './types';
import { client } from '../db';
import { markInvoiceDeliveryFailed, sendInvoicePdf } from '../business/worker';

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
      if(!canSend)return;
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
