# Issue #16 implementation handoff

Updated 2026-10-01. The UI implementation is complete across the routes in
`issue.md`. Automated browser and static verification are recorded below.
Physical-device, screen-reader and representative-user acceptance remain
external checks; this document does not claim those checks were performed.

## Delivered

- Mobile bottom navigation and grouped More sheet; tablet menu and quick-add;
  desktop sidebar. Workspace switching remounts workspace-specific screens
  and leaves business-only routes when switching to personal finances.
- Shared headings, states, rows, money display, status badges and keyboard
  scroll regions; warm semantic light/dark tokens and consistent shapes.
  Public landing, auth screens and onboarding follow the same visual system.
- Accessible sheets, dialogs, menus and appearance radios. Sheets trap and
  restore focus, support Escape, and keep actions reachable in short layouts.
- Quick-add shows its source wallet/currency, focuses amount immediately,
  validates localized decimals exactly, retains drafts, refreshes changed
  wallets and ignores stale workspace responses. Full transaction entry and
  quick-add reuse an idempotency key after ambiguous failures.
- Seamless English/Indonesian and light/dark/system changes; a 350ms theme
  reveal moves from top right to bottom left. Reduced motion, unsupported
  browsers and privacy/security changes cancel or bypass the snapshot.
- Independent 30-second security checks with request timeout and retry;
  60-second finance refresh skips active forms/dialogs. Initial security
  failure can recover and hydrate workspaces. Recurring materialization no
  longer triggers a refresh loop; report exports do not invalidate themselves.
- Lazy modular ECharts, responsive charts, accessible exact-value tables,
  privacy masking and stable dashboard/report content during refresh.

## Supporting changes

The transaction API now accepts optional notes/merchant, matching the PRD
quick-add contract. Numeric and financial validation remain server-side.

Session reads use their own bounded **1,000 requests per 60 seconds per IP**
budget in Redis and Better Auth. SSR reads share a server IP and previously
exhausted the 100-request credential bucket during navigation. Signup, login,
OTP and password-reset attempt/cooldown quotas remain unchanged. Both the
bucket separation and 120 consecutive session reads are regression checked.
Per-endpoint configuration follows the [Better Auth rate-limit documentation](https://better-auth.com/docs/concepts/rate-limit).
The existing `0024_ux_mvp` migration was registered in Drizzle's journal and
successfully applied to the local database; it provides `user_preferences`
and `onboarding_state`. No financial data or volumes were deleted.

`@axe-core/playwright` was added as a development dependency. The existing
Nunito Sans Variable font remains (the naming difference from DESIGN.md's
Nunito is recorded in `baseline.md`). Bottom overlays use shadcn Sheet with
Bits UI's focus management. No framework or data-layer migration was needed.

## Verification and isolation

All mutation checks use the disposable `capybudget_ui_test` database, Redis
logical database 13, API port 3007 and web port 5177. Existing developer
services and finance data are not test fixtures. Mailpit supplies synthetic
signup OTPs. Virtual platform WebAuthn checks do not establish hardware
biometric behavior.

- Web type/Svelte check: **0 errors, 0 warnings**.
- API TypeScript check: passed.
- Web production build: passed.
- Auth-rate/tracking/UX/amount/report/personal-finance/notification unit checks:
  **29 passed, 1 skipped, 73 assertions**.
- Isolated tracking integration: **1 passed, 473 assertions**. Fault-injection
  errors in that log are expected test inputs.
- Chromium: **15 passed** in the complete auth/security/UI run.
- Report export smoke check: **CSV, Excel and PDF downloads passed** through
  the mobile UI; PDF/XLSX file signatures and nonempty content were checked.
  See `export-results.json`.
- WebKit: **12 passed, 1 skipped** (performance profiling is Chromium only).
- Firefox: **12 passed, 1 skipped** (performance profiling is Chromium only).

Browser coverage includes 19 authenticated routes at 390/820/1440px,
additional 320/360/430/768/1024px layouts, short landscape, light English and
dark Indonesian, nine public/auth routes, axe WCAG A/AA checks, focus
containment/restoration, primary-button hover contrast, exact-money retry
handling, offline/security recovery, workspace races, draft retention and wallet cache invalidation.
A 320px viewport checks the reflow equivalent of 400% zoom from 1280px;
200% text enlargement is simulated by doubling computed text sizes. Browser
chrome zoom and physical software keyboards still require external testing.
Full auth/security flows cover signup, OTP, onboarding, login, password reset,
PIN, virtual device credentials, privacy, session management and notifications.

## Measurements and visual evidence

See `production-metrics.json`, `bundle-metrics.json` and `screenshots/`.
The production profile uses warm cache, Chromium headless, 4× CPU slowdown,
1.6 Mbps download, 750 Kbps upload, 40ms latency and a 390×844 viewport.
Ten quick-add entries are automated; they are not a human usability study.
Baseline screenshots/timings reconstruct reference commit `1af1429` with the
same synthetic workspaces. The final warm-dashboard median is **891ms**
(reference **751ms**); quick-add becomes visible in **154ms**, and automated
entry completes in **745.5ms**. All meet the lab median targets;
dashboard revisit latency increased by 140ms, so no latency improvement
is claimed. Ten successful entries and cleared amount fields were confirmed;
only **2** wallet/category option requests were needed. Wallet/category
mutations and the idle refresh invalidate those options separately from
transaction saves. Success-message timers are cancelled on close, workspace
change and each new save, so older feedback cannot acknowledge a newer entry.
The final profile measured CLS 0 and LCP 428ms; these are lab diagnostics,
not production field results. Timings vary between runs; raw trials are retained.

Emitted client JavaScript decreased from **1,851,555 to 1,471,713 bytes**
(**20.5%**). This sums all lazy route chunks and the service worker; it is
not the initial page payload. The largest lazy ECharts chunk is 552,199 bytes
(184,658 gzip), so charts still have a material payload when opened.

## Reproduce

Install dependencies and start the existing Compose development services.
Create a disposable database ending in `_test`, apply migrations to that
database, and reserve a nonzero Redis logical database. Never point browser
or tracking integration tests at the normal development database.

```sh
bun run --cwd apps/web check
bun run --cwd apps/api check
bun run --cwd apps/web build
DATABASE_URL="$UI_TEST_DATABASE_URL" REDIS_URL=redis://localhost:6379/13 \
bun --env-file=.env test apps/api/tests/auth/rate-limit.test.ts apps/api/tests/tracking apps/api/tests/ux apps/api/tests/reports/periods.test.ts apps/api/tests/personal-finance/money.test.ts apps/api/tests/notifications/math.test.ts apps/web/tests/ui/amount.test.ts

# From apps/web; use your local test credentials through environment variables.
DATABASE_URL="$UI_TEST_DATABASE_URL" REDIS_URL=redis://localhost:6379/13 \
TEST_API_PORT=3007 TEST_WEB_PORT=5177 UI_PRODUCTION=1 \
bunx playwright test
```

To repeat the finance integration against a deliberately started test API:

```sh
DATABASE_URL="$UI_TEST_DATABASE_URL" TRACKING_TEST_DATABASE_URL="$UI_TEST_DATABASE_URL" \
REDIS_URL=redis://localhost:6379/13 AUTH_TEST_API_URL=http://localhost:3007 \
PUBLIC_APP_URL=http://localhost:5177 BETTER_AUTH_URL=http://localhost:5177 \
TRACKING_INTEGRATION=1 bun --env-file=.env test apps/api/tests/tracking/workspace.test.ts
```

For matching Docker Firefox/WebKit browsers on a host without their native
libraries, run Playwright's server (version must match the installed client):

```sh
docker run --rm --name capybudget-ui-review-browsers \
  -p 127.0.0.1:9223:9223 -v "$PWD":/workspace:ro -w /workspace/apps/web \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  node node_modules/@playwright/test/cli.js run-server --host 0.0.0.0 --port 9223

# In apps/web, add the same isolated DATABASE_URL/REDIS_URL/port environment.
UI_BROWSER=firefox UI_BROWSER_WS=ws://localhost:9223/ UI_PRODUCTION=1 \
bunx playwright test tests/ui/refresh.spec.ts
# Repeat with UI_BROWSER=webkit.
```

The configuration forwards loopback traffic using Playwright's
[`exposeNetwork` connection option](https://playwright.dev/docs/api/class-browsertype#browser-type-connect).
`UI_REUSE_SERVERS=1` is only for deliberately started test servers on those
ports. `UI_BASELINE_URL` optionally supplies the reconstructed reference
preview for the Chromium performance comparison.

## Acceptance requiring external evidence

See `checklist.md`: physical Android/iOS and software keyboards/PWA safe
areas; VoiceOver/NVDA review; previous supported browser versions and Edge;
representative users completing the five tasks; and production field Core
Web Vitals. Automated axe, desktop WebKit and virtual WebAuthn cannot establish
these results. Keep those acceptance items open until evidence is recorded.
