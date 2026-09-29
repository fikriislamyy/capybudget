import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REPORTS_QUEUE, scheduleReportRecovery } from './queue';
import { cleanupReportExports, processQueuedReportExport, processQueuedReportRun, recoverReportJobs } from './routes';

const worker = new Worker(REPORTS_QUEUE, async (job) => {
  if (job.name === 'report-recovery-sweep') {
    await recoverReportJobs();
    await cleanupReportExports();
    return;
  }
  const workspaceId = String(job.data.workspaceId), userId = String(job.data.userId);
  if (job.name === 'report-run') {
    try { await processQueuedReportRun(String(job.data.runId), workspaceId, userId, job.attemptsMade); }
    catch (error) {
      const code = (error as { code?: string; status?: number }).code;
      if ((error as { status?: number }).status === 413 || ['ACCESS_REVOKED', 'INVALID_REPORT'].includes(code ?? '')) throw new UnrecoverableError(code ?? 'REPORT_GENERATION_FAILED');
      throw error;
    }
    return;
  }
  if (job.name === 'report-export') {
    try { await processQueuedReportExport(String(job.data.exportId), workspaceId, userId, job.attemptsMade); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (['ACCESS_REVOKED', 'REPORT_EXPIRED', 'PDF_TOO_LARGE', 'EXPORT_TOO_LARGE'].includes(code ?? '')) throw new UnrecoverableError(code ?? 'EXPORT_FAILED');
      throw error;
    }
  }
}, {
  connection: new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }),
  concurrency: 2,
  lockDuration: 600_000
});

worker.on('failed', (job) => console.error('Report job failed', { type: job?.name, attempts: job?.attemptsMade ?? 0 }));
worker.on('error', () => console.error('Report worker connection error'));
worker.on('ready', () => void scheduleReportRecovery().catch(() => console.error('Unable to schedule report recovery')));
void scheduleReportRecovery().catch(() => console.error('Unable to schedule report recovery'));
console.info('CapyBudget reports worker is running');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await worker.close(); process.exit(0); });
