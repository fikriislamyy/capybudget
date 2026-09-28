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
bun run dev:api
```

In another terminal, run `bun run dev:web`. The API listens on `http://localhost:3000` and the web app on `http://localhost:5173`.

Generate and apply database migrations with `bun run db:generate` and `bun run db:migrate`. The local S3 endpoint is `http://localhost:8333`. SeaweedFS is used because MinIO's published image was returning `401 UNAUTHORIZED` from Quay during setup.

### Email authentication

Copy `.env.example` to `.env`, set `BETTER_AUTH_SECRET` to a random secret of at least 32 characters, and set `EMAIL_JOB_ENCRYPTION_KEY` to a base64 encoded random 32-byte key (`openssl rand -base64 32`). The encryption key protects queued verification codes and password reset links. Keep the same key for the API and email worker, and back it up before deploying.

Start PostgreSQL and Redis with Compose, then run `bun run db:migrate`. Run the API and web app in separate terminals. In a third terminal run `bun run dev:worker` to send queued mail. Local mail is captured by Mailpit at `http://localhost:8025`; SMTP listens on port `1025`. No message is sent to an external address during local development.

The app and Better Auth use the public web origin (`http://localhost:5173`); SvelteKit proxies `/api` to the server-only `API_INTERNAL_URL`. For a deployment behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the immediate proxy peer addresses and `TRUSTED_PROXY_HOPS` to the number of trusted forwarding hops. Do not trust forwarding headers from arbitrary clients.

Run the auth tests with `bun run test:auth`. `bun run db:cleanup-auth` removes expired Better Auth session and verification rows in batches of 500; schedule it periodically for production. Redis uses append-only persistence for BullMQ jobs. If Redis is unavailable, auth requests fail closed with a retryable error; SMTP delivery failures retry in the worker and expired email jobs are discarded.

## Layout

- `apps/web`: SvelteKit interface, Tailwind, charts, and typed Eden client
- `apps/api`: Elysia API, Better Auth, Drizzle schema and migrations
- `docker-compose.yml`: PostgreSQL, Redis, and local S3-compatible SeaweedFS

The Compose credentials are for local development only. Replace them before deploying.
