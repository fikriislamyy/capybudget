# CapyBudget

Personal finance application scaffold using SvelteKit, TypeScript, Tailwind CSS, Elysia, Eden Treaty, PostgreSQL, Drizzle, Better Auth, Redis, and SeaweedFS for local S3-compatible object storage.

## Requirements

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

Start PostgreSQL and Redis with Compose, then run `bun run db:migrate`. Run `bun run dev` and `bun run dev:web` in separate terminals. The API process starts its BullMQ email and recurring-entry workers with the same `.env` settings. Verification codes, password reset messages, and enabled bill reminder emails are delivered automatically. Local mail is captured by Mailpit at `http://localhost:8025`; SMTP listens on port `1025`. No message is sent to an external address during local development. Browser push bill reminders are optional: generate VAPID keys with `bunx web-push generate-vapid-keys`, add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a `VAPID_SUBJECT` such as `mailto:you@example.com` to `.env`, then restart the API. To run workers separately, use `bun run dev:api`, `bun run dev:worker`, and `bun run dev:tracking-worker`.

The app and Better Auth use the public web origin (`http://localhost:5173`); SvelteKit proxies `/api` to the server-only `API_INTERNAL_URL`. The tracking worker checks each workspace that creates or opens a recurring schedule every minute; PostgreSQL owns occurrence state and Redis delivers the repeat job. For a deployment behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the immediate proxy peer addresses and `TRUSTED_PROXY_HOPS` to the number of trusted forwarding hops. Do not trust forwarding headers from arbitrary clients.

### Business finance and invoices

Business workspaces have a business profile and invoice workflow at `/business/settings` and `/invoices`. Fill in the legal name, contact email, and street, city, and country before issuing invoices. Draft and issued PDFs are rendered with Playwright Chromium; install the browser once from `apps/api` with `bun x playwright install chromium`. The API outbox queues invoice email through the existing email worker, and local deliveries are visible in Mailpit. Recording a payment posts a normal income transaction to the selected business account; issuing an invoice alone does not change account balances. Configure SeaweedFS using the S3 settings in `.env` because profile logos and invoice PDFs are private stored documents.

Run auth tests with `bun run test:auth` and personal finance calculation tests with `bun run test:personal-finance`. The tracking integration flow also covers budget alerts, goal allocations, and bill occurrences when run against its disposable `_test` database. `bun run db:cleanup-auth` removes expired Better Auth session and verification rows in batches of 500; schedule it periodically for production. Redis uses append-only persistence for BullMQ jobs. If Redis is unavailable, auth requests fail closed with a retryable error; SMTP delivery failures retry in the worker and expired email jobs are discarded.

For tracking integration tests, use a disposable database whose name ends in `_test`, and a separate Redis logical database so signup limits and queues do not mix with development data. Apply migrations with `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test bun run db:migrate`, start the API and workers with `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test REDIS_URL=redis://localhost:6379/1 PORT=3001 bun --env-file=../../.env --hot src/dev.ts` from `apps/api`, then run `DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test AUTH_TEST_API_URL=http://localhost:3001 TRACKING_TEST_DATABASE_URL=postgres://capybudget:capybudget@localhost:5432/capybudget_tracking_test bun run test:tracking:integration`. This integration also verifies scheduled bill emails in Mailpit. Stop the test runtime when the suite finishes.

## Layout

- `apps/web`: SvelteKit interface, Tailwind, charts, and typed Eden client
- `apps/api`: Elysia API, Better Auth, Drizzle schema and migrations
- `docker-compose.yml`: PostgreSQL, Redis, and local S3-compatible SeaweedFS

The Compose credentials are for local development only. Replace them before deploying.
