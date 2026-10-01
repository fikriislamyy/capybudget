import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
export const backupBucket =
  process.env.BACKUP_S3_BUCKET || "capybudget-backups";
export const backupS3 = new S3Client({
  endpoint:
    process.env.BACKUP_S3_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    "http://localhost:8333",
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId:
      process.env.BACKUP_S3_ACCESS_KEY_ID ||
      process.env.S3_ACCESS_KEY_ID ||
      "minioadmin",
    secretAccessKey:
      process.env.BACKUP_S3_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_ACCESS_KEY ||
      "minioadmin",
  },
});
export async function ensureBackupBucket() {
  try {
    await backupS3.send(new CreateBucketCommand({ Bucket: backupBucket }));
  } catch (e) {
    if (
      !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(
        (e as Error).name,
      )
    )
      throw e;
  }
}
export async function persistTombstone(
  subjectId: string,
  workspaceIds: string[],
  generation: number,
  status = "confirmed",
) {
  await ensureBackupBucket();
  await backupS3.send(
    new PutObjectCommand({
      Bucket: backupBucket,
      Key: "tombstones/" + subjectId + ".json",
      Body: JSON.stringify({
        version: 1,
        status,
        subjectId,
        workspaceIds,
        generation,
        deletedAt: new Date().toISOString(),
        backupExpiresAt: new Date(Date.now() + 35 * 86400000).toISOString(),
      }),
      ContentType: "application/json",
    }),
  );
}
