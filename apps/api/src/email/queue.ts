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
    queue = new Queue<EncryptedEmailJob>(EMAIL_QUEUE_NAME, {
      connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: { age: 60 * 60, count: 100 }
      }
    });
  }
  return queue;
}

export async function enqueueEmail(message: EmailMessage): Promise<void> {
  const encrypted = encryptEmailMessage(message);
  await getQueue().add(message.kind, encrypted, { jobId: randomUUID() });
}
