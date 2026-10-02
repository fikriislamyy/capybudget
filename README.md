# CapyBudget

Personal finance application scaffold using SvelteKit, TypeScript, Tailwind CSS, Elysia, Eden Treaty, PostgreSQL, Drizzle, Better Auth, Redis, and SeaweedFS for local S3-compatible object storage.

## Deployment guides

- [Free-tier VPS setup](docs/free-vps-setup.md): one-server recommendation, Oracle Cloud setup, DNS, networking and cost limits.
- [Local Jenkins deployment](docs/deployment-jenkins.md): container named `jenkins`, production preparation, both domains, workers, HTTPS, backups and recovery.

The deployment configuration examples are reference templates; complete the documented preparation before using them.

## Local requirements

- Bun 1.2+
- Docker Compose

## Start

```sh
cp .env.example .env
docker compose up -d
bun install
bun run dev
```

In another terminal, run `bun run dev:web`. `bun run dev` starts the API, email worker, and recurring tracking worker; the API listens on `http://localhost:3000` and the web app on `http://localhost:5173`. The API also checks scheduled bill reminders every minute.

Generate and apply database migrations with `bun run db:generate` and `bun run db:migrate`. The local S3 endpoint is `http://localhost:8333`. SeaweedFS is used because MinIO's published image was returning `401 UNAUTHORIZED` from Quay during setup. Receipts accept JPEG, PNG, WebP, and PDF up to 10 MiB each, with a maximum of five per transaction. Objects are private and downloads pass through the authorized API.

### Email authentication

Copy `.env.example` to `.env`, set `BETTER_AUTH_SECRET` to a random secret of at least 32 characters, and set `EMAIL_JOB_ENCRYPTION_KEY` to a base64 encoded random 32-byte key (`openssl rand -base64 32`). The encryption key protects queued verification codes and password reset links. Keep the same key for the API and email worker, and back it up before deploying.

Start PostgreSQL and Redis with Compose, then run `bun run db:migrate`. Run `bun run dev` and `bun run dev:web` in separate terminals. The development launcher starts BullMQ email, recurring-entry, assistant-refresh, and report workers with the same `.env` settings. Verification codes, password reset messages, and opted-in bill and assistant alert emails are delivered automatically. Local mail is captured by Mailpit at `http://localhost:8025`; SMTP listens on port `1025`. No message is sent to an external address during local development. Browser push reminders are optional: generate VAPID keys with `bunx web-push generate-vapid-keys`, add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a `VAPID_SUBJECT` such as `mailto:you@example.com` to `.env`, then restart the API. To run workers separately, use `bun run dev:api`, `bun run dev:worker`, `bun run dev:tracking-worker`, `bun run dev:assistant-worker`, and `bun run dev:reports-worker`.

The app and Better Auth use the public web origin (`http://localhost:5173`); SvelteKit proxies `/api` to the server-only `API_INTERNAL_URL`. The tracking worker checks each workspace that creates or opens a recurring schedule every minute; PostgreSQL owns occurrence state and Redis delivers the repeat job. For a deployment behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the immediate proxy peer addresses and `TRUSTED_PROXY_HOPS` to the number of trusted forwarding hops. Do not trust forwarding headers from arbitrary clients.

### Business finance and invoices

Business workspaces have a business profile and invoice workflow at `/business/settings` and `/invoices`. Fill in the legal name, contact email, and street, city, and country before issuing invoices. Draft and issued PDFs are rendered with Playwright Chromium; install the browser once from `apps/api` with `bun x playwright install chromium`. The API outbox queues invoice email through the existing email worker, and local deliveries are visible in Mailpit. Recording a payment posts a normal income transaction to the selected business account; issuing an invoice alone does not change account balances. Configure SeaweedFS using the S3 settings in `.env` because profile logos and invoice PDFs are private stored documents.

### AI assistant MVP

The `/assistant` page provides deterministic 30/60/90-day cashflow projections, conservative safe-to-spend estimates, source coverage warnings, and suggestions for Personal and Business workspaces. Forecasts read the ledger, transaction history, recurring items, bill schedules, savings goal allocations, and (for Business) issued invoices. Assign payment accounts and reconcile bill occurrences from `/bills`; set expected collection dates and accounts on issued invoices. Any missing or ambiguous source coverage is surfaced, and unsupported multi-currency totals are excluded. Forecast refresh requests are committed as actor-scoped PostgreSQL runs before BullMQ enqueueing; the worker rechecks consent and source hashes before saving results, and its periodic sweep recovers queued or expired work after Redis interruptions. Enabled workspace forecasts are refreshed at least every 15 minutes. Suggestions are informational, explain their evidence, and never move money. Sending an invoice follow-up requires reviewing the exact recipient/message and confirming it separately.

Assistant privacy and source controls are available in the privacy section on `/assistant` (also linked from `/settings/assistant`). Local forecast and categorization controls are workspace and user scoped. External AI is disabled and unavailable: no external provider is called, and deterministic templates/rules remain active. Email and push assistant alerts are opt-in in the assistant settings; delivery rechecks forecast consent and active suggestion state. Payment-date changes and all transfers still require user action in the underlying finance screens. Chat, what-if scenarios, recurring nudges, anomaly detection, and other V2/Advanced features are not included.

Users can download assistant data or delete assistant-derived data per workspace from the same privacy controls; financial transactions and invoices are retained. The assistant cleanup worker uses provisional defaults of 90 days for forecast runs and alerts and 30 days for invocation details, action previews, and content in assistant audit records. Set `ASSISTANT_FORECAST_RETENTION_DAYS`, `ASSISTANT_ALERT_RETENTION_DAYS`, and `ASSISTANT_CONTENT_RETENTION_DAYS` to integer day counts from 1 to 3650 to tune these defaults. These are product defaults, not legal retention requirements.

Run auth tests with `bun run test:auth`, personal finance tests with `bun run test:personal-finance`, assistant calculator/signed-money/recurrence tests with `bun run test:assistant`, and the assistant settings, forecast, category-learning, assistant alert delivery, worker-idempotency, confirmed invoice reminder, consent-revocation suppression, and Mailpit flows with `bun run test:assistant:integration`. `bun run benchmark:assistant` measures the in-memory calculation for 10 accounts, 10,000 synthetic events, and a 90-day horizon (database query time is excluded). On 2026-09-29, Bun 1.4.2 on WSL2/Linux x86_64 measured a 38.10 ms median and 45.76 ms maximum across five measured runs after one warm-up. This is a calculation benchmark, not an end-to-end API/database performance claim. Run `DATABASE_URL=postgres://.../capybudget_test bun run --cwd apps/api assistant:query-plans` against a disposable database ending in `_test` to collect actual PostgreSQL plans, row counts, and buffer reads for the historical transaction, effective-dated journal balance, and invoice queries; the report excludes row values and temporarily inserts then removes 10,000 synthetic transaction rows. On the 2026-09-29 WSL2/Linux x86_64 test run, the 10,000-row historical scan used `transactions_workspace_date_idx`, returned its 100-row limit in 0.73 ms (118 shared-buffer hits, no reads); journal-balance and invoice plans ran against the smaller integration fixture at 0.09 ms and 0.03 ms. These plan timings are local fixture measurements, not an end-to-end API/database latency claim. `bun run backtest:assistant` compares retained forecasts with actual effective-dated ledger balances, grouped by horizon and scenario. It only uses completed forecast dates whose consent version is still current. Percentage error omits actual balances below 1.0000 in the forecast currency and reports the excluded count; absolute error includes them. The command reports actual observed samples and does not infer predictive accuracy from synthetic fixtures. It may report no observations until forecasts have matured. Redis uses append-only persistence for BullMQ jobs; `apps/api/scripts/assistant-redis-persistence.ts` checks BullMQ job survival across a Redis restart when run with `REDIS_URL`, a unique `ASSISTANT_REDIS_TEST_ID`, and `ASSISTANT_REDIS_TEST_ACTION=write|verify`. This check passed against a disposable Redis 8 AOF container on 2026-09-29. If Redis is unavailable, auth requests fail closed with a retryable error; SMTP delivery failures retry in the worker and expired email jobs are discarded.

For the browser acceptance flow, start Compose and create a disposable database whose name ends in `_test`, run `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_browser_test bun run db:migrate`, then run `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_browser_test DATABASE_POOL_MAX=2 REDIS_URL=redis://localhost:6379/11 TEST_API_PORT=3011 TEST_WEB_PORT=5181 bun run test:auth:e2e`. Playwright starts the API and all local workers on the selected test port; the test web server uses a separate port and both are stopped when the run finishes. Set unused `TEST_API_PORT` and `TEST_WEB_PORT` values if those ports are occupied. Signup, verification, and reset emails are read from local Mailpit; browser test data remains in the disposable database.

For assistant integration checks, use a disposable database whose name ends in `_test`, and a separate Redis logical database for both the test API/workers and test process so signup limits and queue consumers do not mix with development data. Apply migrations with `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test bun run db:migrate`, start the API and workers with `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test DATABASE_POOL_MAX=2 REDIS_URL=redis://localhost:6379/2 PORT=3001 bun --env-file=../../.env --hot src/dev.ts` from `apps/api`, then run from the repository root: `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test DATABASE_POOL_MAX=2 REDIS_URL=redis://localhost:6379/2 AUTH_TEST_API_URL=http://localhost:3001 TRACKING_TEST_DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test bun run test:assistant:integration`. The integration covers scheduled bill email delivery through Mailpit, assistant settings, insufficient-history handling, three-example merchant learning and conflict abstention, opted-in assistant email alert delivery, action confirmation idempotency, and forecast-worker recovery. Stop the test runtime when the suite finishes.

### Reports and analytics MVP

`/reports` provides the workspace calendar presets this week, last week, this month, last month, and year to date. Weekly periods start Monday; API period ends are exclusive. Amounts remain exact decimal strings in tables and downloaded CSV/XLSX files. Income and expense totals use recorded transactions, while cash balances and cashflow use effective-dated journal entries. Currency accounts are reported separately; the dashboard defaults to the workspace currency and flags excluded currencies. Budget revisions preserve future changes; budgets that predate this migration are marked as legacy baselines because their earlier terms cannot be reconstructed.

The `/reports` page and `/api/workspaces/:workspaceId/reports` API provide workspace dashboard, cashflow statement, budget-versus-actual, and CSV, XLSX, and PDF exports. Report snapshots and export files are private, actor-scoped, immutable, and retained for up to seven days. Snapshot generation and export rendering use the `capybudget-reports` BullMQ worker; PostgreSQL records queued, running, ready, and failed jobs so the worker can recover work after Redis interruptions. Export objects use the configured private S3-compatible bucket, and the worker deletes expired objects and retries storage cleanup. Start the worker with `bun run dev:reports-worker`; `bun run dev` starts it automatically. Apply migrations with `bun run db:migrate`. Large PDFs are refused with an explicit limit, while CSV and XLSX contain the full report snapshot. CSV is UTF-8 with a BOM for spreadsheet compatibility and neutralizes formula-leading text while preserving numeric amounts. The Excel workbook stores authoritative money as text to avoid spreadsheet precision loss. These reports describe recorded activity and are not statutory financial statements.

### Notifications and reminders MVP

The API scheduler started by `bun run dev` evaluates bill occurrences, outstanding issued invoices, pending outgoing recurring occurrences, budget thresholds, recorded liquid-account balances, and configured unusual-spending rules once per minute. Date-based reminders release from 09:00 in each workspace timezone and catch up within the previous seven local days. Budget alerts support zero limits and emit each crossed threshold once per budget revision and period. Notification records expire after 90 days by default; the scheduler physically removes expired records and their delivery rows. Notifications are workspace and recipient scoped, deduplicated in PostgreSQL, and shown in the header and `/notifications` inbox; `/settings/notifications` configures in-app event types and recorded-balance/unusual-spending rules. The inbox supports filtering, cursor pagination, unread counts, read-all, dismissal, snoozing, and links to authorized finance screens. Bill email remains enabled by default for verified owners; assistant email and browser push require opt-in. Newly introduced event types are in-app only by default; goal celebrations and expanded per-event email/push controls are later phases. Pending email intents are re-enqueued from PostgreSQL after Redis interruptions. An expired delivery lease with no provider attempt is retried; a lease that expired after provider send began is marked `unknown` to avoid a blind duplicate. Apply schema changes with `bun run db:migrate`. Run `bun run check`, `bun run build`, `bun run test:notifications`, and `bun run test:personal-finance` for local checks.

The database-backed notification regression uses `apps/api/tests/tracking/workspace.test.ts` and Mailpit. Use a disposable PostgreSQL database whose name ends in `_test`; point both the API/workers and `DATABASE_URL`/`TRACKING_TEST_DATABASE_URL` at it. Keep Redis on an isolated database number (the example uses 15), and do not point test variables at the development database:

```sh
docker compose up -d postgres redis mailpit
DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test bun run db:migrate
DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test REDIS_URL=redis://localhost:6379/15 bun --env-file=.env --hot apps/api/src/email/worker.ts
DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test REDIS_URL=redis://localhost:6379/15 bun --env-file=.env --hot apps/api/src/assistant/worker.ts
DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test REDIS_URL=redis://localhost:6379/15 PORT=3000 bun --env-file=.env --hot apps/api/src/test-server.ts
```

In another terminal, run `TRACKING_INTEGRATION=1 TRACKING_TEST_DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test REDIS_URL=redis://localhost:6379/15 bun --env-file=.env test apps/api/tests/tracking/workspace.test.ts`. This starts the API without development schedulers; the test invokes notification sweeps explicitly to avoid timer races. The test expects the API at `localhost:3000` and Mailpit at `localhost:8025` by default; set `AUTH_TEST_API_URL` or `MAILPIT_API_URL` to override them. Drop the disposable database and clear only the isolated Redis database after the run.

## Layout

- `apps/web`: SvelteKit interface, Tailwind, charts, and typed Eden client
- `apps/api`: Elysia API, Better Auth, Drizzle schema and migrations
- `docker-compose.yml`: PostgreSQL, Redis, and local S3-compatible SeaweedFS

The Compose credentials are for local development only. Replace them before deploying.

Notification delivery outcomes (`accepted`, `retryable`, `failed`, `unknown`) are visible in the inbox. SMTP acceptance means the server accepted the message, not that it reached a person's mailbox. Disconnects without an explicit SMTP response and expired leases after sending began become `unknown`; automatic resend is paused because provider delivery cannot be made exactly once. Missing SMTP configuration and permanent SMTP rejections fail visibly. Retryable failures stop after five attempts. Snoozing postpones pending delivery, and sending rechecks source date, membership, verified recipient, preferences, consent, and expiry. `GET /api/workspaces/:workspaceId/notification-delivery-health` returns recipient-scoped counts and the oldest pending timestamp without exposing recipients or provider payloads.

Migration `0019_notification_cutover` preserves existing IDs, read state, email timestamps, and opt-outs, and records a cutoff for existing workspaces. It does not enqueue mail. Historical inbox notices are not resent; historical overdue/anomaly conditions and unchanged crossed budgets are baselined instead of flooding the inbox. New obligations, source changes, and future budget crossings continue normally. Notification-derived data cascades when its workspace or owner is deleted; stale encrypted jobs cannot recreate it.

For MVP budget refunds, reverse a fully refunded expense using the existing audited transaction deletion, or edit a partially refunded expense to the retained cost. Both update the ledger and budget actuals. Record the refund explanation in notes. Recording the refund as unrelated income does not reduce expense totals. Threshold markers survive reversals/edits until the period ends, so undoing a refund does not repeat the same alert.

Additional delivery and migration acceptance checks (use the isolated test database and Redis settings above):

```bash
TRACKING_INTEGRATION=1 DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_notifications_test REDIS_URL=redis://localhost:6379/15 bun --env-file=.env test apps/api/tests/notifications
```

These checks cover concurrent scheduler processes, duplicate job claims, real SMTP disconnect after DATA, retry exhaustion, absent SMTP configuration, Redis producer failure, lost-job recovery, stale leases, suppression, deletion, and upgrade from the pre-notification schema. The rollout check creates and drops its own disposable database, so the test database role needs `CREATEDB`. The ordinary `test:notifications` command skips database integration unless `TRACKING_INTEGRATION=1` is set.

## Security and privacy

Security settings, TOTP/recovery codes, app PIN/device unlock, session management, account export/deletion, field encryption, shared privacy masking and encrypted local SeaweedFS backups are implemented. Start the backup scheduler with `docker compose --profile backup up -d --build backup`. See [the setup, key rotation, restore and release-check runbook](docs/security-privacy.md) before enabling these features on existing data or deploying them.

## Reset the local database

Stop the API and workers, leave PostgreSQL running, then run this from the project root:

```bash
bun run db:fresh
```

This permanently deletes the database configured by `DATABASE_URL`, recreates it, and applies all checked-in Drizzle migrations. Type the database name to confirm. For an intentional noninteractive reset, use `bun run db:fresh --yes`. The command accepts only local PostgreSQL hosts, refuses production mode and system databases, and requires active database connections to be closed first. The configured database user must have permission to drop and create the database.

Redis queues, uploaded files, and backups are retained. There is no separate demo-data seeder: sign up and complete onboarding to automatically create default categories and ledger accounts. If migration fails after the reset, fix the reported error and run `bun run db:migrate`.
