import { createHash, randomBytes } from "node:crypto";
import { client } from "../db";
import { deleteAttachment } from "../tracking/storage";
import { SecurityError } from "../security/guards";
import { workspaceTables } from "./inventory";
import { persistTombstone } from "./tombstones";
import { purgeSubjectQueues } from "./queue-cleanup";
import { encryptField } from "../security/encryption";
export async function deletionPreview(userId: string) {
  return client.begin(async (tx) => {
    await tx`select set_config('app.user_id',${userId},true)`;
    const workspaces =
      await tx`select id,name,kind from workspaces where owner_user_id=${userId} order by id`;
    let files = 0;
    let blocked = false;
    for (const ws of workspaces) {
      await tx`select set_config('app.workspace_id',${ws.id},true)`;
      const [shared] =
        await tx`select capybudget_other_members(${ws.id})::int as count`;
      if (shared!.count) blocked = true;
      const [count] =
        await tx`select (select count(*) from attachments where workspace_id=${ws.id})+(select count(*) from business_documents where workspace_id=${ws.id})+(select count(*) from report_exports where workspace_id=${ws.id} and object_key is not null)+(select count(*) from import_jobs where workspace_id=${ws.id} and object_key is not null)+(select count(*) from ocr_jobs where workspace_id=${ws.id} and transaction_id is null and status<>'expired') as count`;
      files += Number(count!.count);
    }
    const scopeVersion = createHash("sha256")
      .update(JSON.stringify(workspaces.map((w) => w.id)))
      .digest("hex");
    return {
      workspaces,
      files,
      scopeVersion,
      blocked,
      backupRetentionDays: 35,
      warning:
        "Previously downloaded files and delivered emails cannot be recalled. Retained backups expire within 35 days.",
    };
  });
}
export async function requestDeletion(
  userId: string,
  version: number,
  scopeVersion: string,
) {
  const preview = await deletionPreview(userId);
  if (preview.blocked)
    throw new SecurityError(
      409,
      "Shared ownership requires review before deletion.",
    );
  if (preview.scopeVersion !== scopeVersion)
    throw new SecurityError(
      409,
      "Account scope changed. Review the preview again.",
    );
  const receipt = randomBytes(32).toString("base64url"),
    digest = createHash("sha256").update(receipt).digest("hex");
  // Independent object must be durable before quarantining. A failed storage request does not accept erasure.
  await persistTombstone(
    userId,
    preview.workspaces.map((w) => w.id),
    version + 1,
    "prepared",
  );
  const result = await client.begin(async (tx) => {
    await tx`select set_config('app.user_id',${userId},true)`;
    const [owner] =
      await tx`select id,account_status,security_version from "user" where id=${userId} for update`;
    if (owner?.account_status !== "active")
      throw new SecurityError(409, "Deletion already requested.");
    if (Number(owner.security_version) !== version)
      throw new SecurityError(
        409,
        "Security state changed. Authenticate again.",
      );
    const current =
      await tx`select id from workspaces where owner_user_id=${userId} order by id`;
    if (
      createHash("sha256")
        .update(JSON.stringify(current.map((w) => w.id)))
        .digest("hex") !== scopeVersion
    )
      throw new SecurityError(
        409,
        "Account scope changed. Review the preview again.",
      );
    for (const scope of current) {
      const [members] =
        await tx`select capybudget_other_members(${scope.id}) as count`;
      if (Number(members!.count) > 0)
        throw new SecurityError(
          409,
          "Shared ownership requires review before deletion.",
        );
    }
    const objects = new Set<string>();
    for (const ws of preview.workspaces) {
      await tx`select set_config('app.workspace_id',${ws.id},true)`;
      const rows =
        await tx`select object_key from attachments where workspace_id=${ws.id} union select object_key from import_jobs where workspace_id=${ws.id} and object_key is not null union select object_key from ocr_jobs where workspace_id=${ws.id} union select object_key from business_documents where workspace_id=${ws.id} union select object_key from report_exports where workspace_id=${ws.id} and object_key is not null`;
      rows.forEach((r) => objects.add(r.object_key));
      (
        await tx`select object_key from report_export_cleanup where object_key like ${"%/" + ws.id + "/%"}`
      ).forEach((r) => objects.add(r.object_key));
    }
    (
      await tx`select object_key from privacy_exports where user_id=${userId} and object_key is not null`
    ).forEach((r) => objects.add(r.object_key));
    const [job] =
      await tx`insert into account_deletion_requests(user_id,subject_id,receipt_digest,manifest,workspace_ids)
   values(${userId},${userId},${digest},${JSON.stringify({ encrypted: encryptField(JSON.stringify([...objects]), { purpose: "deletion", owner: userId, entity: userId, field: "manifest" }) })}::jsonb,${JSON.stringify(preview.workspaces.map((w) => w.id))}::jsonb) returning id`;
    for (const key of objects)
      await tx`insert into privacy_cleanup_tasks(request_id,object_key) values(${job!.id},${key})`;
    await tx`insert into deletion_tombstones(subject_id,workspace_ids,generation) values(${userId},${JSON.stringify(preview.workspaces.map((w) => w.id))}::jsonb,${version + 1}) on conflict do nothing`;
    await tx`update privacy_exports set status='cancelled' where user_id=${userId}`;
    await tx`update "user" set account_status='deletion_pending',security_version=security_version+1 where id=${userId}`;
    await tx`delete from session where user_id=${userId}`;
    return job!;
  });
  await persistTombstone(
    userId,
    preview.workspaces.map((w) => w.id),
    version + 1,
  ).catch(() => {});
  return { id: result.id, receipt, status: "quarantined" };
}
export async function runDeletion(id: string) {
  const [job] =
    await client`update account_deletion_requests set status='deleting',attempts=attempts+1,lease_until=now()+interval '5 minutes'
  where id=${id} and attempts<20 and (status in ('quarantined','retryable') or (status='deleting' and lease_until<now())) returning *`;
  if (!job) return;
  const heartbeat = setInterval(
    () =>
      void client`update account_deletion_requests set lease_until=now()+interval '5 minutes' where id=${id} and status='deleting' and attempts=${job.attempts}`.catch(
        () => {},
      ),
    30_000,
  );
  try {
    const [tombstone] =
      await client`select generation from deletion_tombstones where subject_id=${job.subject_id}`;
    await persistTombstone(
      job.subject_id,
      typeof job.workspace_ids === "string"
        ? JSON.parse(job.workspace_ids)
        : job.workspace_ids,
      Number(tombstone?.generation ?? 1),
    );
    const tasks =
      await client`select * from privacy_cleanup_tasks where request_id=${id} and status<>'completed'`;
    for (const task of tasks) {
      await deleteAttachment(task.object_key);
      await client`update privacy_cleanup_tasks set status='completed',attempts=attempts+1 where id=${task.id}`;
    }
    await client`delete from report_export_cleanup where object_key in (select object_key from privacy_cleanup_tasks where request_id=${id} and status='completed')`;
    await purgeSubjectQueues(
      job.subject_id,
      typeof job.workspace_ids === "string"
        ? JSON.parse(job.workspace_ids)
        : job.workspace_ids,
    );
    await eraseSubject(
      job.subject_id,
      typeof job.workspace_ids === "string"
        ? JSON.parse(job.workspace_ids)
        : job.workspace_ids,
    );
    await client`update account_deletion_requests set status='completed',manifest='{}',lease_until=null,completed_at=now(),failure_code=null where id=${id} and attempts=${job.attempts}`;
  } catch (error) {
    if (process.env.SECURITY_INTEGRATION === "1")
      console.error("Cleanup diagnostic:", (error as Error).message);
    await client`update account_deletion_requests set status='retryable',lease_until=null,failure_code='CLEANUP_FAILED' where id=${id} and attempts=${job.attempts} and status='deleting'`;
  } finally {
    clearInterval(heartbeat);
  }
}
export async function eraseSubject(userId: string, workspaceIds: string[]) {
  await client.begin(async (tx) => {
    await tx`select set_config('app.user_id',${userId},true)`;
    for (const ws of workspaceIds) {
      await tx`select set_config('app.workspace_id',${ws},true)`;
      // Actual FK graph determines the order. Each failed attempt rolls back only its savepoint;
      // no constraints, triggers, or tenant policies are disabled.
      const pending = new Set<string>(
        workspaceTables.filter((t) => t !== "workspace_memberships"),
      );
      while (pending.size) {
        let progress = false;
        for (const table of [...pending]) {
          try {
            await tx.savepoint(async (sp) => {
              await sp.unsafe(`delete from "${table}" where workspace_id=$1`, [
                ws,
              ]);
            });
            pending.delete(table);
            progress = true;
          } catch (e) {
            if (
              !["23503", "23001"].includes((e as { code?: string }).code ?? "")
            )
              throw e;
          }
        }
        if (!progress) throw new Error("Unresolved erasure dependency.");
      }
      await tx`delete from workspace_memberships where workspace_id=${ws} and user_id=${userId}`;
      await tx`delete from workspaces where id=${ws} and owner_user_id=${userId}`;
    }
    const [owner] = await tx`select email from "user" where id=${userId}`;
    if (owner)
      await tx`delete from verification where identifier=${owner.email} or identifier like ${"%" + owner.email} or value=${userId}`;
    await tx`delete from report_export_cleanup where object_key in (select object_key from privacy_cleanup_tasks c join account_deletion_requests d on d.id=c.request_id where d.subject_id=${userId})`;
    await tx`delete from privacy_exports where user_id=${userId}`;
    await tx`delete from "user" where id=${userId}`;
  });
}
