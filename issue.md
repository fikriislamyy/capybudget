# Notifications and Reminders — implementation plan

## 1. Objective and reading order

Build a reliable, workspace-scoped notification center for Personal and Business finances. A junior programmer or coding model should complete the numbered MVP steps in order, including their acceptance checks, before starting V2.

Planning baseline: repository inspected on 2026-09-30. This document proposes work; unchecked tasks are not claims that functionality is already complete.

Read these files first:

1. `PRD.md`: sections 6.3 (budget alerts), 6.4 (reminders), 6.7 and 8 (assistant alerts and consent), 7 (money rules), 9 (security, accessibility, localization), and 17 (quality).
2. `DESIGN.md`: sections 3 (semantic colors), 4.6 (steam notifications), 8 (motion), 9 (tone), 10 (business mode), 11 (alerts), and 13 (accessibility).
3. `apps/api/src/db/schema.ts` and existing notification migrations before designing new tables.
4. The existing code listed in section 3 before adding routes, producers, or workers.

## 2. Scope and priority decisions

| Feature | Phase | Deliverable |
|---|---|---|
| Bill, invoice, and payment due dates | MVP | Upcoming, due-today, and overdue reminders to the authenticated workspace user |
| Budget threshold alerts, such as 80% used | MVP | Configurable thresholds, default 80% and 100%, with accurate period totals and duplicate prevention |
| Low-balance and unusual-spending alerts | MVP | Recorded-balance monitoring, integration with existing projected cashflow alerts, and an explainable deterministic unusual-expense rule |
| Goal milestone celebrations | V2 | Once-per-milestone notifications and optional accessible celebration |
| Customizable channels: push, email | V2 | Unified per-type channel matrix, device management, quiet hours, and delivery controls |
| WhatsApp / SMS channels | Advanced | Explicit opt-in, verified destinations, provider adapters, delivery callbacks, opt-out, and cost controls |

### Resolve differences from the PRD explicitly

- The PRD places basic push/email reminders and notification preferences in P0. They already exist in this repository. Preserve their controls, consent, and behavior in MVP; V2 expands them into a unified channel configuration screen for every new event type. Do not remove working channels to match the phase labels.
- The PRD places broad anomaly/duplicate detection in a later release. This request makes **unusual spending** MVP. Implement the limited deterministic detector below now. Fraud classification, duplicate-payment detection, machine learning, and subscription detection remain outside this issue.
- MVP must deliver every new event type in-app. Existing bill and assistant email/push delivery remains supported and must pass regression checks. New event types use in-app delivery by default; do not silently subscribe users to external delivery.
- “Payment due” means an existing bill occurrence or scheduled outgoing recurring payment. Do not invent an accounts-payable, debt, credit-card statement, or payment-processing system for this issue. Add adapters when those domain features exist.
- Invoice reminders in this issue notify the workspace owner about money owed to the business. Emailing a customer continues through the existing invoice reminder preview and explicit confirmation workflow.
- MVP recipients are workspace owners, matching current finance reminder behavior. Assistant-derived notifications retain their existing actor scope. Do not introduce sharing, member invitation, or new roles in this issue.

## 3. Existing implementation to reuse

| Existing area | Files / tables | Required approach |
|---|---|---|
| In-app inbox and read state | `finance_notifications`; `personal-finance/routes.ts`; `(app)/+layout.svelte` | Extend the existing records and APIs; keep existing IDs and read state |
| Bill scheduler | `personal-finance/reminder-scheduler.ts`; `bills`, `bill_occurrences` | Extract reusable evaluation logic, add overdue handling and durable delivery tracking |
| Budget alerts | `tracking/routes.ts`; `budgets`, budget periods and revisions | Reuse money/category semantics; move notification evaluation into shared logic and cover all mutations |
| Email/push choices | `finance_notification_preferences`; `push_subscriptions`; bills UI | Preserve opt-outs and encrypted push credentials; keep old preference payloads compatible during migration |
| Email transport | `email/queue.ts`, `email/worker.ts`, mailer and encryption modules | Reuse BullMQ and SMTP; use local Mailpit for acceptance checks |
| Browser push | `apps/web/static/push-worker.js`; push registration routes | Extend existing service worker integration rather than registering a competing worker |
| Forecast alerts | `assistant/suggestions.ts`, forecast/settings/refresh code | Reuse existing projected alerts, evidence, source freshness, consent, dismiss/snooze behavior |
| Invoice follow-up | `business/routes.ts`, `business/worker.ts`, `invoice_deliveries` | Preserve the existing customer-send confirmation and delivery records |
| Workspace isolation | Current scoped API helpers and RLS policies | Enforce both workspace membership and recipient identity |

Observed gaps to address:

- The inbox currently returns at most 100 active notices; counting those rows is not a reliable total unread count.
- Some bill scheduling paths set `email_sent_at` when a job is queued. Queue acceptance does not mean SMTP accepted the email.
- Push delivery is aggregated into one timestamp, which cannot describe partial success across several devices.
- Bill reminder copy has hard-coded English paths. New notifications need structured message keys and EN/ID rendering.
- Existing budget and assistant producers must not run alongside replacement producers and create duplicate alerts.

## 4. Behavioral rules: implement these before the UI

### 4.1 Shared rules

- Store money as the repository's `NUMERIC(19,4)`/decimal strings; use its integer-unit helpers for comparisons. Never compare money using JavaScript floating point.
- Compare amounts only within one currency. Show the source currency; never silently convert or sum different currencies.
- Use workspace-local calendar dates for due dates and budget periods. Store worker execution instants as UTC `timestamptz`. Inject a clock into evaluators for deterministic tests.
- A reminder is informational. Reading, dismissing, or snoozing it must not post a transaction, mark an invoice paid, or move money.
- Read, dismissed, snoozed, resolved, and expired have different meanings. Reading changes the unread count; resolving means the financial condition no longer applies.
- Notification settings control these alerts independently of external AI. Recorded-balance and deterministic spending alerts work without an LLM. Assistant-derived projected alerts must still honor assistant data scopes, consent versions, and opt-outs.
- A worker must recheck membership, current source state, expiry, recipient verification, and channel preference immediately before external delivery.

### 4.2 Bill, invoice, and outgoing payment reminders

1. Reuse bill `reminder_days` (currently defaults to `[3, 0]`). Use the same default for invoice and outgoing recurring-payment rules unless changed by the user.
2. Proposed MVP schedule: evaluate every minute; release date-based reminders at 09:00 workspace time, with one additional overdue stage on the day after the due date. Lead days are configurable integers from 0 to 90; overdue is a separate stage, not a negative lead day.
3. After downtime, create at most one current applicable stage per source, choosing overdue over due-today over lead-time. Catch up only the preceding seven local days, then record skipped/expired stages so old records do not create an alert flood.
4. Only unpaid, enabled, non-archived bill occurrences are eligible. Paid/skipped/deleted occurrences resolve their active alerts and cancel pending delivery.
5. Only issued/sent or partially paid invoices with a positive outstanding balance are eligible. Calculate outstanding from the existing invoice/payment logic; never alert on drafts, paid, or void invoices. Include the remaining amount after partial payment.
6. For outgoing recurring payments, derive the occurrence date from the existing recurrence engine. Match generated/paid occurrences using existing occurrence identity. If a bill already references that recurring rule, use the bill reminder and suppress the second payment reminder. Income and transfers do not create outgoing-payment alerts.
7. Dedupe identity: workspace + recipient + source type + source ID/occurrence + effective due date + reminder stage. An amount-only change updates evidence without creating another due reminder. A changed due date cancels old pending stages and schedules the new date.
8. During migration, do not send historical reminders again. Seed a cutover watermark; apply the bounded catch-up policy only after the new scheduler is active.

### 4.3 Budget thresholds

- Reuse the budget's configured thresholds, default `[80, 100]`, including existing validation. Use the same category/subcategory, currency, date, deletion, and revision rules as the budget screen.
- Trigger at `spentUnits * 100 >= budgetUnits * thresholdPercent` for a positive planned amount. For a zero budget, any positive spend yields a dedicated “spending against a zero budget” event; do not divide by zero.
- Evaluate after transaction create/edit/delete/restore, category/account/date changes, budget edits, and period rollover. Editing a transaction across categories or periods invalidates both old and new scopes.
- Emit each threshold once per budget period and recipient. If one edit crosses 80% and 100%, display the highest threshold and record both as reached to avoid two simultaneous notices.
- A refund, deletion, or budget increase can resolve an alert. Preserve the threshold's emitted marker until the period ends so repeated edits do not spam the user. Explain this behavior in settings.
- Include planned, spent, remaining, currency, category, threshold, and period boundaries in the evidence. Link to the existing budget screen.

### 4.4 Recorded low balance and projected shortfalls

- For each enabled account rule, calculate the recorded balance from the existing effective-dated ledger. Do not derive balance by summing only expense transactions.
- MVP recorded-balance rules apply to cash, bank, e-wallet, and savings accounts. Credit cards and investments need different semantics and are not treated as liquid cash.
- Thresholds are explicit account-currency decimal values configured by the user. A new account rule is disabled until configured; zero is a valid threshold that warns only when negative.
- Trigger when balance is strictly below the threshold. Create one notification per below-threshold episode. Rearm after balance reaches threshold plus 5% of its absolute value; for a zero threshold, rearm at zero. Compute this hysteresis in integer units.
- Transfers, opening-balance changes, reversals, backdated entries, and account archival must invalidate the affected evaluations. Future-dated entries must not change today's recorded-balance alert.
- Keep current and projected balances clearly labeled. Reuse assistant forecast alerts for future dates; do not rerun a second forecast or relabel its estimate as actual cash.
- Suppress overlapping projected low-balance notices for an already-below-threshold account when they convey the same condition; preserve distinct future shortfall information. Do not disable assistant consent checks to accomplish this.

### 4.5 Unusual spending: bounded MVP detector

Use a deterministic rule, proposed version `unusual-expense-v1`, rather than an LLM:

1. Evaluate new or edited, non-deleted positive expense transactions. Ignore income, transfers, opening entries, and reversed/deleted records according to existing domain semantics.
2. Compare within the same workspace, currency, and exact category (uncategorized is its own group). The baseline is the preceding 90 calendar days, excluding the candidate and its date. Do not use later transactions when evaluating a backdated item.
3. Require at least 10 eligible baseline transactions spanning at least four dates. Otherwise record `insufficient_history` and produce no unusual-spending alert.
4. Calculate median and median absolute deviation (MAD) in integer units; for even counts use the integer midpoint rounded down. Flag only when the expense is strictly greater than all of: `3 × median`, `median + 6 × MAD`, and a user-configured minimum amount in that currency. The minimum must be set before the rule is enabled. These are initial product heuristics, not validated fraud predictions.
5. Save sample count, window, median, MAD, comparison threshold, candidate amount, currency, and rule version as structured evidence. Example copy: “This expense is higher than your usual Food spending. Review the transaction.” Never call it confirmed fraud.
6. Dedupe by recipient + transaction ID + rule family. Edits update or resolve the existing item rather than generating a new notification every time. Preserve dismissal; only an explicit user reset should undo it.
7. Changes to historical expenses can affect later baselines. Mark the affected category/currency/date ranges dirty and reevaluate in bounded batches; do not synchronously rescan an entire workspace on every write. After a full historical recomputation, resolve stale alerts and apply the catch-up policy to new ones.

## 5. Suggested tables and schema changes

Prefer extending existing tables. The MVP proposal needs **three new tables** plus additive changes to existing notification tables. Do not duplicate invoices, payments, bills, budgets, goals, accounts, or forecast data.

### 5.1 Extend `finance_notifications` — durable user-visible inbox

Keep current IDs, `workspace_id`, `user_id`, `kind`, `source_id`, `dedupe_key`, title/message, read state, assistant reference, and timestamps.

Add:

- `source_type text`, `source_revision text`, `rule_version text` for source identity and freshness.
- `message_key text`, `message_params jsonb`, `evidence jsonb` with validated, size-limited schemas. Decimal amounts inside JSON remain strings.
- `severity text` constrained to `info | attention | urgent`; seriousness must reflect evidence.
- `action_type text` and validated source IDs for safe internal navigation. Do not store an arbitrary caller-provided URL.
- `dismissed_at`, `snoozed_until`, `expires_at`, `updated_at` as appropriate timestamps. Keep existing `resolved_at` and add `resolution_reason`.
- Unique `(workspace_id, user_id, id)` to support scoped composite child foreign keys. Retain existing unique `(workspace_id, user_id, dedupe_key)`.
- Index `(workspace_id, user_id, created_at DESC, id DESC)`; add an active-unread partial index over unread, unresolved, undismissed records. Evaluate snooze/expiry against the current time in the query, not a volatile index predicate.

`source_id` is currently a non-null UUID. Every new producer must supply a real domain UUID; a recurring occurrence may use its rule UUID plus occurrence date in the dedupe key/evidence. Polymorphic source references require type-specific scoped validation; a UUID alone does not prove ownership. Use typed foreign keys where feasible and explicitly resolve or delete dependent notifications when sources are removed.

Keep title/message as legacy fallback during migration. New UI renders translated message keys. Retain legacy sent timestamps for compatibility, but new delivery rows become authoritative for transport state.

### 5.2 Extend `finance_notification_preferences` — existing user choices

- Preserve key `(workspace_id, user_id, event_type, channel)` and all existing opt-outs.
- Add `in_app` to the constrained channel list; allow the canonical new event types.
- Add a monotonic `version` and retain `updated_at` so pending deliveries can detect changes.
- MVP: new types default to in-app enabled and external channels disabled; preserve current bill/assistant defaults for existing types. Disabling a type suppresses its pending deliveries and hides or resolves active items with a preference-disabled reason.
- V2: add validated quiet-hour start/end and timezone, or a separate single row of delivery settings per recipient if repeating them per event would be confusing. All-day mute is an explicit state; midnight-crossing intervals must work.
- Keep old bill/assistant preference fields as an API adapter until their callers migrate. Map old and new fields to the same rows; never maintain two preference stores.

### 5.3 Add `finance_notification_rules` — user-configured detector settings

Suggested columns:

`id uuid`, `workspace_id uuid`, `user_id text`, `rule_type text`, `scope_key text`, `account_id uuid NULL`, `category_id uuid NULL`, `currency varchar(3) NULL`, `enabled boolean`, `parameters jsonb`, `version integer`, `created_at`, `updated_at`.

- Unique `(workspace_id, user_id, rule_type, scope_key)`; `scope_key` is required and canonical, such as `account:<uuid>` or `category:<uuid>:IDR`.
- Use composite workspace/source foreign keys for account/category references and validate that the scope matches `rule_type`.
- Parameters have a strict per-type schema: account threshold; unusual-spending minimum; invoice/payment lead days and local reminder time. Store amounts as decimal strings with database validation where possible.
- Keep budget thresholds on `budgets.alert_thresholds` and bill lead days on `bills.reminder_days`; do not create a second editable source for those values.
- Existing assistant account policy thresholds remain authoritative for projected alerts. Recorded-balance rules here are separate and explicitly labeled.

### 5.4 Add `finance_notification_evaluation_state` — dedupe and durable recovery

Suggested columns:

`id uuid`, `workspace_id`, `user_id`, `rule_key text`, `scope_key text`, `period_key text NOT NULL`, `rule_version`, `source_version`, `dirty_version bigint`, `processed_version bigint`, `cursor jsonb`, `state jsonb`, `next_evaluation_at`, `lease_expires_at`, `attempts`, `last_error_code`, `updated_at`.

- Unique `(workspace_id, user_id, rule_key, scope_key, period_key)`. Use a canonical non-null period/episode key; avoid uniqueness defeated by NULL values.
- Store threshold emission markers, low-balance episode state, rule-specific scan cursors, and the migration cutover watermark here. Use small validated state objects, not copies of every transaction.
- Index due work by `next_evaluation_at` and lease expiry. Dirty versions are incremented in the same transaction as source mutations.
- Worker claims a bounded batch, evaluates a coherent source snapshot, inserts/updates notices, and advances `processed_version` atomically. If source/dirty version changed during evaluation, retain pending work; never clear a newer invalidation.
- Recover expired leases and retain emission markers longer than inbox display retention to prevent old alerts from reappearing after cleanup.

### 5.5 Add `finance_notification_deliveries` — transport outbox and results

Suggested columns:

`id uuid`, `workspace_id`, `user_id`, `notification_id uuid`, `channel text`, `destination_key text NOT NULL`, `push_subscription_id uuid NULL`, `generation integer`, `preference_version integer`, `status text`, `attempts integer`, `available_at`, `expires_at`, `lease_expires_at`, `send_started_at`, `provider_message_id text NULL`, `last_error_code text NULL`, `accepted_at`, `delivered_at`, `created_at`, `updated_at`.

- Composite foreign key `(workspace_id, user_id, notification_id)` references the scoped notification key with cascade deletion. Push subscription references must also match workspace and recipient.
- Unique `(workspace_id, user_id, notification_id, channel, destination_key, generation)`. Use `email:<userId>` or `push:<subscriptionId>`; no raw email address or push secret in the dedupe key. One push row per subscribed device.
- Constrain status to `pending | processing | accepted | delivered | retryable | failed | cancelled | expired | unknown`. In-app persistence needs no SMTP delivery row.
- Index `(status, available_at)` and active lease expiry. Enforce nonnegative attempts and valid timestamp/state transitions.
- Insert outbox rows in the same database transaction as notifications. BullMQ carries delivery IDs and acts as a wakeup mechanism; periodic database recovery handles lost Redis jobs.
- SMTP acceptance sets `accepted_at`, not proof of mailbox delivery. Set `delivered_at` only from a reliable provider receipt. Record ambiguous outcomes as `unknown`, without a blind automatic resend.
- Persist `send_started_at` before calling the provider. After a crash, recover expired leases with no send attempt normally; reconcile a started send through provider idempotency/receipts when available, otherwise mark it unknown. A lease timeout alone is not proof the provider did not accept the message.
- New generation is only for an explicit retry or a genuinely new reminder occurrence. A normal preference save or scheduler tick must not increment it and resend old messages.

### 5.6 Existing tables to retain; later tables

| Table | Phase / purpose |
|---|---|
| `push_subscriptions` | Reuse now; V2 can add device label, last success/failure, revoked timestamp. Keep encrypted secrets and per-workspace ownership |
| `bills`, `bill_occurrences`, recurring rule/occurrence tables | Canonical obligation and payment source; no new generic payments table |
| `budgets`, budget periods/revisions, categories, transactions | Canonical budget and spending sources |
| accounts and journal tables | Canonical recorded balances |
| invoices, payments, `invoice_deliveries` | Invoice outstanding amount and confirmed customer reminder delivery |
| assistant settings/policies, forecast runs, suggestions | Existing consent-aware projected warnings |
| savings goals and contributions | V2 milestone source; reuse evaluation state to record 25/50/75/100% markers |
| `notification_contact_points` | Advanced only: verified phone/channel destinations, encrypted values, consent/verification/revocation timestamps |
| `notification_provider_events` | Advanced only: unique provider callback IDs, delivery reference, status, received time; minimal retained payload |

### 5.7 Isolation, retention, and migration rules

- All new recipient tables require `workspace_id` and `user_id`, membership checks, RLS `USING` and `WITH CHECK`, and appropriate composite keys. A worker must use a deliberately scoped internal path; request clients cannot select another recipient.
- Apply additive migrations with the next available sequence number. Backfill source types/message fallbacks safely, then add stricter constraints after invalid legacy rows are handled.
- Do not rewrite immutable applied migrations, delete existing notices, reset read state, replay old emails, or reset preferences.
- Old bill `email_sent_at` values may indicate queued rather than sent. Preserve them as legacy/unknown delivery evidence and do not automatically resend them. Classify old email/push jobs at cutover and allow existing auth email queues to continue normally.
- Proposed retention defaults: resolved/expired/dismissed inbox content 90 days, terminal delivery metadata 30 days, closed-period dedupe markers 400 days. Never purge active alerts merely because they are old; reevaluate their sources first. Make defaults configurable and document them as product choices.
- Keep active episode state and V2 goal milestone markers for the lifetime of their source. Retention must not rearm a low-balance episode or repeat a goal celebration.
- Prevent historical resurrection using scheduler cutover/catch-up limits even after dedupe markers expire. Account/workspace deletion must remove derived content, cancel pending deliveries, and invalidate device access.
- Logs contain event kind, delivery ID, status, attempts, timing, and sanitized error code. Never log OTPs, tokens, push credentials, full destinations, or full financial evidence.

## 6. Proposed API and UI contract

Extend the existing workspace notification routes; register each path once. Use Better Auth, existing scoped helpers, Elysia validation, and typed client conventions.

| Method and workspace-relative path | Purpose |
|---|---|
| `GET /notifications?state=unread&type=...&cursor=...&limit=25` | Cursor page ordered by `(created_at DESC, id DESC)`; cap limit at 100; preserve `items` for old callers |
| `GET /notifications/unread-count` | Accurate count for current actor/workspace, excluding resolved/dismissed/expired/snoozed items |
| `PATCH /notifications/:id/read` | Existing idempotent mark-read route |
| `POST /notifications/read-all` | Mark eligible records read up to a server-validated cutoff; newly arriving records stay unread |
| `PATCH /notifications/:id/dismiss` | Idempotent dismissal; cancel unsent deliveries |
| `PATCH /notifications/:id/snooze` | Valid future time, at most 30 days and no later than notification expiry; does not change the source due date |
| `GET/PUT /notification-rules` | List/upsert validated settings with optimistic version checks; only the actor's rules |
| `GET/PUT /notification-preferences` | Preserve legacy fields; return/apply the canonical event/channel choices |

Use consistent responses: 401 unauthenticated, 403 unverified if required by current finance routes, 404 inaccessible source/notification, 422 invalid input, 409 stale setting version. Set `Cache-Control: private, no-store`. Rate-limit mutations. Never trust a request `userId`, absolute action URL, destination address, or arbitrary kind/payload.

UI deliverables:

- Header badge uses the count endpoint. Opening the panel fetches current data; navigating across workspaces cancels stale requests and clears previous-workspace content immediately.
- Add `/notifications` for paginated history, unread/type filters, mark-read/read-all, dismiss, snooze, and source links. Preserve the lightweight header panel.
- Add `/settings/notifications` for MVP rule settings and existing preferences. V2 expands this page with the complete per-channel matrix and device/quiet-hour controls.
- Notification links carry validated workspace context and reuse normal authorized source routes. If the source is gone, explain it instead of displaying stale sensitive details.
- Poll unread counts while the app is visible (proposed 60 seconds), refresh on focus and mutations, and stop polling when hidden/unmounted. WebSockets are unnecessary for MVP.
- Existing auth locale changes rerender message keys without refreshing the browser. External messages use the saved recipient locale; define a validated fallback to English for legacy records.
- Use existing shadcn-svelte components and design tokens. Read the repository's shadcn-svelte skill when implementing UI components.
- Steam/yuzu attention styling with icons and text; direct calm wording for unusual spending and overdue payments. Honor dark mode, reduced motion, 44px targets, keyboard navigation, focus management, and screen-reader status announcements.
- Mask amounts when existing privacy mode is active. Lock-screen push content stays generic, with detailed financial evidence available after authentication.

## 7. Step-by-step MVP implementation

### M1 — Map producers, consumers, and source mutations

1. Read section 1 and list every existing notification insert, email enqueue, push send, preference reader, and source mutation that affects the rules.
2. Identify actual recurring occurrence identities, invoice outstanding helpers, budget period/revision helpers, and ledger balance functions. Do not replace them with approximate queries.
3. Write a canonical event-type map including existing `bill-reminder`, `budget-alert`, and assistant kinds; document aliases instead of renaming live kinds abruptly.
4. Record the migration cutover strategy and the exact entry points that will be disabled when new producers take over.

**Done when:** each MVP event has one authoritative source, one producer owner, one recipient policy, and an explicit stale-source resolution path.

### M2 — Add schema and safe migration

1. Add the three new tables and additive extensions in section 5 to Drizzle and a new SQL migration.
2. Add scoped foreign keys, unique dedupe keys, checks, indexes, RLS, and backfill logic.
3. Preserve old preferences/IDs/read state and classify legacy send timestamps without resending historical notifications.
4. Exercise migrations on both a fresh disposable database and a populated disposable database with old notifications and opt-outs. Never use development financial records as destructive fixtures.

**Done when:** both migrations succeed, old inbox/preferences still load, and raw SQL under the normal app role cannot read or write another recipient's notification data.

### M3 — Build shared notification primitives

Create a focused `apps/api/src/notifications/` module with suggested files: `types.ts`, `rules.ts`, `service.ts`, `scheduler.ts`, `worker.ts`, and `routes.ts`. Keep rule evaluation functions separate from transports.

1. Define strict event/evidence schemas, template keys, safe source-link mapping, decimal validation, and expiry rules.
2. Implement idempotent create/update/resolve/dismiss/snooze helpers scoped to workspace and actor.
3. Insert a notification and its eligible delivery intents in one transaction. Keep read state and dismissal on evidence updates.
4. Implement durable invalidation with dirty versions, source versions, and lease claims. Add periodic recovery so no event depends solely on an in-memory timer or a Redis job surviving.

**Done when:** concurrent duplicate evaluations produce one inbox record and one delivery per destination; a crash or a newer source edit cannot lose pending work.

### M4 — Implement due-date evaluation

1. Extract the current bill evaluator and implement the calendar/stage rules in section 4.2.
2. Add invoice and outgoing recurring-payment adapters using existing domain helpers.
3. Add resolution/invalidation to paid, skipped, void, edited-due-date, partial-payment, archive, and recurring-rule mutation paths.
4. Deduplicate linked bill/recurring obligations and preserve the customer-send confirmation workflow.
5. Add EN/ID message templates and source links.

**Done when:** all three due-date sources create the right upcoming/today/overdue notification, and becoming paid or moving the due date cancels stale sends.

### M5 — Complete budget alert evaluation

1. Extract the current tracking-route budget alert logic into the shared evaluator.
2. Connect transaction and budget mutation invalidations, covering old and new categories/periods on edits.
3. Implement threshold markers, highest-crossed-threshold coalescing, zero-budget handling, and historical budget revision semantics.
4. Add a period-rollover sweep so alerts update without the user opening the budgets page.

**Done when:** current budget totals match the budget screen, duplicate ticks do not repeat alerts, and edits/refunds resolve stale conditions.

### M6 — Complete low-balance and unusual-spending evaluation

1. Add recorded account threshold settings and the episode/hysteresis state machine.
2. Reuse current forecast suggestions for projected warnings; preserve consent, stale-source checks, and existing snooze/dismiss behavior.
3. Implement `unusual-expense-v1` exactly as specified, including insufficient-history results and explainable evidence.
4. Add invalidation for transfers, ledger/opening changes, backdated transactions, deletion/restoration, and category changes.
5. Process expensive historical invalidations in batches with persisted cursors.

**Done when:** arithmetic is exact, current and forecast balances are distinguished, insufficient history never generates an anomaly accusation, and duplicate producers are eliminated.

### M7 — Make scheduling and existing transports durable

1. Use the database due/dirty state to schedule minute sweeps. Claim bounded pages (start at 100 records) with a lease and `FOR UPDATE SKIP LOCKED` or the established equivalent.
2. Commit notification/outbox state before attempting Redis enqueue. If Redis fails, retain pending rows and let a later recovery sweep enqueue them.
3. Claim delivery rows atomically; recheck membership, source, preferences, consent, expiry, and device ownership. Release DB transactions before network calls.
4. Reuse encrypted email jobs and existing push encryption. Map new delivery IDs through workers; mark SMTP accepted only after transport acceptance. Track each push destination independently and deactivate 404/410 endpoints.
5. Use bounded retries with exponential backoff for retryable failures; proposed maximum five attempts. Treat permanent errors and ambiguous SMTP outcomes explicitly. Exactly-once external delivery cannot be guaranteed across a crash after provider acceptance; document that limitation and avoid blind retries for known ambiguity.
6. Recover queued and expired-lease jobs, run retention cleanup, expose backlog/oldest-pending/retry/unknown counters, and use graceful shutdown.
7. Wire the worker into the existing development launcher and deployment instructions. Keep one scheduler owner and stop the replaced notification producers. Preserve auth email processing and confirmed customer invoice jobs.

**Done when:** stopping/restarting API, worker, or Redis does not lose notification intents; source/preference changes suppress queued delivery; one failed device does not resend to successful devices.

### M8 — Extend API and settings

1. Implement section 6 with typed request/response schemas and cursor validation.
2. Make read/dismiss/snooze idempotent, unread totals accurate, and source links authorized.
3. Preserve old bill/assistant preference clients through adapters and optimistic version checks.
4. Add current low-balance and unusual-spending rule configuration without requiring AI consent or a provider account.

**Done when:** unauthorized workspace/recipient requests fail without exposing existence, and simultaneous read/arrival/preference updates behave predictably.

### M9 — Build the notification center

1. Add the full inbox route and settings route; update the existing header dropdown.
2. Render structured EN/ID templates, exact locale-formatted amounts, due dates, evidence, and safe source actions.
3. Add loading, empty, offline, retryable-error, resolved-source, and expired-source states.
4. Handle workspace switches, locale changes, unread count refresh, mobile layout, dark mode, keyboard focus, privacy mode, and reduced motion.
5. Do not prompt for browser push permissions on page load; retain a clear user-initiated enable action.

**Done when:** a user can discover every MVP alert type, understand why it appeared, open its source, and control it without a browser refresh.

### M10 — Acceptance, documentation, and completion gate

1. Run the meaningful checks in section 8 using disposable databases, isolated Redis namespaces/databases, and local Mailpit. Stub push transport for deterministic integration tests, plus one supported-browser push smoke check when configured.
2. Run repository type checks and the web production build. Add focused notification test scripts and document their exact prerequisites.
3. Update README with worker startup, supported sources, settings defaults, cutover/backfill behavior, retention, and SMTP acceptance limitations.
4. Record measured scheduler latency/query behavior and any remaining limitation. Do not close MVP with a known acceptance failure or replace missing behavior with a placeholder.

**Done when:** every MVP checkbox below has evidence, legacy reminder flows still work, and the feature runs through its normal UI/API/worker path.

## 8. Required acceptance checks

### Domain correctness

- [ ] Bill due in three days, due today, overdue, paid, skipped, disabled, archived, and edited due date.
- [ ] Invoice draft/issued/partially paid/paid/void; remaining amount is exact; no automatic customer email.
- [ ] Outgoing recurring payment reminder; linked bill suppresses duplicate; generated/paid occurrence suppresses stale reminder.
- [ ] 79.99%, exactly 80%, exactly 100%, threshold jump, zero budget, parent/subcategory spend, refund/delete/restore, archive, period rollover, and budget revision.
- [ ] Recorded balance below/equal/above threshold; zero threshold; episode recovery; transfer, opening balance, reversal, future/backdated entry, archived account.
- [ ] Forecast warning remains consent-aware and clearly projected; no duplicate warning for the same condition.
- [ ] Unusual expense below/at/above thresholds; zero MAD; even sample sizes; insufficient history; other currency/category excluded; backdated/edit/delete baselines.
- [ ] Workspace timezone midnight, DST boundary, leap day, and month-end recurrence; no conversion through server-local dates.

### Delivery and failure handling

- [ ] Two concurrent schedulers and duplicate queue deliveries create one intent per dedupe identity.
- [ ] Crash before/after outbox commit, Redis outage, lost Redis job, worker restart, stale lease, retry exhaustion, and missing SMTP configuration.
- [ ] Mailpit receives eligible bill email; enqueue alone never marks it accepted. Paid/archived/rescheduled source, revoked membership, disabled preference, or expired notification suppresses pending email.
- [ ] Existing assistant email/push consent checks and confirmed customer invoice reminders still pass.
- [ ] Several push devices: success, temporary failure, and 410 endpoint; retry only the failed eligible destination.
- [ ] Ambiguous SMTP outcome is visible as unknown and is not silently retried as a fresh send.
- [ ] Dismiss/snooze/read-all and source resolution are idempotent; snooze does not alter source due dates.
- [ ] Retention and user/workspace deletion remove derived content and prevent stale worker sends or recreated historical alerts.

### Isolation and UI

- [ ] Two unrelated workspaces and two actors in a fixture cannot fetch/count/mutate each other's notifications, rules, preferences, delivery rows, or source links.
- [ ] RLS checks use a non-superuser application role; worker-only access is not exposed through request parameters.
- [ ] No sensitive financial data or secrets in logs or generic lock-screen pushes.
- [ ] At least 101 unread fixtures prove the header count is independent of the first page; pagination has no duplicates or missing boundary records.
- [ ] Browser flow from source creation through worker generation to header/full inbox, read/dismiss/snooze, and source navigation.
- [ ] EN/ID switching without refresh, light/dark mode, reduced motion, keyboard-only use, screen-reader labels, privacy mode, and 360px layout.
- [ ] Switching workspaces while a fetch is pending never shows the previous workspace's notices.

### Performance and rollout

- [ ] Migration succeeds on empty and populated fixtures; old IDs/read flags/opt-outs remain intact; no historical mail flood.
- [ ] Measure against at least 10 accounts, 10,000 transactions, and 1,000 due sources across several workspaces. Record actual query plans, batch sizes, and timings.
- [ ] Proposed local acceptance target: eligible in-app notices appear within two minutes under that fixture; inbox/count API p95 under 500ms across a documented sample. If hardware differs, report the result and tune before marking this gate complete.
- [ ] No provider calls inside long database transactions, unbounded inbox responses, or full-history scans on every scheduler tick.
- [ ] Type checks, production build, notification tests, and existing affected reminder regressions pass.

## 9. V2 implementation sequence

### V2.1 — Goal milestone celebrations

1. Reuse goal/contribution totals in the goal currency. Define milestones 25%, 50%, 75%, and 100%; reject or specially handle a zero target without division.
2. Persist emitted milestone markers per goal/recipient. A withdrawal and recontribution must not repeat a celebration. Target edits reevaluate progress without resetting emitted milestones; define explicit reset separately if needed.
3. If one contribution crosses several milestones, show the highest new milestone and mark the lower crossed milestones consumed.
4. Persist a normal notification and make any celebration animation optional, honoring reduced motion and mascot preferences. Business mode stays restrained.
5. Test concurrent contributions, withdrawal/re-add, target edits, archival, currency separation, and animation accessibility.

### V2.2 — Unified customizable email and push

1. Expand `/settings/notifications` into a per-event in-app/email/push matrix using the existing preferences table and delivery outbox.
2. Add device list/remove actions, permission-denied/unsupported states, verified-email eligibility, quiet hours, and timezone controls. Unsubscribing one browser device must not silently disable all other devices.
3. Defer external delivery during quiet hours, then recheck source and expiry; do not delay the in-app inbox. Handle quiet hours spanning midnight and DST.
4. Add preview/test delivery to the authenticated user's own verified destination, with rate limits. Never allow an arbitrary destination supplied by the client.
5. Enabling a channel applies prospectively; do not replay the entire inbox. Preserve opt-outs across account/device changes.
6. Verify every new type through Mailpit and a controlled push transport, including preference changes after enqueue and partial device failure.

**V2 complete when:** milestone dedupe and accessible celebration pass, and each eligible type can be configured independently across supported channels with quiet hours and device management.

## 10. Advanced implementation sequence — WhatsApp and SMS

1. Select a provider when this phase begins; check current official documentation for verified senders, templates, delivery receipts, opt-out, rate limits, and region support. Provider pricing and rules are not assumed by this plan.
2. Add `notification_contact_points` and verify destination ownership before use. Record explicit per-channel consent, its source/time, and revocation; encrypt stored phone values and redact logs.
3. Extend the existing delivery outbox with provider adapters and channel-specific limits. Do not give providers access to the full finance database.
4. Add authenticated webhook handling with signature/replay validation and unique provider-event IDs. Apply receipts monotonically so duplicate or out-of-order callbacks do not downgrade terminal status.
5. Process opt-out promptly, cancel pending sends, and expose understandable blocked/failed/unknown status. Never switch to a paid channel automatically after email failure without explicit consent.
6. Add per-user/workspace quotas and spend caps, generic message previews, sandbox-only development credentials, and operational reconciliation for uncertain deliveries.
7. Test opt-in/out, verified ownership, forged/duplicate callbacks, retries, outages, rate limits, budget caps, and deletion. Document provider setup and costs before enabling real sends.

**Advanced complete when:** opted-in destinations receive eligible notifications through the same scoped outbox, receipts/opt-outs reconcile correctly, and configured quotas prevent uncontrolled messaging costs.

## 11. Instructions for the implementer

- Work one numbered task at a time; finish its acceptance condition before claiming it complete.
- Reinspect actual schema and routes before coding because the repository may have changed since this plan.
- Prefer a small shared service and domain adapters over a second independent notification system.
- Keep financial calculations, trigger conditions, persistence, and transport results separate and testable.
- Preserve unrelated work in the workspace. This issue does not authorize changing other feature priorities or sending customer/provider messages during development.
- Deliver migrations, backend, worker wiring, UI, localization, meaningful tests, and startup documentation together. A table plus a static screen is not a completed MVP.
