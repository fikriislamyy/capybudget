# Security and Privacy — implementation plan

## 1. Goal and completion rule

Implement the Security and Privacy MVP for CapyBudget's personal and business workspaces. This document is a plan for a junior programmer or a coding model; unchecked work is not implemented work.

Read `PRD.md` and `DESIGN.md` before starting. The repository uses `PRD.md`, not `PRD.MD`.

Relevant requirements:

- PRD §6.1: FR-AUTH-3 TOTP, FR-AUTH-4 PIN/biometric lock, FR-AUTH-6 sessions/devices, FR-AUTH-9 export/deletion.
- PRD §6.6: FR-RPT-9 privacy mode; §7: exact money, auditability, hard deletion for account deletion.
- PRD §9.2–9.7: tested backups, encryption, tenant isolation, privacy, accessibility, EN/ID, browser support.
- PRD §8: granular AI consent and minimization; §10: existing modular monolith and PWA-first architecture.
- DESIGN §3, §7–§9, §11, §13: semantic colors, dark mode, 44px targets, reduced motion, clear security copy, accessible controls.

The user's priority table governs this issue: session/device management and regular backups/cloud sync are MVP even where the PRD assigns a lower priority. Finish every MVP milestone and acceptance check before reporting 100%. A configured plugin, an encryption helper, a Docker volume, or a successful backup upload alone does not complete the corresponding feature.

## 2. Feature scope

| Feature | Priority | Concrete deliverable |
|---|---|---|
| PIN, biometric, and 2FA | MVP | Optional per-browser app lock with PIN and supported platform WebAuthn verification; account-wide TOTP enrollment, login challenge, recovery codes, and removal |
| End-to-end or field-level encryption | MVP | Field-level encryption for the sensitive inventory below; protected database/object storage/backups and documented key rotation |
| Secure session and device management | MVP | View active sessions and registered browsers, revoke current/other/all sessions, remove unlock credentials, enforce recent authentication |
| Data export and account deletion | MVP | Complete account data archive and a resumable account erasure workflow covering all owned workspaces, files, caches, and jobs |
| Regular backups and cloud sync | MVP | Automated daily backups, off-host retention, tested restores, and authenticated online synchronization across devices |
| Privacy mode | MVP | One consistent hide-amounts control across every financial screen and accessible representation |
| Read-only bank connections | V2 | Read-only aggregator consent, encrypted provider tokens, revocation, and import provenance |
| Audit logs for business accounts | V2 | Searchable, authorized business audit history extending existing audit records |
| GDPR, local data protection laws, and PCI where applicable | V2 | Formal applicability review and compliance operations; basic privacy/security obligations still apply at MVP launch |

### 2.1 Decisions to use during implementation

1. **Choose field-level encryption for MVP.** The API must calculate forecasts, reports, and reminders. Authorized server processes will decrypt selected fields. Do not describe this as end-to-end encryption or claim that the operator cannot read data. A future E2EE design would require different search, recovery, collaboration, and server computation behavior.
2. **Keep Better Auth as the identity/session authority.** Use its TOTP plugin. Keep signup verification OTP separate from the second factor.
3. **Treat the app PIN as an unlock credential for an existing authenticated session.** It cannot sign into an account, satisfy TOTP, authorize deletion/export, or reset account security.
4. **Use WebAuthn platform user verification for PWA biometric unlock.** The OS may use a fingerprint, face, or device PIN; the web app cannot guarantee a biometric was used and must not collect biometric templates. Present “Use device security,” explaining the possible OS prompts. Unsupported browsers get the PIN/full-login fallback. [WebAuthn reference](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
5. **Make biometric unlock a separate, session-bound WebAuthn ceremony using a maintained verifier.** Recommended: `@simplewebauthn/server` and its browser client after a Bun compatibility check. Do not enable passwordless sign-in as a shortcut to unlocking: it could introduce a path around TOTP. Reuse these credential records if full passkey sign-in is added later; do not create two credential stores. [Verifier documentation](https://simplewebauthn.dev/docs/packages/server)
6. **Online cloud sync is MVP.** PostgreSQL and private object storage are the source of truth. After a successful write, other signed-in devices refresh through existing authenticated APIs. Offline financial editing and a persistent offline replica are a separate synchronization project; the PWA must clearly show when it is offline and cannot save.
7. **Proposed engineering defaults:** 6–8 digit PIN; idle lock after 5 minutes; maximum unlock lease 15 minutes; immediate concealment on backgrounding; recent full authentication within 5 minutes for sensitive actions; challenge expiry 5 minutes; export download availability 24 hours; daily backups with a 24-hour RPO and 4-hour RTO. These are product/operational defaults, not statutory deadlines.
8. **MVP deletion covers the current ownership model:** one personal workspace and zero or more solely owned businesses. If a future/shared membership or unresolved retention hold exists, identify it in the preview and stop before acceptance; never silently erase another member's records.

## 3. Existing implementation to reuse and gaps to close

Repository inspection baseline: 2026-10-01. Recheck these paths when implementing; do not assume earlier issue completion means this security issue is done.

| Existing area | Observed baseline | Required work |
|---|---|---|
| `apps/api/src/auth.ts` | Better Auth email/password, hashed verification OTPs, password reset with session revocation, 7-day sessions; cookie cache disabled; only `emailOTP` plugin configured | Add TOTP lifecycle and recovery; enforce freshness and pending-deletion state on all authentication paths |
| `apps/web/src/lib/auth-client.ts` and auth pages | Svelte client with email OTP and 429 feedback | Add second-factor challenge, security settings, and unlock UI without full-page locale changes |
| `apps/api/src/db/schema.ts` | `user`, `session`, auth `account`, `verification`, workspaces/memberships; financial tables and `audit_logs` | Reuse these tables; add security/privacy job state and plugin schema through reviewed migrations |
| `apps/api/src/auth/rate-limit.ts`, `apps/api/src/app.ts` | Redis auth limiter plus Better Auth memory limiter; trusted proxy handling | Add factor/PIN/challenge limits, coordinate duplicate limiter behavior, preserve trusted-IP rules |
| `apps/api/src/email/{crypto,queue,processor}.ts` | Encrypted queued email and durable delivery checks | Preserve existing job compatibility; add deletion/fencing checks and versioned key handling |
| `apps/api/src/personal-finance/push-crypto.ts` | AES-GCM push secret encryption currently shares `EMAIL_JOB_ENCRYPTION_KEY` | Separate purposes/keys and support migration/rotation without breaking existing subscriptions |
| `apps/api/src/tracking/storage.ts`, business and report storage paths | S3-compatible private application files; local Compose uses SeaweedFS | Verify object access controls, encryption configuration, backups, cleanup, and signed-link exposure |
| `apps/api/src/assistant/routes.ts` | Assistant-only export and assistant-data deletion | Keep those controls; add full account export/deletion covering finance, identity, files, and derived data |
| `apps/api/src/reports/` | Report exports and cleanup job patterns | Reuse bounded job/lease/cleanup patterns, not report-specific schemas as a complete privacy export |
| `apps/web/src/lib/privacy.ts` | Local hide-amounts preference, shared event and legacy reports key | Extend to all screens, charts, tooltips, accessibility labels, SSR/hydration, and tabs |
| `apps/web/vite.config.ts`, `apps/web/static/push-worker.js` | PWA configuration and push; a navigation denylist is not a full cache policy | Audit every authenticated route, API response, Cache Storage entry, and offline fallback |
| `docker-compose.yml` | PostgreSQL 18 data mounted at `/var/lib/postgresql`, Redis AOF, Mailpit, SeaweedFS volume; no scheduled backup service | Add backup schedule, off-host artifacts and restore drill; do not treat volumes or Redis AOF as a backup |
| `apps/api/src/db/cleanup-expired-auth.ts` | Batched expiry cleanup for sessions/verifications | Schedule it and include challenge, security-state, export, and privacy artifact cleanup |

Important distinctions: auth `account` stores login-provider credentials; financial `accounts` stores wallets. `audit_logs` already contains financial before/after snapshots. Those snapshots and `idempotency_keys.response_body` can duplicate sensitive plaintext and belong in the encryption/deletion inventory.

## 4. Security behavior and policy

### 4.1 Authentication, unlocking, and recent verification

Implement three explicit states: unauthenticated; authenticated but app-locked; authenticated and unlocked. TOTP-pending login is unauthenticated for all finance APIs.

- TOTP enrollment requires recent full authentication, a locally rendered QR code, and a valid first authenticator code before enabling the factor. Never send the QR secret to an external image service.
- Use Better Auth's supported server/client plugin APIs and generated schema for the installed version. The lockfile currently resolves Better Auth 1.7.6; verify compatibility rather than copying examples from a different release.
- Better Auth's default TOTP challenge does not cover every non-password sign-in method. Test every enabled method and hook. For MVP keep existing email/password sign-in plus TOTP; do not accidentally add OAuth/passkey bypasses. [Better Auth TOTP documentation](https://better-auth.com/docs/plugins/2fa)
- Recovery codes are high-entropy, single use, consumed atomically, and displayed only through a protected flow. Use the plugin's supported secure storage option; inspect its actual storage behavior. Do not replace it with plaintext or silently break its verification adapter.
- TOTP secrets must be recoverable by the verifier and therefore encrypted, not irreversibly hashed. App PINs and account passwords must be salted password hashes, never decryptable fields. Use a maintained Argon2id implementation for new PIN hashes, with a separate server pepper and benchmarked parameters; keep existing Better Auth password hashes compatible. [Password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- Verify/reject replayed TOTP time steps and simultaneous recovery-code use; determine whether the plugin supplies this behavior. If additional replay state is needed, keep it in the same atomic verification flow.
- Proposed PIN policy: five failures cause a 15-minute device/user cooldown; ten consecutive failures disable quick unlock until full login. Enforce counts across processes, by both account/device and trusted source IP. No browser refresh, new challenge, or Redis restart may reset a durable lockout.
- Forgotten PIN: full login with the enabled second factor, then reset the PIN. Lost authenticator: recovery code. Do not implement an email-only reset that silently removes MFA; show a clear recovery/support path if all factors are lost.
- Disabling TOTP, regenerating recovery codes, registering/removing unlock credentials, changing password/email, exporting, deleting the account, and revoking all other devices require recent full authentication. A PIN unlock never supplies that proof. A login timestamp or ordinary session refresh is not proof of recent password/factor verification.
- Issue a short-lived, purpose-bound, one-use step-up grant after verification. Bind it to user, current session, security version, and intended operation. Consume it atomically with the operation; reject reuse for a different action.
- Disable trusted-device MFA bypass for the initial release. If later enabled, document its lifetime and revocation semantics separately from app unlock.

### 4.2 App lock and device boundary

Use an opaque, random browser registration cookie and server-side session association. A device name/user agent is a display hint, not identity. Do not fingerprint hardware or infer trust from an IP address.

- Enabling PIN or biometric unlock requires a valid full session and recent verification. Store the PIN hash per registered browser/user pair.
- The financial API guard reads the session's bound device and lock state from the server. Clearing localStorage or the browser registration cookie must not convert an existing locked session to an unlocked one.
- Idle checks happen server-side. Background polling cannot extend the unlock lease; successful PIN/WebAuthn verification may renew it. The 15-minute maximum lease bounds renewal based on ordinary activity.
- On hide/background/manual lock, immediately remove financial content, stop polling, discard sensitive client state, and request server lock. Lock all tabs sharing that session; sync concealment through `BroadcastChannel` or storage events without transmitting financial data or credentials.
- Before rendering after resume, navigation, or reload, obtain lock status and only then load protected data. The guard must cover API routes, SSR loaders, file/PDF downloads, assistant endpoints, export status/downloads, and business routes. A Svelte overlay alone is insufficient.
- Allow only a small explicit set of routes while locked: minimal lock status, rate-limited unlock, full reauthentication, logout, and public health/static assets. Security mutations still require step-up.
- WebAuthn assertions must validate the exact expected challenge, RP ID, origin, user verification, credential owner, current session/device, expiry, and purpose. Consume challenges once; update counters atomically using the library's semantics for synced credentials. Use HTTPS in deployed environments and an explicit development localhost configuration.
- No fake “biometric success” buttons or automatic PIN submission. Handle cancellation, unavailable authenticator, revoked credential, and unsupported browser with an accessible fallback.
- This web lock reduces exposure on an unattended browser. It cannot protect against a compromised OS, malicious extensions, or code executing inside the authenticated origin. Do not advertise native secure-hardware/offline-vault guarantees.

### 4.3 Session and device management

Reuse Better Auth's authoritative sessions and revocation behavior. Build a server adapter that returns safe IDs/labels, creation/expiry/last activity and a current-session marker. Do not expose reusable session tokens through a general device-list response. [Session APIs](https://better-auth.com/docs/concepts/session-management)

- Separate “sign out this session,” “sign out other sessions,” and “remove this browser and its unlock credentials.” Revoking one session must not unexpectedly remove every credential; removing a browser must revoke all its linked sessions and push endpoints.
- Verify ownership before looking up the internal token needed by library revocation APIs. Never accept a caller-supplied user ID or session token for arbitrary revocation.
- Password reset, credential recovery, and security-setting changes invalidate affected sessions/unlock grants. Keep cookie caching disabled unless revocation remains immediate and is demonstrated.
- Finance requests and background jobs check `account_status` and a monotonic security/deletion generation. CORS alone is not CSRF protection: protect cookie-authenticated mutations with trusted Origin/CSRF checks, including custom security routes.
- Production cookies remain Secure, HttpOnly, SameSite; reject untrusted forwarded IP headers and mismatched origins. Use TLS and separate migration, API, worker, and backup database roles. The API role must not own tables or have `BYPASSRLS`.
- Record small security events with IDs, action, outcome, timestamp, and coarse device context. Do not log PINs, passwords, cookies, codes, QR URIs, decrypted fields, or exported contents.

## 5. Data protection and encryption inventory

Create a reviewed inventory before changing schema: field, owner, current readers/writers, duplicates, required search behavior, new representation, retention, and migration state. Do not encrypt an indexed search field without planning its readers.

| Data | MVP treatment |
|---|---|
| Passwords and app PINs | Salted password hashes; new PIN pepper held outside the database; no reversible encryption |
| TOTP secret and recovery material | Plugin-compatible encrypted secret and secure recovery-code storage; explicit key/version compatibility |
| OAuth access/refresh/ID tokens in auth `account` | Protect existing non-null secrets through a supported adapter/plugin mechanism; no double encryption that breaks Better Auth; no new OAuth feature required |
| Push subscription secret and queued email payload | Preserve existing encryption; introduce independent purpose keys, version tags, AAD, rotation, and legacy readers |
| `business_profiles.tax_id`, address/contact bundle | Encrypted protected bundle; expose decrypted values only to authorized business screens and invoice generation |
| Invoice seller/recipient snapshots, recipient delivery snapshot, payment instructions/reference | Encrypt protected contact/tax/payment details, including immutable issued snapshots; preserve invoice version and financial totals |
| Account/bank identifiers | Do not add collection solely for this issue. Encrypt identifiers wherever present; store only needed display fragments. A wallet's “credit card” label does not justify collecting card credentials |
| Transaction notes/merchant and other ordinary finance content | Covered by database/storage encryption at rest and normal authorization. Treat as private data; do not promise every column is individually encrypted. Inventory users placing identifiers in free text and minimize propagation |
| `audit_logs.before/after`, idempotency responses, forecast/report snapshots, notification evidence, invoice/reminder copies | Remove unnecessary protected values or encrypt their nested protected payload. Prevent plaintext copies of fields chosen for field encryption |
| Receipts, attachments, logos, invoice PDFs, report/privacy archives | Private objects, authenticated downloads, verified storage encryption at rest; encrypted backup copies. PDFs may intentionally contain authorized recipient details |
| Financial amounts, dates, currency, ledger relationships | Preserve `NUMERIC` and authorized SQL calculations; never convert to floating point or encrypt amounts in a way that silently breaks totals |

Use a versioned authenticated encryption envelope such as `{version, keyId, algorithm, nonce, ciphertext, tag}`. Recommended algorithm: AES-256-GCM through a maintained implementation, a fresh 96-bit nonce per encryption, and authenticated associated data binding purpose, user/workspace, entity ID, and field name. Moving ciphertext to another tenant/field must fail authentication. Missing keys and tampered data fail closed, with a safe error rather than a plaintext fallback. [Cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Keep the active write key and historical read keys in an external secret manager/KMS in production. Development uses separately generated secrets outside Git. Key IDs and KMS references are metadata; never store unwrapped encryption keys in the same database they protect. Separate auth, field, email, push, PIN-pepper, and backup purposes. Define rotation, recovery, access, and retirement procedures, including which historical keys each retained backup needs. [Key management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Migration sequence: add nullable protected columns/envelopes → deploy version-aware readers and encrypted new writes → backfill in bounded batches → compare authorized decrypted values and financial outputs → remove plaintext duplicates and fallback paths → retire obsolete readers/keys only after backup retention permits. During the transition, document where plaintext still exists. Do not mark encryption complete while a live duplicate remains unprotected.

At-rest infrastructure encryption is a separate deliverable: verify PostgreSQL host volume, S3 provider/storage volume, Redis persistence where sensitive metadata exists, and backup destination encryption. An HTTPS S3 endpoint or an arbitrary `ServerSideEncryption` request does not prove the local SeaweedFS service encrypts its disk. Choose supported storage encryption or encrypted host volumes and record evidence for the actual deployment.

## 6. Required and suggested tables

Use the existing Drizzle schema and additive migrations after the repository's latest migration. Do not edit already-applied migrations or create a second users/sessions model. Names below are proposed application names; plugin-owned names must match the installed plugin's generated schema.

### 6.1 Extend existing tables

| Table | Proposed changes | Purpose and constraints |
|---|---|---|
| `user` | Plugin `twoFactorEnabled` field; `account_status` (`active`, `deletion_pending`), `security_version` integer, deletion-request timestamp | One account lifecycle source. Defaults keep existing accounts active and factors disabled until verified |
| `session` | Retain Better Auth fields and lifecycle | Do not change token storage/adapter semantics casually; use companion security state below |
| Auth `account`, business/invoice/delivery snapshot tables | Protected fields/envelopes from §5 | Preserve provider compatibility and immutable invoice meanings; never create plaintext backup columns as the final design |
| `push_subscriptions` | Nullable `device_registration_id` with scoped ownership constraint | Enables per-browser removal; migrate legacy subscriptions without claiming their device is known |
| `audit_logs` | Protect/minimize sensitive before/after fields as needed | Keep current financial audit evidence; business audit UI is V2 |
| `attachments`, `business_documents`, `report_exports` | Reuse object keys, checksums and lifecycle; add encryption/key metadata only where needed | Reuse file cleanup machinery and track object versions when storage versioning is enabled |

### 6.2 New MVP tables

| Table | Essential fields | Purpose / indexes / ownership |
|---|---|---|
| Plugin `two_factor` | Generated ID, user FK, encrypted secret, secure backup-code representation and plugin-required fields | Follow actual plugin schema; index user lookup. Add accepted TOTP time-step state only if required for replay protection |
| `user_security_settings` | `user_id` PK/FK, `privacy_mode_default`, `default_auto_lock_seconds`, `version`, timestamps | Account defaults only; unlocking state belongs to a session. Optimistic version checks |
| `device_registrations` | UUID, user FK, digest of random registration token, label, coarse browser info, optional PIN hash/pepper version, lock-enabled flag, failed count, cooldown, created/last seen/revoked timestamps | No raw browser secret or hardware fingerprint. Unique token digest; `(user_id,id)` unique; user/last-seen index |
| `session_security_state` | Session PK/FK, user FK, device FK, `locked_at`, `unlocked_until`, `last_activity_at`, `last_full_auth_at`, `mfa_verified_at`, `security_version` | Server lock/freshness state. Composite owner constraints prevent linking a foreign session/device. Expired/revoked session cascades this state |
| `webauthn_credentials` | UUID, user/device FKs, unique credential ID, public key, WebAuthn user handle, signature counter, transports, backup/device-type flags, label, created/last-used/revoked timestamps | Public keys only; no biometric templates/private keys. Use the maintained library's recommended binary/base64 representation and counter semantics |
| `security_challenges` | UUID, user/session/device FKs as applicable, type/purpose, random challenge or digest, credential restriction, security version, expiry, consumed timestamp, attempt count | WebAuthn ceremony state and purpose-bound step-up grants. Unique opaque ID, expiry index; consume with a conditional update/lock. Plugin TOTP pending state remains plugin-owned |
| `security_events` | UUID, nullable user/session/device references, event type, outcome, request ID, minimized metadata, created/expiry timestamps | Security operations and recovery evidence. Actor/time and expiry indexes. No generic arbitrary request-body logging |
| `privacy_exports` | UUID, user FK, format/schema version, state, requested/snapshot/completed/expiry times, job lease/attempts, object key/version, checksum, byte count, safe error, security generation, idempotency key | Unique `(user_id,idempotency_key)`; user/time and state/lease indexes. No archive plaintext in PostgreSQL/Redis |
| `account_deletion_requests` | UUID, nullable user reference plus opaque original subject ID, state, scope manifest/version, confirmed/start/completed times, progress checkpoint, lease/attempts, retention disposition, safe error | Survives user removal long enough to finish cleanup. Partial unique index for one active request per subject; encrypted/minimized scope manifest |
| `privacy_cleanup_tasks` | UUID, deletion/export request FK, kind, opaque object key/version or external resource locator, state, attempts, next attempt, lease, completion/error timestamps | Durable bounded cleanup after the user row is gone. Unique resource identity per request. Restrict to worker role; do not cascade these tasks away before success |
| `deletion_tombstones` | Opaque immutable subject/workspace IDs, deletion generation/time, restore-retention deadline | Minimal suppression list to prevent old backups/jobs resurrecting deleted accounts. No names/emails/finance data. Replicate outside the database backup set; operator access only |
| `backup_runs` | UUID, kind, state, snapshot/started/finished times, manifest location, database/schema version, key IDs, artifact counts/checksums, safe error, retention deadline | Operator-only operational metadata; pending/state/time indexes. Copy run manifest to backup storage so loss of the primary DB does not lose the catalog |
| `backup_restore_checks` | UUID, backup FK/reference, isolated target ID, started/completed times, result, elapsed time, verified counts/checksums, safe failure summary | Evidence of a usable restore, not just an uploaded file. Operator-only; no restored financial contents in results |

A separate encryption-key table is **not required** if the secret manager supplies versioned keys and ciphertext/backup manifests carry key IDs. Add metadata-only key inventory later if needed. Local privacy-mode presentation needs no extra table beyond account defaults plus a non-sensitive browser preference.

### 6.3 Schema and authorization rules

1. User-owned rows require `user_id` and actor-scoped authorization/RLS. Workspace-owned rows retain `workspace_id` and membership checks. A user security action must not trust a client-provided workspace list.
2. Add composite ownership constraints where a session, device, credential or push record references another user's row. Validate UUID/text ID types; auth user IDs are text in this repository.
3. Public route handlers set actor context from verified sessions. Internal cleanup/backup workers use narrowly scoped roles; do not expose a client-controlled “worker bypass” setting.
4. Ordinary revocation may retain a minimized event; full account deletion removes or anonymizes it according to the documented retention policy. Operational tombstones/tasks must survive the user FK without retaining a readable identity indefinitely.
5. State enums/checks must reject impossible combinations: ready export without artifact, completed deletion with outstanding mandatory cleanup, consumed challenge without completion time, revoked device receiving a new unlock grant.
6. Use unique identities, conditional claims, leases, retry limits and sweeps. PostgreSQL is the durable job record; Redis loss must not discard privacy requests.

## 7. Export, deletion, backups, and synchronization contracts

### 7.1 Complete account export

- Scope: identity/profile, settings/consents, personal and every owned business workspace, memberships, wallets/categories/tags, transactions including retained soft deletions, ledger entries/lines, recurring rules/occurrences, budgets/goals/contributions, bills/payments, invoices/lines/payments, retained audit history, notifications/preferences, assistant data, saved report definitions/results where retained, attachments and business documents. Inventory every table and justify exclusions.
- Exclude passwords/PIN hashes, TOTP seeds, recovery codes, session/registration tokens, OAuth secrets, push secrets, encryption keys, and other users' personal data. Export safe device/security metadata only.
- Produce a versioned ZIP with a README, manifest, exact decimal strings/currencies/timezones, JSON/JSONL records with stable IDs/relationships, and original retained files. CSV summaries can supplement it; escape spreadsheet formulas. Stream/batch large data rather than buffering an account in memory.
- Capture a consistent database snapshot across all exported workspaces; record snapshot time and schema version. Use a single bounded repeatable-read export or a durable snapshot mechanism. Do not claim a multi-page read with different snapshots is consistent.
- Pin immutable object versions/checksums before download. Coordinate artifact retention with deletion/cleanup so files cannot disappear halfway through a successful archive; fail or explicitly report missing source artifacts instead of silently reporting success.
- Recheck status/security generation before starting, before publishing and on every download. Deletion/revocation cancels access; an old queued worker cannot recreate the export after erasure.
- Download through an authenticated, recently verified API; avoid long-lived public presigned URLs and email attachments. Notify that an archive is ready with a generic message. Expire and physically remove it, including incomplete uploads and temporary files.

### 7.2 Account deletion

Use a dedicated orchestration service. A bare `DELETE FROM user` or Better Auth's default user-delete endpoint cannot clean every financial FK, object, or running job.

State flow: `requested → confirmed → quarantined → deleting → completed`, with `retryable`, `failed`, or `retention_blocked` states. Proposed UX: a preview before confirmation; acceptance after step-up immediately quarantines the account. No undo is promised after acceptance. Never show “deleted” merely because a queue accepted a job.

1. Preview owned workspaces, retained files, expected deletion coverage and backup retention. Offer the full export flow first. State that previously downloaded files and emails already delivered to recipients cannot be recalled.
2. On confirmation, consume the step-up grant and verify the current scope version. In one transaction record the request/tombstone, set account/workspace deletion fences, increment security generation, revoke sessions and unlock/step-up grants, and prevent new login/writes/jobs. Do not delete the user row yet.
3. Capture a durable object/version manifest before deleting database references. Remove or cancel exports, report jobs, forecasts, recurrence jobs, notifications/email/push, invoice sends, and external authorizations. Queued encrypted payloads need lifecycle rechecks even when they still decrypt successfully.
4. Add a common lifecycle guard to every worker. Fence late writes and object uploads; a worker that started before quarantine must recheck before publishing/sending and before committing results. Use generation-conditional updates plus compensating cleanup for an upload that finishes after quarantine. An external email already accepted cannot be unsent.
5. Delete files and their stored versions/multipart remnants; hard-delete retained soft-deleted financial data in a documented FK-safe order. Include audit/idempotency/forecast/report copies, auth verification records identifiable by account, device credentials, push records, and cache keys. Do not remove schema constraints globally or disable RLS to make deletion convenient.
6. Remove identity/provider/session records only after dependent cleanup is durably accounted for. Do not cascade away unfinished cleanup tasks. Retry idempotently after crashes; exhausted failures stay visible to operators and never become completed.
7. Keep only minimal operational proof/tombstones for the documented retention window. “Active data removed” and “all retained backup copies expired” are separate milestones with an accurate date. Backups remain restricted, age out, and must replay the independently retained deletion list before restoration can serve traffic.
8. A legally justified hold must specify scope, basis, reviewer and expiry; restrict retained records. Do not invent a universal financial-record retention term or use indefinite retention to avoid implementing deletion.

### 7.3 Backups and cloud sync

**Backups:** automate a daily PostgreSQL 18-compatible logical backup plus a manifest and a complete set of referenced private objects/versions. Use a consistent database snapshot and protect immutable object versions until the copy finishes; do not run uncoordinated destructive object cleanup during capture. Include schema/migration history and necessary role/configuration reconstruction. Keep secrets in a separately recoverable vault with documented key IDs.

Use an off-host backup destination with separate credentials, encryption and restricted deletion rights. Proposed retention: 7 daily and 4 weekly copies, maximum 35 days, including object versions/failed artifacts unless an explicit retention exception exists. Apply the same declared bound to all backup locations. Alert if the last usable backup is older than 26 hours or a restore drill fails. Run a restore drill at least monthly and after significant schema/key changes.

For the 24-hour RPO, daily `pg_dump` plus protected object copies is the initial choice. If the product requires a shorter loss window, explicitly add base backups and WAL archiving/PITR; a logical dump is not a PITR stream. [PostgreSQL backup reference](https://www.postgresql.org/docs/current/continuous-archiving.html)

Restore into an isolated environment with outbound email/push/jobs disabled. Restore DB and objects, obtain matching keys securely, replay deletion tombstones, invalidate restored sessions/challenges/export links, reconcile durable outboxes without blindly replaying old sends, then verify checksums, tenant isolation and exact financial totals. Measure the proposed 4-hour RTO. Only enable traffic after the restore gate passes.

For local reproducibility add a Docker Compose backup profile with PostgreSQL client tools, an object-copy tool, encrypted artifacts and a configurable scheduler. A local artifact demonstrates the script; the production off-host upload and restore evidence are also required for completion. Do not promise cloud durability without a configured destination.

**Sync:** successful online writes are committed to the shared backend before showing “Saved.” Reuse version checks and idempotency keys. Refresh on focus, workspace switch and visible polling. A stale edit returns 409 with a reload/merge choice; never silently overwrite a concurrent financial edit or duplicate a transaction after a network retry. Lock/logout/revoke/delete clears local sensitive state and stops refetches. Backups are recovery artifacts, not the mechanism for syncing two active devices.

### 7.4 Privacy mode and browser storage

Extend the existing privacy preference instead of adding page-specific toggles. Cover dashboard, accounts, transactions, budgets, goals, bills, invoices, recurring entries, reports, forecasts, suggestions, notification panel/inbox, search/quick-add previews and dialogs.

Mask exact balances/amounts and identifying financial text as appropriate in text, chart axes/data labels/tooltips, chart/table alternatives, `aria-label`, `title`, SVG/canvas fallback text, toast content and live announcements. Replace sensitive content with a fixed placeholder; CSS blur, transparent text, off-screen text or a screen-reader-only original amount is not masking.

Avoid an initial plaintext flash: default financial rendering to concealed until the local preference and lock status are resolved, or use a server-readable non-sensitive preference cookie. On a shared browser, scope the preference to the signed-in account. Honor a local choice when applying synchronized account defaults; a server preference refresh must not unexpectedly reveal amounts.

Privacy mode is visual concealment, not API authorization or encryption. It need not modify a deliberately requested invoice/report export; explain before generating a file that it includes real values. App lock and step-up controls still apply. Generic lock-screen push content must stay generic independently of this setting.

Cache only the public application shell and static assets for MVP. Explicitly exclude all authenticated HTML/API/file/export responses; verify service-worker behavior rather than relying only on response headers. Clear sensitive memory, IndexedDB/Cache Storage entries if any exist, and stale persisted query state on logout, account switch, lock and deletion. Store no session tokens, PIN hashes or decrypted protected fields in localStorage. Handle unavailable browser storage and multi-tab events without throwing.

## 8. API and UI contracts

Proposed custom routes below complement the installed Better Auth endpoints. Prefix custom routes with `/api/security` or `/api/privacy`; obtain the actor from the session. Keep internal workers/operator backups outside the public user API.

| Route / operation | Requirements |
|---|---|
| Better Auth TOTP enable/verify/disable and recovery-code APIs | Use supported plugin APIs; integrate step-up, replay/rate limits, cookies and lifecycle checks |
| `GET /api/security/status` | Minimal lock/MFA/capability state; no financial/private profile payload while locked |
| `GET /api/security/devices` and `/sessions` | Safe display metadata and opaque IDs only; actor-owned rows |
| `POST /api/security/reauthenticate` | Password plus enabled TOTP/recovery challenge; returns a purpose-bound grant after successful verification |
| `PUT /api/security/devices/:id/pin` | Current actor/device, grant, validated PIN; invalidate old unlocks and reset failed counters only after proof |
| `POST /api/security/lock` and `/unlock/pin` | Lock idempotently; PIN unlock verifies current bound device/session and durable cooldown |
| `POST /api/security/webauthn/{register,unlock}/{options,verify}` | Fresh, one-use ceremonies with server-validated purpose/origin/RP/owner; registration requires step-up |
| `DELETE /api/security/webauthn/:id`, `/devices/:id` | Recent authentication; revoke linked grants/sessions/push as defined in §4.3 |
| `POST /api/security/sessions/:id/revoke`, `/sessions/revoke-others` | Ownership and current-session handling; safe library revocation adapter |
| `GET/PUT /api/security/preferences` | Validated defaults and optimistic version; no caller-editable auth/security flags |
| `POST /api/privacy/exports`, `GET /exports/:id`, `GET /exports/:id/download` | Request/download step-up, scoped job status, expiry and lifecycle checks; idempotent creation |
| `POST /api/privacy/deletion-preview`, `POST /api/privacy/deletion-requests` | Server-computed scope, explicit typed confirmation and fresh purpose-bound grant; return a receipt before logout |

Use consistent 401 unauthenticated, 403 forbidden/locked with a stable code, 404 inaccessible object, 409 stale state, 422 invalid input, and 429 plus `Retry-After`. Return `Cache-Control: private, no-store` for sensitive responses and validate Origin on custom mutations. Rate-limit challenge creation, verification and export/deletion creation separately. No sessionless deletion status endpoint exposing identities; a support receipt may be a random reference without readable account details.

UI routes: `/settings/security`, `/settings/devices`, `/settings/privacy`, `/two-factor`, and an app lock boundary. Use the installed shadcn-svelte skill when implementing components. Show setup, waiting, enabled, revoked, expired, offline and error states. Use EN/ID, seamless locale switching, dark/light themes, keyboard focus, proper labels, 44px targets and reduced motion. Security/deletion copy is direct and serious; do not hide irreversible consequences behind playful language.

## 9. Step-by-step implementation for a junior programmer or coding model

Work through these milestones sequentially. Finish a small vertical slice, run its relevant checks, and record evidence before starting the next one. Do not replace working auth or financial modules wholesale.

### M1 — Inventory current data and choose concrete integration points

1. Read §1 and every path in §3; search for all session reads, sensitive table writes, file uploads/downloads, job producers/consumers and cache stores.
2. Produce `docs/security/data-inventory.md` and an ownership/FK deletion map. Include raw SQL readers, snapshots, email payloads, report files and object versions.
3. Record supported login methods, the installed Better Auth schema/API behavior, WebAuthn/Bun compatibility and public origin/RP ID configuration. Generate plugin schema into a temporary file for review, not straight into the live database.
4. Confirm §2 defaults in `docs/security/decisions.md`, with an explicit production storage encryption/off-host backup choice and retention policy. Name operational/legal deployment decisions without blocking local implementation on them.

**Done when:** every sensitive field and data store has an owner, protection rule, export rule and deletion path; no major reader/worker is unaccounted for.

### M2 — Add schema, actor guards and durable security state

1. Add the required tables/columns in §6 to Drizzle and a new additive migration. Populate safe defaults and define the RLS/worker/operator role model.
2. Implement a shared session/lifecycle/security guard used by all finance route helpers and SSR. Replace duplicated checks incrementally, retaining current verified-email and membership behavior.
3. Add challenge consumption, security-version checks and idempotency helpers. Prevent races between revoke/delete and credential/job creation.
4. Apply migrations to an empty disposable DB and a populated copy; verify old sessions, finance records and notification behavior remain usable before enrollment.

**Done when:** cross-user rows are inaccessible under the normal database role, and app-locked/deleting sessions cannot bypass the common guard through an older route.

### M3 — Implement TOTP and safe recovery end to end

1. Configure Better Auth server/client plugins, reviewed schema mapping and issuer. Keep existing signup OTP/reset-email flows functioning through Mailpit.
2. Build enrollment, QR/manual key, first-code confirmation, backup-code display and login challenge screens. Use Svelte navigation for the challenge flow.
3. Implement recovery-code use, disable/regenerate flows and the recent-auth grant service. Close alternate auth/reset/recovery bypasses; add shared rate limits and durable replay handling where missing.
4. Revoke or rotate sessions/grants after security changes and record minimized events. Test recovery and all enabled sign-in methods, including direct API requests.

**Done when:** a password alone cannot access finance for an MFA-enabled user, and recovery does not silently remove security or allow code reuse.

### M4 — Implement PIN app lock and session enforcement

1. Register an opaque browser identity after full authentication; implement PIN set/change/reset with a maintained password hasher and external pepper.
2. Add locked/unlocked state and server lease/idle checks; exempt only explicitly safe unlock/logout/status routes. Add limits and durable cooldown counters.
3. Build the lock boundary before protected content renders; wire manual lock, hide/resume, reload, back navigation, multiple tabs and logout. Do not preserve sensitive data behind an overlay.
4. Test direct HTTP bypass, missing/changed browser cookie, storage clearing, cooldown persistence and recovery by full login.

**Done when:** server and browser agree on lock state and PIN unlock cannot elevate authentication assurance.

### M5 — Add supported biometric/device-security unlock

1. Add the maintained WebAuthn libraries at reviewed versions and the credential/challenge storage from §6. Keep full passwordless sign-in disabled for this milestone.
2. Implement registration after step-up, then assertion-based unlock of the existing bound session. Validate challenge/origin/RP/user verification/owner/counter and consume atomically.
3. Add capability detection, cancellation and unsupported-browser copy; allow PIN/full login fallback. Add credential naming/revocation to settings.
4. Verify with a virtual authenticator and real supported desktop/mobile PWA devices; record OS/browser results and limitations.

**Done when:** a real platform authenticator unlocks without exposing biometric material, and fabricated/replayed/wrong-origin assertions fail.

### M6 — Finish device/session settings and browser security

1. Implement safe session/device lists, revoke-one/revoke-others/remove-device operations and last-seen display. Map library token operations internally.
2. Ensure password reset/recovery/removal invalidates outstanding credentials/grants as intended; remove linked push endpoints on device removal.
3. Audit custom mutation Origin/CSRF checks, production cookies, trusted proxies, TLS configuration, safe error handling and RLS roles. Add a staged CSP compatible with the app; remove permissive exceptions through browser evidence.
4. Audit service-worker caches and storage; make authenticated responses non-cacheable and lock/logout cleanup reliable.

**Done when:** a second browser loses access on its next request after revocation, even if a cached UI or old cookie remains.

### M7 — Encrypt protected data and migrate safely

1. Implement `security/encryption.ts` and key-provider adapters with versioned envelopes, AAD, independent purpose keys and safe failures. Document allowed field readers.
2. Integrate every writer/reader in the inventory, including auth adapters where supported, SQL-backed invoice/report generation, audit/idempotency copies, notifications and background jobs.
3. Ship additive columns and version-aware readers, backfill in batches, compare decrypted outputs, then remove plaintext duplicates/fallbacks. Keep old queued email/push data readable until drained or migrated.
4. Exercise rotation, missing/wrong keys, tampering, cross-tenant ciphertext swaps and rollback. Confirm database/object-volume encryption and backup-key recovery in the chosen deployment.

**Done when:** a dump/log/job scan contains no selected plaintext canaries or raw secrets, while authorized invoices/forecasts/reports remain correct.

### M8 — Build full account export

1. Implement `privacy/exports.ts`, its registry of included/excluded data, a durable job table and a bounded worker with lease recovery.
2. Build a consistent manifest/record archive with exact financial values and referenced files; apply export-specific redaction and secure temporary-file handling.
3. Add settings request/status/download UI, reauthentication, expiry, access checks and cleanup. Keep email notifications generic.
4. Compare an export to a populated fixture covering personal and multiple businesses; simulate object failure, worker crash, Redis loss and concurrent deletion/revocation.

**Done when:** the user receives a complete, documented archive through authenticated download and failed/incomplete exports never appear ready.

### M9 — Build account erasure with job and object fencing

1. Implement preview/confirmation and durable deletion states with lifecycle guards. Record tombstones outside the ordinary backup restore set.
2. Add the explicit FK-safe erasure service and object/version cleanup manifest. Integrate every producer/worker with deletion generation checks, including existing encrypted auth email jobs.
3. Build progress/receipt/error operations and operator retries. Keep completion truthful during external failures and documented retention holds.
4. Test deletion with retained soft deletions, archives, invoices, reports, assistant state, notifications and active workers. Restore an older backup and demonstrate the deleted subject cannot return to service.

**Done when:** no active data, access or late job survives successful erasure, and retained backup handling is explained and enforceable.

### M10 — Automate backups and prove restores

1. Add `infra/backup/`, scheduled Docker tooling, backup manifests and operational run/restore records. Use bounded credentials and PostgreSQL-compatible tools.
2. Configure encrypted off-host DB/object backups with retention and failure alerts. Never hard-code credentials or copy live PostgreSQL volume files as a logical backup.
3. Write `docs/security/restore-runbook.md`: restore isolation, key retrieval, object validation, deletion replay, session invalidation, outbox reconciliation and traffic re-enable gate.
4. Run a complete restore drill with synthetic finance/files and key rotation. Measure RPO/RTO and report failed artifacts or unmet targets honestly.

**Done when:** a scheduled backup restores into a usable isolated application within the chosen recovery targets; artifact upload alone is insufficient.

### M11 — Finish online sync and privacy mode everywhere

1. Reuse version/idempotency behavior across devices; refresh on focus/visibility/workspace changes and display saved/offline/conflict states.
2. Inventory every rendered financial value and move masking into shared presentation helpers/components. Keep the current shared preference and add safe account defaults/tab synchronization.
3. Cover charts, accessible alternatives, notifications, assistant text, dialogs, initial SSR/hydration and browser history. Add deliberate export disclosure while masked.
4. Test two browsers editing the same record, lost responses/retries, lock/logout propagation, first-paint concealment and all relevant screens at 360px.

**Done when:** devices converge to committed backend data and concealed values cannot be recovered from rendered/accessible UI text while privacy mode is active.

### M12 — Release evidence and operational handoff

1. Complete §10 using isolated test DBs/Redis, Mailpit, disposable object buckets and an isolated backup destination. Never use real user financial data as destructive test fixtures.
2. Run repository type checks and production build; run affected auth, finance, assistant, invoice, report and notification regressions. Verify a normal `bun run dev` path including new worker/cleanup schedules.
3. Document configuration, key rotation/recovery, factor recovery, incident response, exports/deletion, retention and backup restore. Update `.env.example` with names/placeholders only and separate local defaults from production requirements.
4. Record passed/failed checks and operational owners. If production storage, real-device verification or restore evidence is missing, report that exact incomplete gate instead of marking MVP complete.

**Done when:** every MVP acceptance check has evidence and the application can be operated and recovered by someone following the runbooks.

## 10. Required MVP acceptance checks

### Authentication, device lock and sessions

- [ ] Enrollment stays pending until the first valid TOTP; QR URI and backup codes do not enter logs, URLs, analytics or external QR services.
- [ ] Password-only login, TOTP-pending cookies and every alternate enabled login path cannot access finance for a user requiring MFA.
- [ ] Invalid/expired/replayed TOTP and concurrent reuse of one recovery code are rejected; rate limits persist across processes and return usable retry guidance.
- [ ] Disabling/regenerating/recovering factors requires the intended proof, rotates/revokes affected sessions, and does not introduce email-only MFA removal.
- [ ] PIN enrollment/change/reset, five-failure cooldown, ten-failure full-login requirement and restart/multi-process behavior work; plaintext PIN never persists.
- [ ] PIN cannot create a login session or satisfy step-up for export, deletion or security changes.
- [ ] Idle/background/manual lock, reload, multiple tabs and storage clearing cannot expose protected data or bypass direct API/SSR/file access.
- [ ] WebAuthn succeeds on documented supported real devices and handles unavailable/cancelled authenticators; wrong origin/RP/user/credential, missing user verification and replay fail.
- [ ] Session list exposes no reusable tokens; revoke-one/revoke-others/remove-device behave distinctly and block a second browser on its next request.
- [ ] Origin/CSRF, secure cookies, trusted proxy spoofing, unverified users, account deletion state and cross-user/RLS access have direct request tests.

### Encryption and privacy presentation

- [ ] Selected sensitive values and all their live duplicates are encrypted/minimized; raw database/queue/log/export canary searches match the inventory's protection promises.
- [ ] Wrong/missing keys, tampered tags, wrong tenant/entity/field AAD and unknown envelope versions fail safely; no plaintext fallback after cutover.
- [ ] Key rotation handles legacy rows/jobs and historical backups; losing one environment's key does not silently corrupt records or affect another environment.
- [ ] Encrypted migration preserves existing data, invoice snapshots, exact ledger totals, financial reports, forecasts and authorized file downloads.
- [ ] Actual database/object/backup at-rest protection and secret storage are documented and verified; local Compose defaults are not represented as production encryption.
- [ ] Privacy mode covers every listed financial surface, tooltips, chart labels, `aria-label`/screen-reader alternatives and notifications without an initial reveal flash.
- [ ] Masking, lock and logout work with unavailable localStorage, two accounts on one browser, multiple tabs, browser back navigation and service-worker caches.
- [ ] EN/ID changes without reload, light/dark themes, reduced motion, keyboard focus, labels, 44px targets and 360px layouts pass for all new security screens.

### Export and deletion

- [ ] Full export includes all inventory-approved personal/business records and retained files with stable relationships, exact decimals and a consistent snapshot.
- [ ] Exports omit authentication secrets, protected provider tokens and other users' data; downloads require current authorized recent authentication and expire physically.
- [ ] Large exports are bounded; worker crash, missing file, Redis failure, concurrent mutation/revocation/deletion and repeated creation do not produce duplicate or incomplete “ready” archives.
- [ ] Deletion preview requires explicit confirmation and step-up, fences all owned scopes, revokes sessions, prevents login, and handles unexpected shared ownership/holds safely.
- [ ] Complete deletion removes retained soft deletions, FKs, audit/idempotency/assistant/report/notification copies, object versions, temporary files, auth records and cache data according to the inventory.
- [ ] Concurrent/late email, invoice, export, forecast, recurring and upload workers cannot publish/send/recreate data after the deletion fence; unavoidable already-accepted external delivery is documented.
- [ ] Crashes and partial object/provider failures resume from durable checkpoints; completion waits for required cleanup and reports retained backup expiry accurately.
- [ ] Restoring a backup taken before erasure replays independent tombstones before traffic/jobs and does not resurrect the account or its files.

### Backup, synchronization and rollout

- [ ] Scheduled encrypted backup contains a consistent DB plus referenced object set, checksums/schema/key metadata, off-host copy, and enforced retention.
- [ ] Isolated restore succeeds with required historical keys and correct exact balances/files; deleted subjects and old sessions remain unusable, and old outboxes do not flood email/push.
- [ ] Measured recovery meets the chosen RPO/RTO; failed/missing/stale backups and failed restore drills alert an operational owner.
- [ ] Two online browsers converge after writes; stale edits return conflicts, retries are idempotent, and offline writes do not falsely show “Saved.”
- [ ] Fresh/populated migration and rollback/roll-forward drills preserve existing working auth/finance flows; normal API roles pass RLS isolation tests.
- [ ] Type checks, production build, affected integration/browser regressions, real-device evidence, key/restore runbooks, and deployment configuration are complete before marking MVP 100%.

## 11. V2 implementation sequence and additional tables

### V2.1 — Read-only bank connections

1. Select an aggregator supported in the intended market; review scopes and processing terms. Use hosted consent/redirect flows.
2. Add `bank_connections` (workspace, provider, encrypted credential reference, read-only granted scopes, consent/status/expiry), `bank_connection_accounts` (scoped provider-to-wallet mapping), and `bank_sync_runs` (cursor, status, attempts, timestamps).
3. Reject write/payment scopes; never collect bank passwords, PINs or card security codes. Validate callback ownership/state and webhook signatures/replay protection.
4. Extend data inventory, export/deletion, token rotation/revocation, audit, sync idempotency and incident response before enabling real accounts.

### V2.2 — Business audit experience

1. Extend existing `audit_logs`; do not create a competing finance history table.
2. Add event schema/version, actor role snapshot, stable operation/correlation ID, immutable event time and redacted changes as needed. Restrict inserts and make financial audit mutations append-only through the application role.
3. Add role-authorized history/search/export UI and retention/integrity monitoring. Later integrity features may use signed checkpoints stored outside the primary DB; a database hash chain alone does not defeat a privileged attacker who can rewrite it.
4. Keep security events distinct from business finance history and prove that account deletion/retention rules handle both correctly.

### V2.3 — Formal privacy and compliance operations

1. Have qualified reviewers assess applicable jurisdictions, controller/processor roles, residency/transfers, lawful bases, notices, processor agreements and incident duties. Do not advertise GDPR/PDP compliance because an export button exists.
2. Inventory processing purposes and consent versions; reuse `assistant_settings` consent for AI. Add `consent_records` only for additional purposes needing separate proof, plus `privacy_requests`, `retention_holds`, and `data_processing_register` where the reviewed process requires them.
3. Formalize access/correction/portability/erasure requests, retention exceptions, breach response and provider deletion. Track evidence and deadlines based on applicable requirements rather than hard-coding one universal rule.
4. Prefer hosted payment providers. Do not store full card credentials or CVV. Assess actual PCI scope if card handling is introduced; outsourcing payments does not automatically remove every obligation.

Primary legal/standards references for review: [GDPR official text](https://eur-lex.europa.eu/eli/reg/2016/679), [Indonesia Law No. 27 of 2022 on Personal Data Protection](https://peraturan.bpk.go.id/Home/Download/224884/UU%20Nomor%2027%20Tahun%202022.pdf), and [PCI SSC guidance on sensitive authentication data](https://www.pcisecuritystandards.org/faqs/1533/). These references inform the review; this implementation plan does not establish legal compliance.

## 12. Suggested file organization and developer handoff

```text
apps/api/src/security/
  guards.ts                 # actor, lifecycle, lock and recent-auth rules
  challenges.ts             # one-use purpose-bound challenges/grants
  devices.ts                # browser registration, session adapter, revocation
  pin.ts                    # PIN hashing, throttling and recovery
  webauthn.ts                # maintained verifier integration
  encryption.ts             # versioned envelopes and AAD
  keys.ts                   # environment/KMS adapters, never key material in Git
  events.ts                 # minimized security events
  routes.ts
apps/api/src/privacy/
  inventory.ts              # explicit export/erasure registry
  exports.ts
  deletion.ts
  cleanup.ts
  worker.ts
apps/web/src/routes/(app)/settings/{security,devices,privacy}/
apps/web/src/routes/(auth)/two-factor/   # adapt to actual route-group structure
apps/web/src/lib/security/              # lock boundary, safe state and capability UI
infra/backup/
docs/security/
apps/api/tests/security/
apps/api/tests/privacy/
apps/web/tests/security/
```

Use existing auth, storage, queue, money, versioning, notification and cleanup helpers where compatible. Keep module responsibilities small. For each milestone, the handoff must identify changed files, migrations/configuration, observed checks, limitations and the next unfinished acceptance item. Do not reset another feature's completion status when replacing this plan, and do not mark unchecked requirements complete based only on code inspection.
