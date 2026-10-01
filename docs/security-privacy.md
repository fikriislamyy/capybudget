# Security and privacy MVP — issue 13

## Local setup

The user selected local SeaweedFS for backups and will configure deployment S3 later. The Docker `backup` profile uses `capybudget-backups`, independently from the live `capybudget` bucket. Both remain on this local host; this configuration does not protect against losing the host.

The implementation uses server-side field encryption. Authorized API/worker processes can decrypt protected values; this is not end-to-end encryption.

1. Install dependencies with `bun install`.
2. Configure `.env` (never commit it):
   - `BETTER_AUTH_SECRET`: random secret, at least 32 characters.
   - `PIN_PEPPER`: a separate random secret, at least 32 characters.
   - `FIELD_ENCRYPTION_ACTIVE_KEY=local-v1`.
   - `FIELD_ENCRYPTION_KEYS={"local-v1":"<base64 random 32 bytes>"}`. Generate each key with `openssl rand -base64 32`.
   - Retain `EMAIL_JOB_ENCRYPTION_KEY` for historical email/push payloads during migration.
   - `WEB_ORIGIN` and `BETTER_AUTH_URL` must match the public web origin. Localhost works with WebAuthn; deployed origins require HTTPS.
3. Start services: `docker compose up -d`; apply additive migrations with `bun run db:migrate`.
4. Pause API and workers while migrating existing protected data:
   ```sh
   ALLOW_PLAINTEXT_FIELDS=1 ALLOW_PLAINTEXT_OBJECTS=1 bun --env-file=.env apps/api/src/security/migrate-fields.ts
   ```
   Keep those migration flags unset when running the application. Missing keys, wrong owner/entity/field, damaged ciphertext and unmigrated private objects fail closed.
5. Start API and all local workers with `bun run dev`, and the web app with `bun run dev:web`. `bun run dev:privacy-worker` runs just the durable export/deletion worker.
6. Enable daily encrypted backups:
   ```sh
   docker compose --profile backup up -d --build backup
   docker compose logs --tail=30 backup
   ```
   The service performs a restore drill into a disposable database and bucket once per calendar month. It records failures, retries after five minutes, and cleans its temporary resources. Privacy settings show backup freshness and restore outcome.

Local secrets were generated in the ignored `.env` during implementation. The live database migrations and existing-object backfill were applied. Restart an already-running API/web process to load the changes.

## User flows

- `/settings/security`: enroll an authenticator, verify the first TOTP, acknowledge/store recovery codes; change/remove the app PIN; register/remove platform WebAuthn credentials; inspect and revoke sessions/devices.
- `/two-factor`: complete password login with an authenticator or an unused recovery code. Email OTP verifies signup and cannot replace MFA. Trusted-device MFA bypass and passwordless WebAuthn login are disabled.
- PIN is 6–8 digits, Argon2id with a separate pepper, usable only for the current authenticated browser. Five failures cause a 15-minute cooldown; ten disable quick unlock until full authentication.
- Lock conceals finance on backgrounding, manual lock, idle expiry (five minutes), and absolute unlock expiry (15 minutes). The API and SSR enforce lock independently of browser storage. Human interaction renews inactivity, but never the absolute lease. Reloading may require unlock.
- “Use device security” requires WebAuthn user verification. The operating system may use fingerprint, face, or its device PIN; the app stores public credentials, not biometric templates. Unsupported/cancelled authenticators fall back to PIN/full authentication.
- Sensitive operations require password plus MFA when enabled, using a session/purpose/version-bound single-use grant valid for five minutes. PIN and device unlock cannot authorize those operations. TOTP replay and reused recovery codes are rejected.
- `/settings/privacy`: hide amounts across finance pages, download a complete account ZIP, review deletion scope and explicitly confirm `DELETE MY ACCOUNT`. A private downloadable receipt permits status checks after sessions are revoked.
- Account exports include personal and owned business records, archived/soft-deleted records, retained files, relationships and exact decimal strings. Authentication secrets and push endpoints are omitted. Archives expire physically after 24 hours; downloads require fresh full authentication.
- Deletion quarantines the account, revokes sessions, fences financial writes, cancels/removes queues and recurring schedulers, deletes objects and rows in dependency order, and resumes durable cleanup after failures. Shared workspaces with another member require review. Already-delivered email/downloads cannot be recalled.
- Online devices refresh authenticated finance data on focus and periodically while visible. Version conflicts and idempotency use existing finance contracts. Offline editing is not supported; failed requests never represent a successful save. Browser storage failure keeps privacy masking enabled.

## Protected data inventory

AES-256-GCM envelopes have a version, key ID, nonce, tag and ciphertext. Version 2 derives independent keys per purpose with HKDF. Additional authenticated data binds purpose, owner, entity and field. Historical version 1 envelopes remain readable with their original key.

Protected fields: business address/contact email/phone/tax ID; invoice contact snapshots and payment instructions; invoice payment references and delivery/reminder copies; sensitive business audit snapshots; assistant action previews; push authentication material (bound to user/workspace/endpoint); queued email payloads; all private S3 object bodies; privacy archives and deletion manifests; backup artifacts. Better Auth protects TOTP/recovery secrets and provider tokens using its supported encryption.

Ordinary names, searchable transaction data, financial amounts and database indexes are not field-encrypted. Deployments must additionally protect PostgreSQL/Redis/object volumes and temporary directories with encrypted disks, TLS, private networking and a secret manager.

The explicit account inventory is `apps/api/src/privacy/inventory.ts`. New workspace tables must be added there and reviewed for export, erasure, duplicates, FKs, files and restoration. No global FK/RLS disabling is used for erasure.

Exports are bounded to 64 MiB of records plus file contents; larger accounts receive `EXPORT_TOO_LARGE` rather than an incomplete archive. Backups default to 128 MiB of dump plus referenced files (`BACKUP_MAX_BYTES`). These are engineering bounds for the current local workload; increase capacity or implement streaming before exceeding them.

## Key rotation and recovery

1. Pause writers and take a verified backup with the current keys.
2. Add a new random key ID to `FIELD_ENCRYPTION_KEYS` on API, workers and backup service. Keep all historical keys.
3. Change `FIELD_ENCRYPTION_ACTIVE_KEY` to the new ID; restart processes together. New writes use it immediately.
4. Run the field migration with writers paused to re-encrypt selected database fields. Existing encrypted object bodies and backup artifacts keep their historical IDs. Keep old keys until those objects are explicitly rewritten and every retained backup/job requiring the key has expired. Do not remove keys merely because database rotation finished.
5. Repeat an isolated restore with the complete keyring. Losing historical keys makes affected ciphertext unrecoverable. Store keys separately from encrypted backups; `.env` is not backed up in the artifact.
6. Rotate `BETTER_AUTH_SECRET` or `PIN_PEPPER` only as a planned security operation: invalidate sessions, re-enroll PINs, and account for Better Auth factor/token encryption. Never silently change either during deployment.

## Backup and restore runbook

Daily backups hold a PostgreSQL repeatable-read snapshot for `pg_dump --snapshot` and the referenced file set, with exact ledger totals, schema version, file checksums and key IDs. Uploaded ciphertext is read back and checked. Retention keeps one artifact per day for seven days and one per week thereafter, with a maximum of 35 days. Independent deletion tombstones are replayed before serving restored data.

To restore, create a new empty database whose name ends in `_test`, and select a separate S3 bucket ending in `-restore-test`. Never use the live database/bucket:

```sh
docker compose exec -T postgres createdb -U capybudget capybudget_recovery_test
DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_recovery_test \
S3_BUCKET=capybudget-recovery-restore-test RESTORE_ISOLATED=1 \
bun --env-file=.env infra/backup/backup.ts restore backups/YYYY-MM-DD/UUID.enc
```

The restore checks counts and exact debit/credit totals, applies current additive migrations, replays independent confirmed tombstones, validates/re-encrypts retained files into the isolated bucket, invalidates old sessions/challenges/reset tokens/export links, and suppresses historical email/push outboxes. The tool refuses a nonempty database or live-looking target. Delete the disposable target after reviewing evidence.

Inspect `backup_runs`, `backup_restore_checks`, service logs and the Privacy backup status. Treat missing/stale backups (>26 hours), failed restores, `BACKUP_OR_RESTORE_FAILED`, and `RESTORE_TEMP_CLEANUP_REQUIRED` as operator incidents. Fix the cause and repeat the drill. RPO target is 24 hours; RTO target is four hours. Local fixture restores completed in under two seconds; this is not a production-scale recovery guarantee.

For deployment, set `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, and separate `BACKUP_S3_ACCESS_KEY_ID`/`BACKUP_S3_SECRET_ACCESS_KEY` in a secret manager. Override the local Compose backup destination, use least-privilege API/worker versus backup/restore credentials, encrypted disks and TLS, and connect backup failure/freshness monitoring to the operational owner. Keep SeaweedFS local until that deployment configuration is supplied, as requested.

## Failed privacy jobs and rollout

Export/deletion state, attempts, leases, object cleanup checkpoints and receipts are durable in PostgreSQL, so Redis failure cannot lose the request. Deletion waits for storage and queue cleanup; a still-running locked job causes retry under the account fence. Exports retry crashed leases, expire in 24 hours, and never publish “ready” when a file/checksum is missing. Delete failures remain visible as retryable; after repairing the dependency, an operator can reset attempts on that specific job and restart the privacy worker. Do not unquarantine the owner or disable constraints to force completion.

Completed deletion receipt/task metadata expires after 35 days. Independent tombstones remain until the corresponding backup window expires. Never restore an old database without the independent tombstone bucket. Keep S3 versioning disabled for this local setup; a versioned deployment must add version-aware erasure/lifecycle policies before accepting deletion.

Migrations 0020–0023 are additive. Apply with old writers paused, backfill protected data, then start only the new application. Roll forward on failure. Rolling back to code that reads/writes plaintext or ignores quarantine is unsafe; for a full rollback use an isolated restore and replay tombstones before any traffic. Current migrations are maintained as SQL/journal entries; review Drizzle-generated diffs because earlier project migrations used manual SQL.

## Verification and remaining release checks

Automated coverage includes cryptographic owner/field tampering and key rotation; pending MFA/login/replay/recovery; single-use grants; PIN cooldown/ten-failure policy and server leases; session revocation; invalid/replayed/cross-session WebAuthn; a normal non-superuser database role with forced RLS isolation; populated multi-business export and erasure after storage failure; ordinary finance/notification regressions; Mailpit signup/reset; virtual platform WebAuthn, masking, 360px layout, language/theme, two-browser refresh, offline notice and denied browser storage; encrypted backup and isolated restore/tombstone replay.

Physical iOS/Android/desktop authenticator prompts have not been exercised in this workspace. Before a public release, record platform/browser/version, successful enrollment/unlock, cancellation, unsupported-browser fallback, wrong RP/origin rejection, absent user verification and credential removal on actual supported hardware. Deployment disk encryption, off-host S3 credentials/durability and production recovery/alert routing also require the deployment environment. Those checks are not claimed complete by local automation.

### Local evidence (2026-10-01)

- `bun run check`: zero errors/warnings; API type check passed.
- `bun run build`: production web/PWA build passed.
- Finance regression: 473 assertions passed.
- Security integration under a non-superuser role with RLS: 115 assertions passed, including concurrent recovery-code reuse (exactly one success).
- Populated account ZIP/erasure: 117 assertions passed, including ZIP manifest/decimal/file checksum validation and retry after simulated storage failure.
- Notification delivery and migration regressions: 105 assertions passed.
- Browser suite: two flows passed (existing auth/finance/notification flow and new security/privacy flow).
- Encrypted backup restored a retained attachment and exact ledger totals in 1.104 seconds. Restoring the same artifact after deletion completed in 1.176 seconds, with zero resurrected subject/attachment/session rows.
- Queue cleanup removed the erased subject from 600 jobs across multiple states and preserved all 300 jobs belonging to another user; fresh migration through 0023 passed.
- Daily local backup service is running; automatic monthly isolated restore passed. Disposable test workers, databases and restore buckets were cleaned up after verification.

Integration tests require an explicitly disposable `*_test` database and isolated nonzero Redis database. Set `SECURITY_INTEGRATION=1` for API security flows, `SECURITY_RLS=1` when using a restricted database role, `POPULATED_PRIVACY_INTEGRATION=1` after seeding the finance regression fixture, and `BACKUP_SECURITY_INTEGRATION=1` with a `*-test` backup bucket for the retained-file backup fixture. The ZIP integration inspection uses local `unzip`. Default `bun run test:security` runs cryptographic unit checks; integration flags opt into destructive disposable-data checks.
