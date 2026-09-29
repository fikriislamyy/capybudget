import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
const testId = process.env.ASSISTANT_REDIS_TEST_ID;
const action = process.env.ASSISTANT_REDIS_TEST_ACTION;
if (!redisUrl || !testId || !/^[a-z0-9-]{8,80}$/.test(testId) || !['write', 'verify'].includes(action ?? '')) {
  throw new Error('Provide REDIS_URL, a unique ASSISTANT_REDIS_TEST_ID, and ASSISTANT_REDIS_TEST_ACTION=write|verify.');
}

const queueName = `capybudget-assistant-restart-${testId}`;
const jobId = `persisted-${testId}`;
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(queueName, { connection });

try {
  if (action === 'write') {
    await queue.add('restart-persistence-check', { marker: testId }, { jobId, removeOnComplete: false });
    console.log(JSON.stringify({ action, persisted: true }));
  } else {
    const job = await queue.getJob(jobId);
    if (!job || job.data.marker !== testId) throw new Error('The queued BullMQ job did not survive Redis restart.');
    await job.remove();
    await queue.obliterate({ force: true });
    console.log(JSON.stringify({ action, persisted: true }));
  }
} finally {
  await queue.close();
  await connection.quit();
}
