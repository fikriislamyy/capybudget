import { test, expect } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { client } from "../../src/db";
import { putAttachment, getAttachment } from "../../src/tracking/storage";
import { createBackup } from "../../src/operations/backup";
if (process.env.BACKUP_SECURITY_INTEGRATION === "1") {
  if (
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") ||
    !process.env.BACKUP_S3_BUCKET?.endsWith("-test")
  )
    throw new Error("Disposable database and backup bucket required.");
  test("encrypted database backup includes a retained private attachment with its exact checksum", async () => {
    const [transaction] =
      await client`select t.id,t.workspace_id,w.owner_user_id from transactions t join workspaces w on w.id=t.workspace_id join "user" u on u.id=w.owner_user_id where u.email like 'tracking-%@example.test' and u.account_status='active' order by t.created_at desc limit 1`;
    expect(transaction).toBeDefined();
    const id = randomUUID(),
      key =
        transaction!.workspace_id + "/" + transaction!.id + "/" + id + ".pdf",
      bytes = Buffer.from("%PDF-1.4\nprivate-attachment-canary\n%%EOF"),
      checksum = createHash("sha256").update(bytes).digest("hex");
    await putAttachment(key, bytes, "application/pdf");
    await client`insert into attachments(id,workspace_id,transaction_id,object_key,original_name,mime_type,size_bytes,checksum,status,uploaded_by) values(${id},${transaction!.workspace_id},${transaction!.id},${key},'restore-fixture.pdf','application/pdf',${bytes.length},${checksum},'ready',${transaction!.owner_user_id})`;
    const object = await getAttachment(key);
    expect(
      Buffer.from(await object.Body!.transformToByteArray()).equals(bytes),
    ).toBe(true);
    const backup = await createBackup();
    expect(backup.files).toBeGreaterThan(0);
    console.log(
      "BACKUP_RESTORE_FIXTURE " +
        JSON.stringify({
          backupKey: backup.key,
          subjectId: transaction!.owner_user_id,
          objectKey: key,
          checksum,
        }),
    );
  }, 60_000);
}
