import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { encryptEmailMessage } from './crypto';
import type { EmailMessage, EncryptedEmailJob } from './types';

export const EMAIL_QUEUE_NAME = 'capybudget-email';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
let queue: Queue<EncryptedEmailJob> | undefined;

function getQueue(): Queue<EncryptedEmailJob> {
  if (!queue) {
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1_000,
      // A failed producer is rebuilt by the next sweep; workers keep reconnecting separately.
      retryStrategy: () => null
    });
    connection.on('error', () => console.error('Email queue connection error'));
    queue = new Queue<EncryptedEmailJob>(EMAIL_QUEUE_NAME, {
      // Producers must fail promptly so the committed outbox can recover on the next sweep.
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: { age: 60 * 60, count: 100 }
      }
    });
    queue.on('error', () => console.error('Email queue connection error'));
    const created = queue;
    connection.once('end', () => {
      if (queue === created) queue = undefined;
      void created.close().catch(() => {});
    });
  }
  return queue;
}

export async function enqueueEmail(message: EmailMessage, jobId?: string): Promise<void> {
  const encrypted = encryptEmailMessage(message);
  await getQueue().add(message.kind, encrypted, { jobId: jobId ?? randomUUID() });
}
