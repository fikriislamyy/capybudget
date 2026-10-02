# Reference template: complete the adapter-node step in the deployment guide first.
FROM oven/bun:1.4.2 AS bun
FROM node:24-bookworm AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

FROM dependencies AS api
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN cd apps/api && bun node_modules/playwright/cli.js install --with-deps chromium
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/api
CMD ["bun", "src/server.ts"]

FROM dependencies AS web-build
RUN bun run build

FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY --from=web-build --chown=node:node /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
WORKDIR /app/apps/web
CMD ["node", "build/index.js"]

# PostgreSQL client tools must match the server major version for backups.
FROM postgres:18-bookworm AS backup
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=dependencies --chown=postgres:postgres /app /app
WORKDIR /app
ENV NODE_ENV=production BACKUP_POSTGRES_LOCAL=1
USER postgres
CMD ["bun", "infra/backup/backup.ts", "schedule"]
