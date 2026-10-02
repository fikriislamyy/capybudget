# UI/UX refresh baseline — issue #16

Captured 2026-10-01. Reference commit: `1af1429`. Source requirements: `PRD.md` and `DESIGN.md`.

## Environment

Local Ubuntu 26.04 / WSL, Bun 1.4.2, Docker PostgreSQL 18, Redis 8, Mailpit and SeaweedFS. Browser/API checks use the disposable `capybudget_ui_test` database, Redis logical database 13, API port 3007 and web port 5177. The reference UI is an isolated `git archive` checkout in `/tmp/capybudget-ui-before`, served on port 5178 against the same synthetic test API. Existing development servers and database volumes are preserved.

Synthetic data includes personal/business workspaces, wallets, large exact decimal balances, transactions, budgets, goals, bills and invoices. Authentication uses real local Mailpit OTP messages. No real financial data or credentials are stored in these artifacts.

| Package | Resolved version |
|---|---|
| Svelte | 5.57.1 |
| Bits UI | 2.19.3 |
| shadcn-svelte CLI | 1.7.0 |
| Tailwind CSS | 4.3.3 |
| Vite | 8.3.1 |
| ECharts | 6.1.0 |
| TanStack Svelte Query | 6.3.0, retained without introducing a second cache |
| Playwright | 1.63.0 |
| axe-core Playwright | 4.13.0, new development dependency |

Body font remains the existing self-hosted Nunito Sans Variable; DESIGN names Nunito. Headings retain Fredoka Variable. Bottom sheets use shadcn Sheet with the Bits UI Dialog focus/scroll/Escape behavior; no animation engine or second chart library is introduced.

## Confirmed defects and implemented fixes

- Mobile navigation previously became a scrolling row. It now has labeled bottom destinations and a grouped More sheet; tablets use a compact menu and direct add action; desktops retain a sidebar.
- Quick-add lacked a focus trap/restoration, hid the source wallet and generated a new retry key. It now exposes the wallet/currency, traps/restores focus and retains an unchanged submission key.
- Workspace option responses could arrive late. They now have cancellation and identity guards; route components reset at workspace boundaries.
- Transaction entry was above the history list. Creation and filters now use sheets and visible filter chips.
- Dark link/navigation text and translucent primary-button hover states failed contrast checks. Dark primary/warning ink and solid hover tokens were adjusted; inputs have clearer boundaries.
- Indonesian assistant account selectors exceeded the phone viewport. Explicit native-select appearance and ellipsis keep options within their controls, including WebKit at enlarged text sizes.
- Report scroll regions lacked keyboard focus. They are labeled and focusable, with tables serving as chart alternatives.
- A materialization request could invalidate the recurring page and repeatedly trigger itself. Read-like recurring/report/assistant operations no longer trigger financial refresh invalidation.
- Preferences/onboarding SQL migration 0024 existed but was absent from the migration journal. It is registered and applied locally.
- Quick-add requested only amount/category while the backend required a note/merchant. Notes and merchants are now optional, matching PRD §5.
- Finishing onboarding did not refresh the shell workspace list. Completion now refreshes/selects the provisioned workspace before navigation; resumed goal steps reload category options.
- Session reads shared credential-attempt rate buckets and exhausted them during rapid navigation. Session reads now have a separate bounded quota; authentication attempt/cooldown limits are retained.
- Auth chrome used a separate cold palette. Auth screens and the public landing now share theme tokens, localized controls and accessible headings.

## Evidence

Before/after screenshots are under `screenshots/`. The reference screenshots are a reconstruction from commit `1af1429` using synthetic current API data, not historic production captures. Bundle/performance results are recorded in `bundle-metrics.json` and `production-metrics.json`; the handoff explains their scope.

The named mobile lab profile is headless Chromium, production builds, 390×844 viewport, CPU slowed 4×, 1.6 Mbps download / 750 Kbps upload and 40ms simulated network latency. Warm revisits are measured separately from quick-add opening and automated entry. Lab diagnostics do not establish field Core Web Vitals or a human task-time median.

Physical devices, installed iOS/Android PWA behavior, VoiceOver/NVDA and representative user testing are unavailable in this workspace. These limitations are recorded explicitly in the handoff.
