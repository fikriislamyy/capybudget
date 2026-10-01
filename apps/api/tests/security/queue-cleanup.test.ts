import { test, expect } from "bun:test";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { purgeSubjectQueues } from "../../src/privacy/queue-cleanup";
if (process.env.QUEUE_CLEANUP_INTEGRATION === "1") {
  if (
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") ||
    !/^\/[1-9]\d*$/.test(new URL(process.env.REDIS_URL!).pathname)
  )
    throw new Error("Disposable database and isolated Redis required.");
  test("queue erasure paginates each state and preserves other users", async () => {
    const connection = new Redis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: null,
      }),
      queue = new Queue("capybudget-assistant", { connection });
    await queue.waitUntilReady();
    try {
      await queue.addBulk(
        Array.from({ length: 600 }, (_, index) => ({
          name: "assistant-forecast-run",
          data: {
            userId: index % 2 ? "foreign-user" : "erased-user",
            workspaceId: index % 2 ? "foreign-workspace" : "erased-workspace",
          },
          opts: {
            jobId: "privacy-pagination-" + index,
            ...(index >= 300 ? { delay: 3600000 } : {}),
          },
        })),
      );
      await purgeSubjectQueues("erased-user", ["erased-workspace"]);
      const remaining = await queue.getJobs(["wait", "delayed"], 0, -1, true);
      expect(remaining.length).toBe(300);
      expect(remaining.every((job) => job.data.userId === "foreign-user")).toBe(
        true,
      );
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    }
  }, 30_000);
}
