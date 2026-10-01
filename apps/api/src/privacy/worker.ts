import { client } from "../db";
import { deleteAttachment } from "../tracking/storage";
import { runPrivacyExport } from "./exports";
import { runDeletion } from "./deletion";
export async function privacySweep() {
  const jobs =
    await client`select id from privacy_exports where attempts<5 and expires_at>now() and (status='queued' or (status='running' and lease_until<now())) order by created_at limit 5`;
  for (const job of jobs) await runPrivacyExport(job.id);
  const deletions =
    await client`select id from account_deletion_requests where attempts<20 and (status in ('quarantined','retryable') or (status='deleting' and lease_until<now())) limit 5`;
  for (const job of deletions) await runDeletion(job.id);
  const expired =
    await client`select id,object_key from privacy_exports where expires_at<now() and status<>'expired' limit 20`;
  for (const job of expired) {
    if (job.object_key) await deleteAttachment(job.object_key);
    await client`update privacy_exports set status='expired',object_key=null where id=${job.id}`;
  }
  await client`delete from session where id in (select id from session where expires_at<now() limit 500)`;
  await client`delete from verification where id in (select id from verification where expires_at<now() limit 500)`;
  await client`delete from account_deletion_requests where status='completed' and completed_at<now()-interval '35 days'`;
  await client`delete from deletion_tombstones where expires_at<now()`;
  await client`delete from security_challenges where expires_at<now()`;
  await client`delete from factor_replays where expires_at<now()`;
}
if (import.meta.main) {
  for (;;) {
    try {
      await privacySweep();
    } catch {
      console.error("Privacy sweep failed.");
    }
    await Bun.sleep(10_000);
  }
}
