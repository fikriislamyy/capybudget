import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

export const REPORTS_QUEUE = 'capybudget-reports';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
let queue: Queue | undefined;
function getQueue() {
  return queue ??= new Queue(REPORTS_QUEUE, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 86400, count: 2000 }
    }
  });
}

export function enqueueReportRun(runId: string, workspaceId: string, userId: string) {
  return getQueue().add('report-run', { runId, workspaceId, userId }, { jobId: `report-run-${runId}-${randomUUID()}` });
}

export function enqueueReportExport(exportId: string, workspaceId: string, userId: string) {
  return getQueue().add('report-export', { exportId, workspaceId, userId }, { jobId: `report-export-${exportId}-${randomUUID()}` });
}

export async function scheduleReportRecovery() {
  await getQueue().upsertJobScheduler('report-recovery-sweep', { every: 30_000 }, { name: 'report-recovery-sweep', data: {} });
}
