FROM oven/bun:1.4.2-alpine AS runtime
FROM postgres:18-alpine
COPY --from=runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY infra/backup infra/backup
USER postgres
CMD ["bun", "infra/backup/backup.ts", "schedule"]
