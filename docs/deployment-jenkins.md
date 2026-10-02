# CapyBudget deployment: local Jenkins → one VPS

Written for this repository, 2 October 2026. Read [free VPS setup](free-vps-setup.md) first to create the server. This guide and its [reference files](deployment/examples/) do not provision a server, start Jenkins, or change the application's production adapter automatically.

## 1. Recommended layout

Use **one VPS initially**, with **Jenkins on your own computer**, in a container named `jenkins`.

| Location | Services |
| --- | --- |
| Your computer | Jenkins; Git checkout; SSH deployment |
| VPS | Caddy HTTPS proxy, SvelteKit, Elysia API, five workers, PostgreSQL, Redis, SeaweedFS, backup scheduler |
| Off the VPS | Encrypted backup bucket, SMTP provider |

```mermaid
flowchart LR
  Git[GitHub: trusted main] --> Jenkins[Local container: jenkins]
  Jenkins -->|SSH: upload source and build| VPS[One VPS]
  Browser -->|HTTPS: both domains| Caddy[Caddy on VPS]
  Caddy -->|web pages| Web[SvelteKit]
  Caddy -->|/api on either domain| API[Elysia]
  Web -->|internal API requests| API
  API --> Data[PostgreSQL / Redis / SeaweedFS]
  Workers[Five workers] --> Data
  Backup[Backup scheduler] -->|encrypted copies| S3[Off-host S3 bucket]
```

Two hostnames do not require two servers. A second EC2 instance would consume the same AWS credit pool faster, require networking between services, and increase maintenance. Split later if measurements show contention or you need stronger fault isolation; moving only the frontend will not remove the database's single point of failure. This single-VPS setup has downtime during updates and is not highly available.

Local Jenkins can be switched off after deployment; the VPS keeps serving the app. Jenkins must be running, with internet access, when deploying. Builds run **on the VPS** and produce images for its native architecture (x86-64 on the recommended EC2 instance). Allow a maintenance window and monitor memory during builds.

## 2. Understand the domain configuration

| Address | Destination |
| --- | --- |
| `https://capybudget.bebem.my.id` | SvelteKit pages |
| `https://capybudget.bebem.my.id/api/*` | Elysia, preserving `/api` |
| `https://api.capybudget.bebem.my.id/api/*` | Same Elysia API |
| `http://api:3000` | Internal Docker API endpoint; never public |

**Keep the browser API URL and Better Auth URL on the frontend domain.** The current app expects same-origin authentication cookies and server-rendered session checks. The dedicated API domain is also available, but browser requests should continue through the frontend's `/api` proxy. Directly switching `PUBLIC_API_URL` to the API subdomain requires additional cookie/session design and testing.

The existing Vite `/api` proxy only covers development/preview. Production requires [Caddyfile](deployment/examples/Caddyfile). It uses `handle`, not `handle_path`, so it does not strip the API prefix. Caddy terminates HTTPS and forwards requests to containers. See [Caddy reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Start with DNS-only records if using Cloudflare. The sample trusts exactly one proxy hop: Caddy at `172.30.0.2`. Confirm this subnet does not conflict with your VPS network. If changing it, update the Compose network and `TRUSTED_PROXY_IPS` together. Enabling Cloudflare's proxy later requires reviewing forwarding headers and trusted proxy settings; do not use a wildcard trust value.

## 3. Prepare the repository once, locally

### 3.1 Configure the production SvelteKit adapter

The repository now uses the Node adapter. Keep SvelteKit on the compatible 2.x release used by this app; installing an unrestricted `latest` adapter can pull in SvelteKit 3, which requires an application migration. For a checkout that still needs this preparation:

```sh
bun add --cwd apps/web @sveltejs/kit@2.70.3
bun add --cwd apps/web -d @sveltejs/adapter-node@5.5.7
```

Confirm `apps/web/svelte.config.js` uses this configuration:

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() }
};
```

Commit the package changes and `bun.lock`. The production command is `node build/index.js`, with `ORIGIN` set to the public frontend URL. Do not run Vite dev/preview as the production server. See [SvelteKit Node adapter](https://svelte.dev/docs/kit/adapter-node).

### 3.2 Adopt the reference files

The templates remain under `docs/deployment/examples`; the commands below use those paths directly. Review the supplied Docker build exclusions and merge them into the existing root `.dockerignore`. Appending preserves existing exclusions (duplicate entries are harmless):

```sh
cat docs/deployment/examples/dockerignore.txt >> .dockerignore
```

Never include `.env`, local dependencies, or credentials in the image context.

The [Dockerfile](deployment/examples/Dockerfile) builds web, API, and backup targets. It includes root-level `shared/` code and installs the API's locked Playwright Chromium version for invoice/report PDFs. API containers use Bun; the SvelteKit server uses Node. Debian is intentional because Playwright supports Debian/Ubuntu on ARM64 and x86-64. See [Playwright requirements](https://playwright.dev/docs/intro#system-requirements).

These are initial reference images, not a claim that every tag is the latest. Keep `bun.lock`; do not update dependencies during deployments. Before launch, record tested image digests for Node, Bun, PostgreSQL, Redis, Caddy, SeaweedFS and Jenkins, then use those digests in these files. Review updates separately. The larger shared dependency image favors straightforward first deployment over minimum image size.

### 3.3 Validate before deploying

```sh
bun install --frozen-lockfile
bun run check
bun run build
```

Run the project's integration/browser suites against disposable test infrastructure before approving a release, never against production. Commit all required source files, including `shared/`, before pushing. Jenkins uploads **only committed files** using `git archive`; a working local copy is not sufficient. Do not blindly `git add .` when credentials or local tooling files may be present.

## 4. Configure production secrets on the VPS

Log in as the `deploy` user created by the VPS guide. Create the files with a private editor; do not put real values in Git or Jenkins logs:

```sh
umask 077
mkdir -p /opt/capybudget/secrets
nano /opt/capybudget/secrets/production.env
```

Use this template and replace every `REPLACE_...` value:

```dotenv
NODE_ENV=production
PORT=3000
POSTGRES_PASSWORD=REPLACE_RANDOM_HEX_DATABASE_PASSWORD
DATABASE_URL=postgres://capybudget:REPLACE_SAME_DATABASE_PASSWORD@postgres:5432/capybudget
DATABASE_POOL_MAX=5
REDIS_URL=redis://redis:6379
BETTER_AUTH_SECRET=REPLACE_RANDOM_HEX_32_BYTES
PIN_PEPPER=REPLACE_ANOTHER_RANDOM_HEX_32_BYTES
EMAIL_JOB_ENCRYPTION_KEY=REPLACE_BASE64_32_BYTES
FIELD_ENCRYPTION_ACTIVE_KEY=production-v1
FIELD_ENCRYPTION_KEYS='{"production-v1":"REPLACE_ANOTHER_BASE64_32_BYTES"}'
PUBLIC_APP_URL=https://capybudget.bebem.my.id
PUBLIC_API_URL=https://capybudget.bebem.my.id
BETTER_AUTH_URL=https://capybudget.bebem.my.id
WEB_ORIGIN=https://capybudget.bebem.my.id
API_INTERNAL_URL=http://api:3000
TRUSTED_PROXY_IPS=172.30.0.2
TRUSTED_PROXY_HOPS=1
SEAWEED_IMAGE=REPLACE_TESTED_CHRISLUSF_SEAWEEDFS_TAG_OR_DIGEST
S3_ENDPOINT=http://object-storage:8333
S3_REGION=us-east-1
S3_BUCKET=capybudget
S3_ACCESS_KEY_ID=REPLACE_SEAWEED_ACCESS_KEY
S3_SECRET_ACCESS_KEY=REPLACE_SEAWEED_SECRET_KEY
SMTP_HOST=REPLACE_PROVIDER_SMTP_HOST
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=REPLACE_SMTP_USERNAME
SMTP_PASSWORD='REPLACE_SMTP_PASSWORD'
EMAIL_FROM='CapyBudget <no-reply@capybudget.bebem.my.id>'
BACKUP_S3_ENDPOINT=https://REPLACE_ACCOUNT_ID.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=capybudget-production-backups
BACKUP_S3_ACCESS_KEY_ID=REPLACE_BACKUP_ACCESS_KEY
BACKUP_S3_SECRET_ACCESS_KEY=REPLACE_BACKUP_SECRET_KEY
BACKUP_ENVIRONMENT_ID=production
BACKUP_MAX_BYTES=134217728
ASSISTANT_FORECAST_RETENTION_DAYS=90
ASSISTANT_CONTENT_RETENTION_DAYS=30
ASSISTANT_ALERT_RETENTION_DAYS=90
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@capybudget.bebem.my.id
```

Generate **separate** values with `openssl rand -hex 32` or `openssl rand -base64 32` as appropriate. A hex database password avoids URL escaping issues. Single-quote secrets containing `$` in the Compose env file. Keep encryption keys, the auth secret, and PIN pepper stable across releases and in a secure backup separate from backup artifacts. No external LLM key is needed for the current assistant MVP.

Create `/opt/capybudget/secrets/s3.json` with credentials matching the environment file:

```json
{
  "identities": [{
    "name": "capybudget",
    "credentials": [{
      "accessKey": "REPLACE_SEAWEED_ACCESS_KEY",
      "secretKey": "REPLACE_SEAWEED_SECRET_KEY"
    }],
    "actions": ["Admin", "Read", "Write", "List", "Tagging"]
  }]
}
```

The storage service is private to Docker and uses a persistent volume. Its administrative credential permits the existing backup restore drill to create/delete temporary buckets. Do not expose its ports or reuse these credentials elsewhere. See [SeaweedFS S3 setup](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API).

```sh
chmod 600 /opt/capybudget/secrets/production.env /opt/capybudget/secrets/s3.json
```

The example follows the current single database-role arrangement: `POSTGRES_USER` creates a privileged PostgreSQL role, shared by migrations, the app, and backup restore drills. This is a bootstrap simplification, **not least-privilege database isolation**; it bypasses PostgreSQL RLS. Before hosting other people's financial data, separate the application login (no superuser/BYPASSRLS/CREATEDB privileges) from migration and backup roles, grant the required table/sequence access, and verify existing tenant/RLS flows under that login. Backup restore drills need their own database-creation rights. Do not assume private container networking supplies row-level isolation.

## 5. Set up real email and off-host backups

### Email

Mailpit remains for local testing only. Production signup OTPs require a real SMTP service:

1. Register your sending domain with the SMTP provider.
2. Add its SPF and DKIM DNS records; configure DMARC for the sending domain.
3. Verify `no-reply@capybudget.bebem.my.id` is an allowed sender.
4. Use the provider's submission port: typically 587 with `SMTP_SECURE=false` for STARTTLS, or 465 with `SMTP_SECURE=true` for implicit TLS. Do not use an unencrypted relay.
5. Run the email worker and verify **initial signup**, resend OTP, password reset, and an opted-in reminder from a real inbox. Check spam and provider delivery logs.

Amazon SES is an option if available in your AWS plan and approved for production sending; see the provider guide. Account approval, quotas, sender reputation and delivery are separate from the VPS itself. An HTTP health check does not prove mail works.

### Off-host S3 backup destination

Live receipts/PDFs stay in SeaweedFS on the VPS. Use an off-host bucket for encrypted backups and privacy deletion tombstones; a second bucket on the same VPS cannot survive loss of that VPS.

An optional free-tier destination is Cloudflare R2 Standard: its listed allowance includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations monthly. Overages are billable; this is not unlimited free storage. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

1. Enable R2, review billing, and create a **private Standard** bucket named `capybudget-production-backups`.
2. Create a dedicated S3 API credential. The current `ensureBackupBucket()` calls `CreateBucket`, even for an existing bucket, and only accepts already-exists errors. A bucket-scoped object-only token may return `AccessDenied`; pre-creating the bucket alone does not fix that code path. For this unchanged implementation, the credential must support bucket creation as well as object list/read/write/delete (R2 Admin Read & Write). Prefer a dedicated storage account to contain this broader permission. A future least-privilege improvement is to change bucket initialization to verify an existing bucket and then use a bucket-scoped token.
3. Put its endpoint and credentials in the `BACKUP_S3_*` settings. Keep these different from SeaweedFS credentials. R2 accepts `us-east-1` as an alias for its `auto` region, matching the app's shared S3 region setting.
4. Keep public bucket access disabled. API/worker processes also need this destination to write deletion tombstones.
5. Check successful backup upload and monthly isolated restore, not only container status. Do not put an independent expiry rule on tombstones; recovery needs them to avoid resurrecting deleted accounts.

Sources: [R2 credentials](https://developers.cloudflare.com/r2/api/tokens/), [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/). An equivalent off-host S3 provider is fine if it supports the operations above.

## 6. Start Jenkins locally, named `jenkins`

Run **on your computer**, from the repository root:

```sh
docker compose -f docs/deployment/examples/compose.jenkins.yml up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open `http://localhost:8080`, unlock Jenkins, and create your administrator. Treat the displayed initial password as a secret. The container stores Jenkins state in a named volume, binds only to loopback, and does not mount the host Docker socket. Do not start a second container with the same name if one already exists; inspect and reuse/migrate its volume first. See [Jenkins Docker installation](https://www.jenkins.io/doc/book/installing/docker/).

The supplied image installs Pipeline, Git, SSH Agent, Credentials Binding, and Timestamper. Set one executor for this small trusted personal installation. Do not run untrusted PR code on this controller. For a team, move build execution to a dedicated agent.

### SSH credentials

1. On your computer, generate a dedicated key: `ssh-keygen -t ed25519 -f ~/.ssh/capybudget_jenkins -C capybudget-jenkins`. Use a passphrase and store it in Jenkins along with the private key.
2. Install **only the `.pub` key** in `/home/deploy/.ssh/authorized_keys` on the VPS. Keep the existing administrator key.
3. In Jenkins → Manage Jenkins → Credentials, add **SSH Username with private key**, ID `capybudget-vps-ssh`, username `deploy`.
4. Obtain the server's Ed25519 host fingerprint from a trusted initial SSH session established using the verified EC2 host identity with `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
5. On your computer, use `ssh-keyscan -t ed25519 VPS_IP > capybudget-known-hosts` and `ssh-keygen -lf capybudget-known-hosts`. Compare fingerprints before trusting the file; keyscan alone does not authenticate the server.
6. Add that verified file as a Jenkins **Secret file**, ID `capybudget-known-hosts`. The pipeline enforces host-key checking. Update it deliberately if rebuilding the VPS changes its host key.

The VPS `deploy` account has Docker access, which is effectively root access. Protect the Jenkins administrator account, private key, and persistent volume accordingly. Production secrets stay on the VPS; they are not interpolated into the Jenkinsfile.

## 7. Create the Jenkins job

1. Edit `DEPLOY_HOST` in [Jenkinsfile](deployment/examples/Jenkinsfile) to your VPS IPv4 address. Commit this and the preparation changes.
2. Create a **Pipeline** job, for example `capybudget-production`.
3. Definition: **Pipeline script from SCM** → Git.
4. Repository: `https://github.com/fikriislamyy/capybudget.git`.
5. Branch: `*/main` (change only if your release branch has a different name).
6. Script path: `docs/deployment/examples/Jenkinsfile`.
7. If the repository is private, add a separate read-only GitHub checkout credential. The VPS SSH key is not the GitHub credential.
8. Begin with manual builds. Optionally enable Poll SCM with `H/5 * * * *`; GitHub webhooks cannot reach localhost directly. Do not expose Jenkins publicly just to receive webhooks.

Deploy only reviewed commits after the validation in section 3. The sample pipeline handles transfer/deployment; it does **not** run the integration/browser suites. Add a separate disposable CI test job before enabling unattended production releases.

### First deployment

Use **Build with Parameters** → `FIRST_DEPLOY=true` only for an empty database. Jenkins may need an initial run to register parameters; if the first run stops because no current release exists, rerun with the parameter after checking the database is new.

The deployment script:

1. Checks out the configured release commit, uploads committed source to `/opt/capybudget/releases/<commit>-<build>`.
2. Builds native images on the VPS before interrupting the old app.
3. Starts persistent infrastructure. The Compose project name stays `capybudget`, so volumes remain stable between release directories.
4. For updates, stops web/API/workers and takes a backup using the **old** release.
5. Applies checked-in Drizzle migrations once. It never runs `db:fresh`, migration generation, or `down -v`.
6. Starts web, API, five workers, backup scheduler and Caddy.
7. Checks both public API health URLs and the login page, then updates the `current` symlink.

Migration failures stop deployment; there is no automatic schema rollback. DNS must already point to the VPS and ports 80/443 must be reachable for certificates. See [deploy.sh](deployment/examples/deploy.sh) and [production Compose](deployment/examples/compose.production.yml).

For subsequent updates, leave `FIRST_DEPLOY=false`. Concurrent Jenkins deployments and concurrent remote deployments are blocked. Keep at least the previous release directory and images until the new version is proven good.

## 8. Verify the actual application

On the VPS:

```sh
cd /opt/capybudget/current
export APP_RELEASE="$(basename "$(pwd -P)")"
docker compose --env-file /opt/capybudget/secrets/production.env -f docs/deployment/examples/compose.production.yml ps
docker compose --env-file /opt/capybudget/secrets/production.env -f docs/deployment/examples/compose.production.yml logs --tail=100 api email-worker tracking-worker assistant-worker reports-worker privacy-worker backup
```

Do not share logs containing personal data or tokens. `/api/health` is process liveness only; worker `running` status is not queue readiness. Before inviting users, complete these checks:

- Both HTTPS domains have valid certificates; no API/database/storage ports are publicly exposed.
- Signup delivers the first OTP; verification, login, page refresh, onboarding, logout and password reset work.
- Login rate limiting distinguishes clients behind Caddy; secure cookies remain on the frontend origin.
- Create a transaction and upload/download a receipt.
- Generate an invoice PDF and a report export. This exercises Chromium on the VPS architecture.
- Create a recurring item; confirm the tracking worker creates the expected occurrence.
- Refresh a forecast; confirm the assistant worker finishes it.
- Trigger an opted-in reminder; confirm real delivery through the email worker.
- Run account export and deletion with disposable accounts; confirm privacy worker completion and off-host tombstones.
- Test PIN, authenticator 2FA and device unlock on the real HTTPS domain.
- Confirm backup freshness and successful isolated restore in Privacy settings/logs.

Optional browser push requires a stable VAPID key pair. Generate it using the installed `web-push` tool, set both keys and a real contact subject, restart API/workers, and verify subscription/delivery on a supported browser.

## 9. Backup, rollback and maintenance

The backup service runs the existing daily encrypted backup scheduler and monthly restore drill. PostgreSQL 18 data mounts at `/var/lib/postgresql`, **not** the old `/var/lib/postgresql/data` mount. Changing image major versions does not upgrade data; use a planned PostgreSQL upgrade.

The current backup limit is 128 MiB for dump plus referenced files. Watch actual size and memory use; raise it only with enough headroom or implement streaming as the app grows. See [security and recovery runbook](security-privacy.md) for encryption key retention, restore commands, deletion replay and isolated database/bucket requirements. The production template includes PostgreSQL client binaries and `BACKUP_POSTGRES_LOCAL=1`, so the backup container does not need a Docker socket.

For an immediate backup, from the current release with `APP_RELEASE` exported:

```sh
docker compose --env-file /opt/capybudget/secrets/production.env -f docs/deployment/examples/compose.production.yml run --rm --no-deps backup bun infra/backup/backup.ts create
```

**If a deployment fails:** inspect the failed stage before restarting anything. A failure before the stop step generally leaves the old app serving. A migration/health failure can leave the site offline or partly started. Keep it in maintenance while deciding recovery; the `current` symlink alone is not a guarantee of what containers are running.

For an application-only rollback **after confirming database compatibility**, change into the previous release, set `APP_RELEASE` to its directory name, then run its Compose `up -d --wait`. Update the `current` symlink only after health/user-flow checks succeed. Do not rerun old migrations to reverse a schema change. For incompatible migrations, restore the verified pre-deploy backup into an isolated database/bucket, replay tombstones, verify totals/files, and deliberately switch over; never overwrite live data as an automatic failure action.

Monitor disk space, memory, container restarts, queue failures, TLS renewal, SMTP limits, backup freshness and storage bills. Keep log rotation enabled. Do not prune volumes. Prune old build cache/images only after preserving the current and rollback release. Back up the local Jenkins volume securely; it contains credentials. OS/image patching and encrypted-disk configuration remain deployment responsibilities.

## 10. Common problems

### Caddy fails with `failed to set up container networking: Address already in use`

The original network template allowed automatic container allocation to use Caddy's fixed `172.30.0.2` address. The corrected configuration keeps automatic allocations in `172.30.0.128/25`:

```yaml
networks:
  app:
    ipam:
      config: [{subnet: 172.30.0.0/24, ip_range: 172.30.0.128/25}]
```

Docker's [IPAM configuration](https://docs.docker.com/reference/compose-file/networks/#ipam) supports a separate allocation range within the subnet. Caddy keeps `172.30.0.2`, matching `TRUSTED_PROXY_IPS`. An existing Docker network must be recreated to apply this change.

If the first deployment already migrated the database and started API/web, finish that failed release rather than rerunning `FIRST_DEPLOY=true`. On the VPS, find the failed release directory from the Jenkins build number; do not assume `/opt/capybudget/current` exists yet. Change into that release, edit its `docs/deployment/examples/compose.production.yml` to use the corrected network above, then:

```sh
export APP_RELEASE="$(basename "$PWD")"
docker compose --env-file /opt/capybudget/secrets/production.env -p capybudget -f docs/deployment/examples/compose.production.yml config --quiet
docker compose --env-file /opt/capybudget/secrets/production.env -p capybudget -f docs/deployment/examples/compose.production.yml down
docker compose --env-file /opt/capybudget/secrets/production.env -p capybudget -f docs/deployment/examples/compose.production.yml up -d --wait --wait-timeout 180
curl --fail --silent --show-error --retry 6 --retry-delay 5 --retry-all-errors https://capybudget.bebem.my.id/api/health
curl --fail --silent --show-error https://api.capybudget.bebem.my.id/api/health
curl --fail --silent --show-error --output /dev/null https://capybudget.bebem.my.id/login
```

`down` recreates containers/network and preserves named volumes; **do not add `-v`**. Only after startup and all three HTTP checks pass, record the recovered release:

```sh
ln -sfn "$PWD" /opt/capybudget/current
```

Ensure the corrected template is committed and pushed before the next Jenkins run. Subsequent deployments use `FIRST_DEPLOY=false`. If a networking error remains, inspect `docker network inspect capybudget_app` for duplicate addresses and `sudo ss -lntup` for host port 80/443 conflicts; port-bind errors and container-IP conflicts need different fixes.

Documentation checks completed: both Compose templates pass configuration validation (production used dummy interpolation values and skipped secret-file resolution), the deployment script passes Bash syntax checking, and local documentation links resolve. Images have not been built or exercised on a VPS; Jenkins, SSH, SMTP, S3, HTTPS and application smoke checks must be completed in your deployment environment.

| Symptom | Check |
| --- | --- |
| Frontend 502 | Adapter-node installed, web build exists, web/API health, worker startup errors |
| Login disappears after refresh | Frontend canonical auth URL, same-origin `/api` proxy, `ORIGIN`, secure cookies |
| Everyone seems rate limited | Caddy peer IP and single-hop trust configuration; no extra proxy enabled silently |
| OTP not delivered | Production SMTP sender/auth settings, email worker and queue/provider logs; Mailpit is not an external relay |
| Receipt or deletion fails with AccessDenied | Seaweed credentials, backup bucket `CreateBucket` permissions, historical encryption keys |
| PDF export fails | Locked Playwright browser installed inside image; native architecture build; RAM/headroom |
| Certificate not issued | Both DNS records, absent stale AAAA records, public 80/443, EC2 security group and host firewall |
| Backup restore drill fails | Database creation permission, temporary bucket creation/deletion, PostgreSQL 18 tools, complete keyring |
| SSH deployment fails | Home public IP allowed on port 22, verified known-hosts file, deploy public key, Jenkins running |
| Changes missing after deployment | Files committed and pushed to the configured release branch; git archive excludes uncommitted files |
