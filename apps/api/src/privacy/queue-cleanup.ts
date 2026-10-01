import { Queue, type JobType } from "bullmq";
import Redis from "ioredis";
import { client } from "../db";
import { decryptEmailMessage } from "../email/crypto";
/** Completion waits for Redis cleanup; locked jobs finish under the lifecycle fence. */
export async function purgeSubjectQueues(
  userId: string,
  workspaceIds: string[],
) {
  const [owner] = await client`select email from "user" where id=${userId}`;
  const scopes = new Set(workspaceIds);
  for (const name of [
    "capybudget-email",
    "capybudget-tracking",
    "capybudget-assistant",
    "capybudget-reports",
  ]) {
    const connection = new Redis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1000,
        retryStrategy: () => null,
      },
    );
    connection.on("error", () => {});
    const queue = new Queue(name, { connection });
    queue.on("error", () => {});
    try {
      await queue.waitUntilReady();
      if (name === "capybudget-tracking")
        for (const workspaceId of workspaceIds)
          await queue.removeJobScheduler("recurring:" + workspaceId);
      const states:JobType[] = [
        "wait",
        "paused" as JobType,
        "prioritized",
        "delayed",
        "active",
        "failed",
        "completed",
        "waiting-children",
      ];
      for (const state of states) {
        let offset = 0;
        for (;;) {
          const jobs = await queue.getJobs([state], offset, offset + 99, true);
          if (!jobs.length) break;
          let removed = 0;
          for (const job of jobs) {
            let data = job.data;
            if (name === "capybudget-email") {
              if (data.version === 2 && data.owner === userId) {
                if (!(await queue.remove(job.id!)))
                  throw new Error(
                    "Account job is still running; erasure will retry.",
                  );
                removed++;
                continue;
              }
              try {
                data = decryptEmailMessage(data, true);
              } catch {
                continue;
              }
            }
            const owned =
              data.userId === userId ||
              data.ownerUserId === userId ||
              data.securityOwnerId === userId ||
              scopes.has(data.workspaceId) ||
              (name === "capybudget-email" && owner && data.to === owner.email);
            if (owned) {
              const deleted = await queue.remove(job.id!);
              if (!deleted)
                throw new Error(
                  "Account job is still running; erasure will retry.",
                );
              removed++;
            }
          }
          offset += jobs.length - removed;
        }
      }
    } finally {
      await queue.close();
      connection.disconnect();
    }
  }
}
