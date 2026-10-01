import { createHash, randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import { client, db } from "../db";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  backupS3,
  backupBucket,
  ensureBackupBucket,
} from "../privacy/tombstones";
import { getAttachment, putAttachment, s3 } from "../tracking/storage";
import { encryptField, decryptField } from "../security/encryption";
import { eraseSubject } from "../privacy/deletion";
const limit = Number(process.env.BACKUP_MAX_BYTES ?? 134217728);
const database = new URL(
  process.env.DATABASE_URL ??
    "postgres://capybudget:capybudget@localhost:5432/capybudget",
);
const databaseName = database.pathname.slice(1);
const context = (id: string) => ({
  purpose: "backup",
  owner: process.env.BACKUP_ENVIRONMENT_ID ?? "local",
  entity: id,
  field: "artifact",
});
function command(
  binary: "pg_dump" | "pg_restore" | "createdb" | "dropdb",
  args: string[],
) {
  return process.env.BACKUP_POSTGRES_LOCAL === "1"
    ? [binary, ...args]
    : [
        "docker",
        "compose",
        "exec",
        "-T",
        "postgres",
        binary,
        "-U",
        database.username,
        ...args,
      ];
}
async function postgresTool(
  binary: "pg_dump" | "pg_restore",
  args: string[],
  input?: Uint8Array,
) {
  const operation = Bun.spawn(command(binary, args), {
    stdout: "pipe",
    stderr: "ignore",
    stdin: input ? input : "ignore",
    env: {
      ...process.env,
      PGPASSWORD: database.password,
      PGHOST: database.hostname,
      PGPORT: database.port || "5432",
      PGUSER: database.username,
    },
  });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for await (const chunk of operation.stdout) {
      length += chunk.byteLength;
      if (length > limit) {
        operation.kill();
        throw new Error("Backup exceeds configured size limit.");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    operation.kill();
    await operation.exited;
    throw error;
  }
  if ((await operation.exited) !== 0)
    throw new Error(
      binary + " failed (details omitted to protect database contents).",
    );
  return Buffer.concat(chunks);
}
async function exactState() {
  const [state] =
    await client`select (select count(*) from "user")::text as users,(select count(*) from workspaces)::text as workspaces,(select count(*) from transactions)::text as transactions,(select coalesce(sum(debit),0)::text from journal_lines) as debits,(select coalesce(sum(credit),0)::text from journal_lines) as credits`;
  return state;
}
export async function createBackup() {
  const id = randomUUID(),
    started = Date.now();
  await ensureBackupBucket();
  const result = await client.begin(async (tx) => {
    await tx`set transaction isolation level repeatable read`;
    const [snapshot] = await tx`select pg_export_snapshot() as id`;
    const dump = await postgresTool("pg_dump", [
      "-d",
      databaseName,
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--snapshot=" + snapshot!.id,
    ]);
    const objects =
      await tx`select object_key,checksum from attachments where status='ready' union select object_key,checksum from business_documents where state='ready' union select object_key,checksum from report_exports where status='ready' and object_key is not null union select object_key,null::text as checksum from privacy_exports where status='ready' and object_key is not null and exists(select 1 from "user" u where u.id=privacy_exports.user_id and u.account_status='active')`;
    let size = dump.byteLength;
    const files = [];
    for (const object of objects) {
      const found = await getAttachment(object.object_key),
        bytes = await found.Body!.transformToByteArray();
      size += bytes.byteLength;
      if (size > limit)
        throw new Error("Backup exceeds configured size limit.");
      const checksum = createHash("sha256").update(bytes).digest("hex");
      // Privacy export checksum is of the decrypted ZIP; its encrypted object has a separate backup checksum.
      if (object.checksum && object.checksum !== checksum)
        throw new Error("Backup object checksum mismatch.");
      files.push({
        key: object.object_key,
        checksum,
        contentType: found.ContentType,
        body: Buffer.from(bytes).toString("base64"),
      });
    }
    const [state] =
      await tx`select (select count(*) from "user")::text as users,(select count(*) from workspaces)::text as workspaces,(select count(*) from transactions)::text as transactions,(select coalesce(sum(debit),0)::text from journal_lines) as debits,(select coalesce(sum(credit),0)::text from journal_lines) as credits`;
    return {
      version: 1,
      id,
      createdAt: new Date(started).toISOString(),
      databaseMajor: 18,
      state,
      dump: dump.toString("base64"),
      files,
    };
  });
  const encrypted = encryptField(JSON.stringify(result), context(id)),
    key =
      "backups/" +
      new Date(started).toISOString().slice(0, 10) +
      "/" +
      id +
      ".enc";
  const checksum = createHash("sha256").update(encrypted).digest("hex");
  await backupS3.send(
    new PutObjectCommand({
      Bucket: backupBucket,
      Key: key,
      Body: encrypted,
      ContentType: "application/octet-stream",
      Metadata: { checksum, backupid: id },
    }),
  );
  // Verify the stored artifact, rather than treating an accepted upload as proof of integrity.
  const stored = await backupS3.send(
    new GetObjectCommand({ Bucket: backupBucket, Key: key }),
  );
  const read = await stored.Body!.transformToString();
  if (createHash("sha256").update(read).digest("hex") !== checksum)
    throw new Error("Backup read-back checksum mismatch.");
  await backupS3.send(
    new PutObjectCommand({
      Bucket: backupBucket,
      Key: "catalog/" + id + ".json",
      Body: JSON.stringify({
        id,
        key,
        checksum,
        createdAt: result.createdAt,
        keyId: process.env.FIELD_ENCRYPTION_ACTIVE_KEY,
        durationMs: Date.now() - started,
        size: Buffer.byteLength(encrypted),
        status: "verified",
      }),
      ContentType: "application/json",
    }),
  );
  await client`insert into backup_runs(id,object_key,checksum,key_id,status,byte_count,duration_ms) values(${id},${key},${checksum},${process.env.FIELD_ENCRYPTION_ACTIVE_KEY!},'verified',${Buffer.byteLength(encrypted)},${Date.now() - started})`;
  await retainBackups();
  return {
    id,
    key,
    durationMs: Date.now() - started,
    files: result.files.length,
  };
}
async function allKeys(prefix: string) {
  let token: string | undefined;
  const items = [];
  do {
    const page = await backupS3.send(
      new ListObjectsV2Command({
        Bucket: backupBucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    items.push(...(page.Contents ?? []));
    token = page.NextContinuationToken;
  } while (token);
  return items;
}
export async function retainBackups() {
  const objects = await allKeys("backups/");
  const now = Date.now();
  const days = new Set<string>(),
    weeks = new Set<number>();
  for (const object of objects.sort(
    (a, b) =>
      (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
  )) {
    const date = object.LastModified?.getTime() ?? 0,
      age = (now - date) / 86400000,
      day = new Date(date).toISOString().slice(0, 10),
      week = Math.floor(date / (7 * 86400000));
    const keep = age <= 7 ? !days.has(day) : age <= 35 && !weeks.has(week);
    if (keep) {
      days.add(day);
      weeks.add(week);
    } else if (object.Key)
      await backupS3.send(
        new DeleteObjectCommand({ Bucket: backupBucket, Key: object.Key }),
      );
  }
  for (const item of await allKeys("tombstones/")) {
    const record = await backupS3.send(
      new GetObjectCommand({ Bucket: backupBucket, Key: item.Key }),
    );
    const tombstone = JSON.parse(await record.Body!.transformToString());
    if (new Date(tombstone.backupExpiresAt).getTime() < now)
      await backupS3.send(
        new DeleteObjectCommand({ Bucket: backupBucket, Key: item.Key }),
      );
  }
  for (const item of await allKeys("catalog/"))
    if (item.LastModified && item.LastModified.getTime() < now - 35 * 86400000)
      await backupS3.send(
        new DeleteObjectCommand({ Bucket: backupBucket, Key: item.Key }),
      );
}
export async function restoreBackup(key: string) {
  if (!databaseName.endsWith("_test") || process.env.RESTORE_ISOLATED !== "1")
    throw new Error("Restore requires an explicitly isolated *_test database.");
  if (!process.env.S3_BUCKET?.endsWith("-restore-test"))
    throw new Error(
      "Restore requires a separate *-restore-test object bucket.",
    );
  const [existing] =
    await client`select count(*)::int as count from information_schema.tables where table_schema='public'`;
  if (existing!.count) throw new Error("Restore target must be empty.");
  const started = Date.now(),
    id = key.split("/").at(-1)!.replace(".enc", "");
  const object = await backupS3.send(
    new GetObjectCommand({ Bucket: backupBucket, Key: key }),
  );
  const encrypted = await object.Body!.transformToString();
  if (
    createHash("sha256").update(encrypted).digest("hex") !==
    object.Metadata?.checksum
  )
    throw new Error("Backup checksum mismatch.");
  const backup = JSON.parse(decryptField(encrypted, context(id)));
  if (backup.version !== 1 || backup.databaseMajor !== 18)
    throw new Error("Unsupported backup.");
  await postgresTool(
    "pg_restore",
    ["-d", databaseName, "--no-owner", "--no-acl", "--single-transaction"],
    Buffer.from(backup.dump, "base64"),
  );
  const restored = await exactState();
  if (JSON.stringify(restored) !== JSON.stringify(backup.state))
    throw new Error("Restored database counts/totals differ.");
  await migrate(db, {
    migrationsFolder: new URL("../../drizzle/", import.meta.url).pathname,
  });
  // Replay the independent catalog BEFORE allowing any traffic or workers.
  const tombstones = await allKeys("tombstones/");
  for (const item of tombstones) {
    const object = await backupS3.send(
      new GetObjectCommand({ Bucket: backupBucket, Key: item.Key }),
    );
    const t = JSON.parse(await object.Body!.transformToString());
    if (t.status !== "confirmed") continue;
    const [owner] = await client`select id from "user" where id=${t.subjectId}`;
    if (!owner) continue;
    await client`update "user" set account_status='deletion_pending' where id=${t.subjectId}`;
    await client`insert into account_deletion_requests(subject_id,user_id,status,receipt_digest,manifest,workspace_ids,lease_until) values(${t.subjectId},${t.subjectId},'deleting','restore','{}',${JSON.stringify(t.workspaceIds)}::jsonb,now()+interval '1 hour') on conflict(subject_id) do update set status='deleting',lease_until=now()+interval '1 hour'`;
    await eraseSubject(t.subjectId, t.workspaceIds);
    await client`update account_deletion_requests set status='completed',completed_at=now() where subject_id=${t.subjectId}`;
  }
  let fileCount = 0;
  for (const file of backup.files) {
    if (file.key.startsWith("privacy/")) continue; // Expired privacy archives are never restored.
    const candidate = file.key.match(/(?:^|\/)([0-9a-f-]{36})(?:\/|$)/i)?.[1];
    if (
      candidate &&
      (await client`select id from workspaces where id=${candidate}`).length ===
        0
    )
      continue;
    const bytes = Buffer.from(file.body, "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== file.checksum)
      throw new Error("Restored file checksum mismatch.");
    await putAttachment(
      file.key,
      bytes,
      file.contentType ?? "application/octet-stream",
    );
    fileCount++;
  }
  await client`delete from session`;
  await client`delete from verification`;
  await client`delete from security_challenges`;
  await client`update finance_notification_deliveries set status='cancelled',lease_expires_at=null where status in ('pending','retryable','processing')`;
  await client`update invoice_deliveries set state='cancelled',lease_until=null where state not in ('accepted','cancelled')`;
  await client`update privacy_exports set status='expired',object_key=null`;
  await client`update report_exports set expires_at=now()`;
  await client`insert into backup_restore_checks(backup_id,outcome,duration_ms) values(${id},'passed',${Date.now() - started})`;
  const result = {
    id,
    restoredAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    files: fileCount,
    countsAndTotalsVerified: true,
    sessionsInvalidated: true,
    tombstonesReplayed: true,
    outboxesSuppressed: true,
  };
  await backupS3.send(
    new PutObjectCommand({
      Bucket: backupBucket,
      Key: "restore-checks/" + randomUUID() + ".json",
      Body: JSON.stringify(result),
      ContentType: "application/json",
    }),
  );
  return result;
}
async function monthlyRestore(key: string, backupId: string) {
  const [recent] =
    await client`select id from backup_restore_checks where outcome='passed' and created_at>date_trunc('month',now()) limit 1`;
  if (recent) return;
  const suffix = randomUUID(),
    target = "capybudget_restore_" + suffix.replaceAll("-", "") + "_test",
    bucket = "capybudget-" + suffix + "-restore-test";
  const env = {
    ...process.env,
    PGPASSWORD: database.password,
    PGHOST: database.hostname,
    PGPORT: database.port || "5432",
    PGUSER: database.username,
  };
  const started = Date.now();
  let created = false;
  try {
    const create = Bun.spawn(command("createdb", [target]), {
      env,
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await create.exited) !== 0)
      throw new Error("Isolated restore database creation failed.");
    created = true;
    const destination = new URL(database);
    destination.pathname = "/" + target;
    const restore = Bun.spawn(
      [process.execPath, import.meta.path, "restore", key],
      {
        env: {
          ...env,
          DATABASE_URL: destination.toString(),
          S3_BUCKET: bucket,
          RESTORE_ISOLATED: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [result, exit] = await Promise.all([
      new Response(restore.stdout).text(),
      restore.exited,
    ]);
    if (exit !== 0) throw new Error("Monthly isolated restore failed.");
    await client`insert into backup_restore_checks(backup_id,outcome,duration_ms) values(${backupId},'passed',${Date.now() - started})`;
    console.log("RESTORE_VERIFIED " + result.trim());
  } catch (error) {
    await client`insert into backup_restore_checks(backup_id,outcome,duration_ms) values(${backupId},'failed',${Date.now() - started})`;
    throw error;
  } finally {
    if (created) {
      const drop = Bun.spawn(command("dropdb", ["--force", target]), {
        env,
        stdout: "ignore",
        stderr: "ignore",
      });
      await drop.exited;
    }
    try {
      let token: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? [])
          await s3.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }),
          );
        token = page.NextContinuationToken;
      } while (token);
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if ((error as Error).name !== "NoSuchBucket")
        console.error("RESTORE_TEMP_CLEANUP_REQUIRED");
    }
  }
}
export async function backupCommand() {
  try {
    const mode = process.argv[2] ?? "create";
    if (mode === "restore")
      console.log(JSON.stringify(await restoreBackup(process.argv[3]!)));
    else if (mode === "schedule") {
      for (;;) {
        let waitMs = 86400000;
        try {
          const backup = await createBackup();
          console.log(JSON.stringify(backup));
          await monthlyRestore(backup.key, backup.id);
        } catch {
          await client`insert into backup_runs(id,object_key,checksum,key_id,status,byte_count,duration_ms) values(${randomUUID()},'','',${process.env.FIELD_ENCRYPTION_ACTIVE_KEY ?? "unknown"},'failed',0,0)`.catch(
            () => {},
          );
          console.error(
            "BACKUP_OR_RESTORE_FAILED: inspect the durable operational records.",
          );
          waitMs = 300000;
        }
        await Bun.sleep(waitMs);
      }
    } else console.log(JSON.stringify(await createBackup()));
  } finally {
    if (process.argv[2] !== "schedule") await client.end();
  }
}

if (import.meta.main) await backupCommand();
