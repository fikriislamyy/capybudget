# CapyBudget

Personal finance application scaffold using SvelteKit, TypeScript, Tailwind CSS, Elysia, Eden Treaty, PostgreSQL, Drizzle, Better Auth, Redis, and MinIO.

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

Generate and apply database migrations with `bun run db:generate` and `bun run db:migrate`. MinIO console is at `http://localhost:9001` (minioadmin / minioadmin); Compose creates the configured `capybudget` bucket automatically.

## Layout

- `apps/web`: SvelteKit interface, Tailwind, charts, and typed Eden client
- `apps/api`: Elysia API, Better Auth, Drizzle schema and migrations
- `docker-compose.yml`: PostgreSQL, Redis, and local S3-compatible MinIO

The Compose credentials are for local development only. Replace them before deploying.
