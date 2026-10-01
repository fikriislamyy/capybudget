import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "bun:test";
import { client } from "../../src/db";
import {
  deletionPreview,
  requestDeletion,
  runDeletion,
} from "../../src/privacy/deletion";
import { workspaceTables } from "../../src/privacy/inventory";
import { runPrivacyExport, privacyArchive } from "../../src/privacy/exports";
import { s3 } from "../../src/tracking/storage";
if (process.env.POPULATED_PRIVACY_INTEGRATION === "1") {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Disposable test database required.");
  test("complete export and retryable erasure cover a populated personal and multi-business account", async () => {
    const [owner] =
      await client`select u.id,u.security_version from "user" u where email like 'tracking-%@example.test' and account_status='active' order by created_at limit 1`;
    expect(owner).toBeDefined();
    const preview = await deletionPreview(owner!.id);
    expect(preview.workspaces.length).toBeGreaterThan(1);
    const [exportJob] =
      await client`insert into privacy_exports(user_id,request_key,security_version) values(${owner!.id},${crypto.randomUUID()},${owner!.security_version}) returning id`;
    await runPrivacyExport(exportJob!.id);
    const [archive] =
      await client`select status,object_key,failure_code from privacy_exports where id=${exportJob!.id}`;
    expect(archive!.failure_code).toBeNull();
    expect(archive!.status).toBe("ready");
    const bytes = await privacyArchive(
      owner!.id,
      exportJob!.id,
      archive!.object_key,
    );
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const directory = await mkdtemp(join(tmpdir(), "capybudget-zip-test-"));
    try {
      const path = join(directory, "account.zip");
      await writeFile(path, bytes, { mode: 0o600 });
      const reader = Bun.spawn(["unzip", "-p", path, "manifest.json"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const text = await new Response(reader.stdout).text();
      expect(await reader.exited).toBe(0);
      const manifest = JSON.parse(text);
      expect(manifest.complete).toBe(true);
      expect(manifest.counts.transactions).toBeGreaterThan(0);
      expect(manifest.counts.invoices).toBeGreaterThan(0);
      const records = Bun.spawn(["unzip", "-p", path, "transactions.jsonl"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      expect(await new Response(records.stdout).text()).toMatch(
        /"amount":"[0-9.-]+"/,
      );
      expect(await records.exited).toBe(0);
      for (const file of manifest.files) {
        const extraction = Bun.spawn(["unzip", "-p", path, file.path], {
          stdout: "pipe",
          stderr: "ignore",
        });
        const content = Buffer.from(
          await new Response(extraction.stdout).arrayBuffer(),
        );
        const { createHash } = await import("node:crypto");
        expect(createHash("sha256").update(content).digest("hex")).toBe(
          file.checksum,
        );
        expect(await extraction.exited).toBe(0);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    const deletion = await requestDeletion(
      owner!.id,
      owner!.security_version,
      preview.scopeVersion,
    );
    const original = s3.send;
    s3.send = (async () => {
      throw new Error("Simulated storage outage");
    }) as typeof s3.send;
    try {
      await runDeletion(deletion.id);
      const [pending] =
        await client`select status from account_deletion_requests where id=${deletion.id}`;
      expect(pending!.status).toBe("retryable");
      expect(
        (await client`select id from "user" where id=${owner!.id}`).length,
      ).toBe(1);
    } finally {
      s3.send = original;
    }
    await runDeletion(deletion.id);
    const [completed] =
      await client`select status,failure_code from account_deletion_requests where id=${deletion.id}`;
    expect(completed!.failure_code).toBeNull();
    expect(completed!.status).toBe("completed");
    for (const workspace of preview.workspaces) {
      for (const table of workspaceTables) {
        const [count] = await client.unsafe(
          `select count(*)::int as count from "${table}" where workspace_id=$1`,
          [workspace.id],
        );
        expect(count!.count).toBe(0);
      }
    }
    expect(
      (await client`select id from "user" where id=${owner!.id}`).length,
    ).toBe(0);
  }, 60_000);
}
