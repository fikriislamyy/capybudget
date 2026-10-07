# AI Assistant V2 — issues #9 and #10 requirement audit

Reviewed 6 October 2026 against [issue #9](https://github.com/fikriislamyy/capybudget/issues/9), [issue #10](https://github.com/fikriislamyy/capybudget/issues/10), `PRD.md` §6.7, and `DESIGN.md` chart, tone, mode and accessibility guidance. Issue #10 contains the ten V2 implementation steps; issue #9 supplies the shared product and safety rules.

## Status definitions

**Implemented** means the feature has a working calculation/service, authorized route and user interface. Verification below names the evidence and its limits. It does not mean every possible financial record, device or production environment has been exercised.

The ten V2 feature areas below are implemented. The audit closed the identified source-evidence and receivables presentation gaps. **Full release verification remains pending** for physical microphones and the deployment checks deferred by the user. Advanced seasonality and financial health scoring are outside this V2 release.

## Requirement matrix

Paths in this table are relative to `apps/api/src/assistant/` unless a different root is given.

| Issue #10 step | Implementation and user workflow | Verification and limits |
|---|---|---|
| **V1: What-if scenarios** | `v2/calculations.ts`, `v2/routes.ts`, `snapshot.ts`; Assistant → **What if?**. Immutable forecast snapshot; one-off purchase, delayed invoice, planned expense and recurring expense overrides; before/after minimum balance, safe-to-spend, first shortfall and changed events. Saved scenarios check the current source hash. | Exact purchase/invoice-delay unit fixtures and isolated stale-source tests; ledger unchanged. Overrides change selected events, not real schedules. No promise of future client payment. |
| **V2: Runway and burn** | `v2/data.ts`, `v2/calculations.ts`; Business → Assistant → **Insights**. 90 completed days; operating ledger classes only; transfers, opening/funding and marked one-offs excluded. Gross/net burn, unrestricted cash, dated window, coverage state and comparison with the configured forecast. | Negative cash, incomplete coverage and zero/nonpositive burn fixtures. No infinite runway claim. Classification and recording coverage must be correct; missing history gives no runway. |
| **V3: Payment prioritization** | `v2/routes.ts`, `v2/calculations.ts`; **Payment plan**. Overdue/essential/date ordering; explicit minimum and deferral terms; unpaid remainder and forecast simulation; links to existing bill/payable confirmation workflows. | Unit tests reject fabricated partial payments/terms and preserve outstanding obligations. Browser checks exercise the plan. Partial allocation requires the vendor payable settlement model. No automated payment, reminder or date edit. |
| **V4: Spending patterns** | `v2/data.ts`, `v2/calculations.ts`; **Insights** by category, account or permitted merchant. Equal elapsed monthly periods, absolute/percentage changes, chart and exact table. **See records** reveals dated, scoped source amounts. Category sources show allocated portions for splits. | Calendar/leap-month unit tests; bounded evidence, invalid grouping, unknown group and permission-revocation integration checks. Refunds recorded as income are separate; category changes alter historical grouping. Zero prior spending has no percentage. |
| **V5: Unusual/duplicate charges** | `v2/detection.ts`, `v2/data.ts`; review-only findings with detector version, median/MAD threshold, sample size, uncertainty and source records. **Intentional**, feedback/dismissal and links to transaction correction. | 51 labeled synthetic cases and detector regressions; [evaluation report](assistant-detection-evaluation.md) records false positives and false negatives. No automatic deletion, fraud accusation or new V2 anomaly notifications. These metrics are not production accuracy. |
| **V6: Late-paying customers** | `v2/data.ts`, `v2/calculations.ts`; Business **Insights → Customer payment history → See invoices**. Stable customer identity, settled-delay median, sample size, open/overdue amounts and invoice links to reminder/collection settings. | Below-five sample abstention; active payment/reversal filtering; scoped customer evidence tests. Unpermitted invoices and private contact details excluded. Bands describe payment history, not a credit score. |
| **V7: Savings/cost review** | `v2/opportunities.ts`, `v2/feedback.ts`; confirmed subscription overlaps/charge increases, budget overspend, bounded saving headroom and goal review. Copy offers a task to compare published prices/terms. Feedback controls future optional nudges. | Source permission filtering, exact money calculations and feedback integration tests. Charges do not prove nonuse. No external price integration, invented cheaper offer, yield recommendation or automatic cancellation. The issue explicitly permits a comparison task without a price integration. |
| **V8: Read-only conversations** | `v2/contracts.ts`, `v2/routes.ts`, `v2/providers/`; Assistant chat and floating **Ask Capy**. Allowlisted spending, receivables, forecast, bills and goals tools; local numeric facts and source citations. **Who owes me money?** includes customer names, invoice numbers and balances. | Scoped authorization, provider-off behavior, invalid tools, quota races, consent revocation during calls, provider identity, private history and browser tests. Real Groq/Muse EN/ID smoke checks passed in step 3. Text rendered by Svelte, no model HTML/SQL/network/write execution. Date tools currently support this/last month; arbitrary date ranges and contextual follow-up reasoning are not promised. |
| **V9: Text/voice entry** | `v2/entry.ts`, `v2/routes.ts`; `apps/web/src/lib/assistant/audio.ts` and chat entry review components. EN/ID amount/date validation, editable fields, required account/category choices, original text and explicit idempotent confirmation. Separate voice consent, 30-second/2-MB limits and editable transcription. | Shorthand and currency-suffix regressions; no-write draft and exactly-one confirmation checks; provider/voice consent tests; browser capture/conversion with simulated media; real ASR with generated speech for both providers. **Physical microphone checklist deferred**, not represented as passed. Audio is transient locally; provider retention is disclosed separately. |
| **V10: Check-ins/coaching/nudges** | `v2/summaries.ts`, `v2/summary-email.ts`, `v2/feedback.ts`, `worker.ts`; **Check-ins**. Weekly/monthly summaries; off/daily/weekly optional nudges; timezone, send time, quiet hours and in-app/email opt-in. Goal targets round upward and compare with conservative headroom. Durable outbox, grouped topics and current-consent checks. | Calendar/goal/feedback fixtures and isolated dedupe, opt-out, queued-change and Mailpit checks. Step 3 delivered both email cadences through the actual encrypted queue and worker, once despite repeated sweeps. Helpful/dismissed feedback and current opt-in preferences are recorded privately; no public analytics service added. Production scheduler/SMTP verification is deferred. |

## Changes made by this audit

1. Spending comparison groups now expose a stable source-group identity. A bounded evidence endpoint recomputes periods and scope before returning records; the table opens readable sources rather than displaying UUIDs.
2. Receivables join same-workspace customer names without retrieving contact details. Chat and citations name both customer and invoice; financial records remain local.
3. Customer payment history opens up to 50 permitted invoices, with dates, outstanding amounts and links to the existing invoice workflow. The server rechecks invoice permission on every request.
4. Runway shows its historical window and unrestricted cash, and compares with the deterministic cashflow forecast. The distinction between past operating pace and upcoming obligations is explained.
5. Added source-boundary integration tests and browser checks for these controls. Removed the redundant per-customer name lookup by reusing the authorized invoice result.
6. Weekly goal targets now round upward to the goal currency's usable minor units, using the existing currency rules. For example, dividing IDR 100 across three weeks gives IDR 34 per week rather than an unspendable fractional-rupiah target. The affordability comparison uses that rounded amount. Regression coverage includes IDR, USD, KWD and a deadline today.

No migration was needed. The audit does not change the underlying financial ledger or introduce an external price provider.

## Shared safety and release gates

| Gate | Evidence/status |
|---|---|
| Exact decimal calculations, zero/negative states and overflow | Assistant money/calculation unit suites; amount strings remain authoritative. Chart proportions are presentation only. |
| Workspace/account/user boundaries, RLS and private derived data | Isolated integration checks cover unauthorized workspaces, viewer writes, SQL ownership, source exclusions and consent changes. New evidence routes use the same scope machinery. |
| No autonomous financial writes | Read-only chat; drafts do not post; explicit confirmation and retry protection tested. Scenarios and planning preserve the ledger. |
| External data defaults off; separate voice permission; no silent provider fallback | Provider and consent suites; live synthetic Groq/Muse smoke report. Only submitted text/audio is sent to providers. |
| Evidence, disclaimer and conservative missing-data handling | V2 panel/chart/table, source views, comparison notes and forecast quality states; incomplete coverage has no guaranteed allowance. |
| Feedback and optional nudge suppression | Private feedback rows; two distinct negative suggestions pause that topic for 14 days; dismissal suppresses it. Due-date alerts retain independent preferences. |
| Export/deletion and retention | Assistant privacy inventory and integration checks; actor-owned derived data and content expiry remain included. |
| EN/ID, Night Pond, mobile and reduced motion | Browser checks exercise 1440/390px English and 1440/360px Indonesian Night Pond/reduced motion. |
| Physical microphone/device coverage | **Deferred by user.** Checklist in [assistant-local-verification.md](assistant-local-verification.md). Simulated media and generated-speech ASR are separate evidence. |
| Production provider/SMTP/worker scheduling | **Deferred by user.** Local verification does not establish deployed operation. |
| Real-world forecast/model quality | Not established by these fixtures. Detection ambiguity is measured and disclosed; no universal predictive-accuracy claim. |

## Verification commands

Audit verification passed: **132 unit tests**, **22 isolated integration tests**, API TypeScript, Svelte checks (zero errors/warnings), and the desktop/mobile browser flows. An intentional mutation of account grouping was caught by its new regression test and restored. The web production build passed; it reported existing `:global` CSS warnings in privacy/security settings and date-library circular dependencies outside this audit.

The final integration rerun initially hit the running local database's connection limit. It passed against a freshly migrated temporary PostgreSQL 18 container using the same isolated fixtures and Redis database 14. That container was removed after verification. The running development processes and application database were left untouched; the connection-limit condition was not fixed by this feature audit.

```sh
bun run --cwd apps/api test:assistant
bun run --cwd apps/api test:assistant:v2
bun run --cwd apps/api test:assistant:v2:browser
bun run --cwd apps/api check
bun run --cwd apps/web check
bun run --cwd apps/web build
```

The V2 integration/browser scripts use isolated financial fixtures and mocked providers. Live provider and actual queued email results are saved separately in [assistant-live-verification.json](assistant-live-verification.json). Do not treat mocked calls as a fresh live-provider check after changing models or credentials.
