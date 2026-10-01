import { client } from "../db";
import { auth } from "../auth";
import { symmetricEncrypt } from "better-auth/crypto";
import {
  protectedText,
  protectedJson,
  protectedContact,
  revealRow,
} from "./business-fields";
import {
  getAttachment,
  putAttachment,
  s3,
  attachmentBucket,
} from "../tracking/storage";
import { ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  decryptPushAuth,
  encryptPushAuth,
} from "../personal-finance/push-crypto";
const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
/** Idempotent field backfill. Run with writes paused; do not run old code after cutover. */
export async function migrateProtectedFields() {
  let rows = 0;
  const workspaces =
    await client`select id,owner_user_id from workspaces order by id`;
  for (const ws of workspaces)
    await client.begin(async (tx) => {
      await tx`select set_config('app.user_id',${ws.owner_user_id},true),set_config('app.workspace_id',${ws.id},true)`;
      const [profile] =
        await tx`select * from business_profiles where workspace_id=${ws.id} for update`;
      if (profile) {
        const p = revealRow(profile, ws.id);
        await tx`update business_profiles set tax_id=${protectedText(p.tax_id, ws.id, ws.id, "tax_id")},contact_email=${protectedText(p.contact_email, ws.id, ws.id, "contact_email")},phone=${protectedText(p.phone, ws.id, ws.id, "phone")},address=${protectedJson(p.address, ws.id, ws.id, "address")}::jsonb where workspace_id=${ws.id}`;
        rows++;
      }
      for (const raw of await tx`select * from invoices where workspace_id=${ws.id} for update`) {
        const inv = revealRow(raw, ws.id);
        await tx`update invoices set recipient_snapshot=${protectedContact(inv.recipient_snapshot, ws.id, inv.id, "recipient_snapshot")}::jsonb,seller_snapshot=${inv.seller_snapshot ? protectedContact(inv.seller_snapshot, ws.id, inv.id, "seller_snapshot") : null}::jsonb,payment_instructions=${protectedText(inv.payment_instructions, ws.id, inv.id, "payment_instructions")} where id=${inv.id}`;
        rows++;
      }
      for (const raw of await tx`select * from invoice_deliveries where workspace_id=${ws.id} for update`) {
        const d = revealRow(raw, ws.id);
        await tx`update invoice_deliveries set recipient_snapshot=${protectedText(d.recipient_snapshot, ws.id, d.id, "recipient_snapshot")},reminder_message_snapshot=${protectedText(d.reminder_message_snapshot, ws.id, d.id, "reminder_message_snapshot")} where id=${d.id}`;
        rows++;
      }
      for (const raw of await tx`select * from invoice_payments where workspace_id=${ws.id} for update`) {
        const p = revealRow(raw, ws.id);
        await tx`update invoice_payments set reference=${protectedText(p.reference, ws.id, p.id, "reference")} where id=${p.id}`;
        rows++;
      }
      for (const raw of await tx`select * from assistant_action_proposals where workspace_id=${ws.id} for update`) {
        const p = revealRow(raw, ws.id);
        await tx`update assistant_action_proposals set payload=${protectedJson(parse(p.payload), ws.id, p.id, "payload")}::jsonb where id=${p.id}`;
        rows++;
      }
      for (const raw of await tx`select * from audit_logs where workspace_id=${ws.id} and entity_type in ('invoice','business_profile') for update`) {
        const a = revealRow(raw, ws.id);
        await tx`update audit_logs set "before"=${a.before ? protectedJson(parse(a.before), ws.id, a.entity_id, "before") : null}::jsonb,"after"=${a.after ? protectedJson(parse(a.after), ws.id, a.entity_id, "after") : null}::jsonb where id=${a.id}`;
        rows++;
      }
      for (const subscription of await tx`select * from push_subscriptions where workspace_id=${ws.id} for update`) {
        const plain = decryptPushAuth(subscription.auth, {
          workspaceId: ws.id,
          userId: subscription.user_id,
          endpoint: subscription.endpoint,
        });
        await tx`update push_subscriptions set auth=${encryptPushAuth(plain, { workspaceId: ws.id, userId: subscription.user_id, endpoint: subscription.endpoint })} where id=${subscription.id}`;
        rows++;
      }
    });
  const context = await auth.$context;
  for (const account of await client`select id,access_token,refresh_token,id_token from account where access_token is not null or refresh_token is not null or id_token is not null`) {
    for (const field of ["access_token", "refresh_token", "id_token"]) {
      const value = account[field];
      if (value && !value.startsWith("$ba$")) {
        const encrypted = await symmetricEncrypt({
          key: context.secretConfig,
          data: value,
        });
        await client.unsafe(`update account set "${field}"=$2 where id=$1`, [
          account.id,
          encrypted,
        ]);
        rows++;
      }
    }
  }
  let continuation: string | undefined,
    objects = 0;
  do {
    const listing = await s3.send(
      new ListObjectsV2Command({
        Bucket: attachmentBucket,
        ContinuationToken: continuation,
      }),
    );
    for (const object of listing.Contents ?? []) {
      if (!object.Key) continue;
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: attachmentBucket, Key: object.Key }),
      );
      if (head.Metadata?.["capybudget-encryption"] === "1") continue;
      const file = await getAttachment(object.Key),
        bytes = await file.Body!.transformToByteArray();
      await putAttachment(
        object.Key,
        bytes,
        file.ContentType ?? "application/octet-stream",
      );
      objects++;
    }
    continuation = listing.NextContinuationToken;
  } while (continuation);
  return { rows, objects };
}
if (import.meta.main) {
  try {
    console.log(JSON.stringify(await migrateProtectedFields()));
  } finally {
    await client.end();
  }
}
