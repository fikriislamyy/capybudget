#!/usr/bin/env bash
# Run on the VPS as deploy. This is a maintenance-window deployment.
set -euo pipefail
release=${1:?Provide commit-build release ID}
mode=${2:-update}
[[ "$release" =~ ^[a-f0-9]{40}-[0-9]+$ ]] || exit 2
[[ "$mode" == first || "$mode" == update ]] || exit 2
base=/opt/capybudget
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
cd "$base/releases/$release"
export APP_RELEASE="$release"
compose=(docker compose --env-file "$base/secrets/production.env" -p capybudget -f docs/deployment/examples/compose.production.yml)
"${compose[@]}" config --quiet
# Building on the target machine produces native ARM64 images on Oracle A1.
"${compose[@]}" build api web backup
"${compose[@]}" up -d --wait postgres redis object-storage
if [[ "$mode" == first ]]; then
  # Reject an accidental first deployment against an existing installation.
  tables=$("${compose[@]}" exec -T postgres psql -U capybudget -d capybudget -Atc "select count(*) from information_schema.tables where table_schema='public'")
  [[ "$tables" == 0 ]] || { echo 'Database is not empty; use update.' >&2; exit 1; }
else
  previous=$(readlink -f "$base/current")
  [[ -d "$previous" ]] || { echo 'No current release; inspect before proceeding.' >&2; exit 1; }
  old=(docker compose --env-file "$base/secrets/production.env" -p capybudget -f "$previous/docs/deployment/examples/compose.production.yml")
  # Caddy stops receiving writes before API and workers stop.
  APP_RELEASE="$(basename "$previous")" "${old[@]}" stop caddy web api email-worker tracking-worker assistant-worker reports-worker privacy-worker backup
  # Use the OLD application to back up its existing schema.
  APP_RELEASE="$(basename "$previous")" "${old[@]}" run --rm --no-deps backup bun infra/backup/backup.ts create
fi
"${compose[@]}" run --rm --no-deps api bun node_modules/drizzle-kit/bin.cjs migrate
"${compose[@]}" up -d --wait --wait-timeout 180
curl --fail --silent --show-error --retry 6 --retry-delay 5 --retry-all-errors https://capybudget.bebem.my.id/api/health
curl --fail --silent --show-error https://api.capybudget.bebem.my.id/api/health
curl --fail --silent --show-error --output /dev/null https://capybudget.bebem.my.id/login
ln -sfn "$base/releases/$release" "$base/current"
echo "Deployed $release. Complete the user-flow checks in the guide."
