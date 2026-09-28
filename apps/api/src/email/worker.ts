import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { decryptEmailMessage } from './crypto';
import { sendEmail } from './mailer';
import { EMAIL_QUEUE_NAME } from './queue';
import type { EncryptedEmailJob } from './types';

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
