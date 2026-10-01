import { revealRow } from "../security/business-fields";
import { ZipArchive } from "archiver";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { finished } from "node:stream/promises";
import { client } from "../db";
import {
  getAttachment,
  putAttachment,
  deleteAttachment,
} from "../tracking/storage";
import { workspaceTables, exportRecord } from "./inventory";
import { encryptField, decryptField } from "../security/encryption";
const maximum = 64 * 1024 * 1024;
export const archiveContext = (userId: string, id: string) => ({
  purpose: "privacy-export",
  owner: userId,
  entity: id,
  field: "archive",
});
export async function runPrivacyExport(id: string) {
  const [job] =
    await client`update privacy_exports set status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes'
    where id=${id} and expires_at>now() and attempts<5 and (status='queued' or (status='running' and lease_until<now())) returning *`;
  if (!job) return;
  const directory = await mkdtemp(join(tmpdir(), "capybudget-export-"));
  const heartbeat = setInterval(
    () =>
      void client`update privacy_exports set lease_until=now()+interval '5 minutes' where id=${id} and status='running' and attempts=${job.attempts}`.catch(
        () => {},
      ),
    30_000,
  );
  const key = "privacy/" + job.user_id + "/" + id + "/" + job.attempts + ".enc";
  try {
    let bytes = 0;
    const entries: string[] = [],
      files: { key: string; checksum: string; size: number; path: string }[] =
        [],
      counts: Record<string, number> = {};
    await client.begin(async (tx) => {
      await tx`set transaction isolation level repeatable read`;
      const [owner] =
        await tx`select id,name,email,email_verified,image,created_at,updated_at,account_status,security_version from "user" where id=${job.user_id}`;
      if (
        !owner ||
        owner.account_status !== "active" ||
        Number(owner.security_version) !== job.security_version
      )
        throw new Error("ACCESS_REVOKED");
      await tx`select set_config('app.user_id',${job.user_id},true)`;
      const workspaces =
        await tx`select * from workspaces where owner_user_id=${job.user_id} order by id`;
      const write = async (name: string, value: unknown) => {
        const payload = JSON.stringify(value) + "\n";
        bytes += Buffer.byteLength(payload);
        if (bytes > maximum) throw new Error("EXPORT_TOO_LARGE");
        await writeFile(join(directory, name), payload, {
          mode: 0o600,
          flag: "a",
        });
        if (!entries.includes(name)) entries.push(name);
      };
      await write("identity.jsonl", owner);
      await write(
        "login-providers.jsonl",
        await tx`select id,account_id,provider_id,scope,created_at,updated_at from account where user_id=${job.user_id}`,
      );
      await write(
        "devices.jsonl",
        await tx`select id,label,lock_enabled,created_at,revoked_at from security_devices where user_id=${job.user_id}`,
      );
      await write(
        "sessions.jsonl",
        await tx`select id,created_at,updated_at,expires_at from session where user_id=${job.user_id}`,
      );
      await write(
        "export-requests.jsonl",
        await tx`select id,status,created_at,expires_at from privacy_exports where user_id=${job.user_id}`,
      );
      await write(
        "preferences.jsonl",
        await tx`select privacy_default,updated_at from user_security_settings where user_id=${job.user_id}`,
      );
      for (const ws of workspaces) {
        await tx`select set_config('app.workspace_id',${ws.id},true)`;
        await write("workspaces.jsonl", ws);
        for (const table of workspaceTables) {
          let count = 0;
          for await (const batch of tx
            .unsafe(`select * from "${table}" where workspace_id=$1`, [ws.id])
            .cursor(200)) {
            for (const row of batch) {
              let exported;
              try {
                exported = revealRow(exportRecord(row), ws.id);
              } catch (error) {
                if (process.env.SECURITY_INTEGRATION === "1")
                  console.error("Export table:", table);
                throw error;
              }
              await write(table + ".jsonl", exported);
              count++;
              if (
                ((table === "attachments" && row.status === "ready") ||
                  (table === "business_documents" && row.state === "ready") ||
                  (table === "report_exports" && row.status === "ready")) &&
                row.object_key
              ) {
                const object = await getAttachment(row.object_key);
                const contents = await object.Body!.transformToByteArray();
                bytes += contents.byteLength;
                if (bytes > maximum) throw new Error("EXPORT_TOO_LARGE");
                const checksum = createHash("sha256")
                  .update(contents)
                  .digest("hex");
                if (row.checksum && row.checksum !== checksum)
                  throw new Error("OBJECT_CHECKSUM_MISMATCH");
                const path = "file-" + files.length;
                await writeFile(join(directory, path), contents, {
                  mode: 0o600,
                });
                entries.push(path);
                files.push({
                  key: row.object_key,
                  checksum,
                  size: contents.byteLength,
                  path,
                });
              }
            }
          }
          counts[table] = (counts[table] ?? 0) + count;
        }
      }
      await write(
        "security-events.jsonl",
        await tx`select action,outcome,created_at from security_events where user_id=${job.user_id}`,
      );
      await write("manifest.json", {
        version: 1,
        snapshotAt: new Date().toISOString(),
        currencyAmounts: "Exact decimal strings; no floating-point conversion",
        counts,
        files,
        excluded:
          "Authentication secrets, device secrets, push endpoints, OAuth tokens",
        complete: true,
      });
    });
    const archive = new ZipArchive({ zlib: { level: 6 } }),
      output = createWriteStream(join(directory, "archive.zip"), {
        mode: 0o600,
      });
    archive.on("error", (error) => output.destroy(error));
    archive.pipe(output);
    const complete = finished(output);
    for (const name of entries) archive.file(join(directory, name), { name });
    await archive.finalize();
    await complete;
    if ((await stat(join(directory, "archive.zip"))).size > maximum)
      throw new Error("EXPORT_TOO_LARGE");
    const zip = await readFile(join(directory, "archive.zip")),
      checksum = createHash("sha256").update(zip).digest("hex");
    const encrypted = encryptField(
      zip.toString("base64"),
      archiveContext(job.user_id, id),
    );
    await putAttachment(
      key,
      Buffer.from(encrypted),
      "application/octet-stream",
    );
    const published =
      await client`update privacy_exports e set status='ready',object_key=${key},checksum=${checksum},byte_count=${zip.length},lease_until=null
      from "user" u where e.id=${id} and u.id=e.user_id and u.account_status='active' and u.security_version=e.security_version and e.status='running' and e.attempts=${job.attempts} returning e.id`;
    if (!published.length) throw new Error("ACCESS_REVOKED");
  } catch (error) {
    if (process.env.SECURITY_INTEGRATION === "1")
      console.error(error instanceof Error ? error.message : "EXPORT_FAILED");
    await deleteAttachment(key).catch(() =>
      client`insert into report_export_cleanup(object_key) values(${key}) on conflict do nothing`.then(
        () => {},
      ),
    );
    await client`update privacy_exports set status='failed',failure_code=${error instanceof Error && ["EXPORT_TOO_LARGE", "ACCESS_REVOKED", "OBJECT_CHECKSUM_MISMATCH"].includes(error.message) ? error.message : "EXPORT_FAILED"},lease_until=null where id=${id} and attempts=${job.attempts}`;
  } finally {
    clearInterval(heartbeat);
    await rm(directory, { recursive: true, force: true });
  }
}
export async function privacyArchive(userId: string, id: string, key: string) {
  const object = await getAttachment(key);
  const value = await object.Body!.transformToString();
  return Buffer.from(decryptField(value, archiveContext(userId, id)), "base64");
}
