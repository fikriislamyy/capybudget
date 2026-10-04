# Personal finance V2 — implementation status and usage

This document tracks issue #5. **The entire V2 phase is not complete.** Household sharing (section 3.5) remains unimplemented. No invitations or household membership changes are enabled by these migrations.

## Included in this change

### Budget methods (`/budgets`)

The existing category budgets remain available. The new **Give every rupiah a place** section supports period plans with 50/30/20, zero-based, or envelope methods.

1. Name a plan, choose a method, start date and exclusive end date.
2. Choose planned income or income received in that period. Planned funding is explicitly not an account balance. Received funding sums recorded income in the plan currency, including dated base-valued foreign transactions; it excludes transfers.
3. For zero-based/envelope plans, name the buckets with a comma-separated list.
4. Assign expense categories to buckets. Assignments are exact categories: choose subcategories explicitly when needed. Each category can appear in only one bucket in a plan.
5. Save a draft while allocating. Finalization requires funding to be fully assigned; over-allocation is rejected.
6. For envelopes, move only unspent allocation between two buckets. This records an allocation movement and does not post a financial transaction.

50/30/20 rounds Needs and Wants down to currency minor units and gives the residual to Savings/debt so the total exactly matches funding. Bucket spending comes from core transaction allocations, including splits. Savings transfers are not treated as expenses. Received funding remains live; a finalized plan can show a changed unassigned amount after corrected transactions. Saving it again validates current funding and increments its revision.

### Debts (`/debts`)

1. On Accounts, create or choose a credit-card/liability account. Use a **negative opening balance** for existing money owed. The tracker uses that account's ledger balance; it does not post a second opening liability.
2. Add a debt linked to that account, with fixed annual interest, monthly minimum and due day.
3. Compare snowball (smallest balance first) and avalanche (highest APR first) using the same starting debts, minimums and extra monthly amount.
4. Review the dated schedule. Estimates use fixed APR/12 monthly interest, half-up rounding to currency precision, stable ID tie breaks, and a 600-month limit. Freed minimum payments remain in the monthly budget. Warnings identify minimums that do not reduce principal. Insufficient overall payments return a reason instead of looping.
5. Record an actual payment using a different asset account in the same currency. Enter principal, interest, fees, category and date, then confirm.

Recording posts a principal transfer to the liability account and a separate expense for combined interest/fees. History keeps both components and transaction references. Repeated submissions with the same request key replay the original payment; conflicting reuses are rejected. Linked payment transactions cannot be edited/deleted through ordinary tracking, to keep recorded principal and expenses aligned. Archiving a debt keeps its account and payment history. No bank payment is executed.

Current comparison supports workspace-currency debts; it rejects mixed currencies instead of adding incomparable amounts. Liability accounts must exist before adding a debt. Variable-rate/lender-specific interest schedules and interest-only payment entries are not included.

### Subscriptions (`/subscriptions`)

Add a service manually, choose its payment account, charge amount, cadence and next date. Optionally link an existing bill for reminders; the picker uses the bill template ID rather than an occurrence ID. Reminder schedules remain managed on Bills.

**Find recurring charges** examines up to 10,000 merchant-labeled expenses from the last three years. A group needs at least three charges on the same account/currency, amounts within 5% of the group's mean, and calendar cadence within weekly ±2 days, monthly ±5 days, or yearly ±10 days. Up to the latest 12 charges provide evidence. Confidence is medium at 3–5, high at 6+.

Review supporting dates/amounts and confirm or dismiss. Confirmation does not create duplicate transactions or bills; repeated confirmation returns the same subscription. Dismissals remain dismissed on subsequent scans. Changed/deleted evidence must be detected again before acceptance. Confirmation creates or reuses a matching subscription and links its supporting transactions.

Monthly/annual costs are estimates, shown per currency. Review flags cover stale reviews (>90 days), overlapping merchant subscriptions and charges after a user marks cancellation. Marking cancelled changes tracking only; it does not contact the provider. Expense history does not establish whether a service was used.

### Net worth (`/net-worth`)

Existing asset and liability accounts are included automatically. Linked debts are counted by their liability account **once**. Add manual items only for economic assets/liabilities not already represented by a tracked account or debt.

1. Add a manual asset/liability with currency, ownership percentage and dated valuation.
2. Record subsequent valuations as needed; valuation history is retained.
3. Calculate a snapshot for today or a past date.
4. Review the trend, accessible history table and each snapshot's source lines/rates.

Account values use ledger entries effective on/before the snapshot date, including reversal/correction entries. Manual values use the latest dated valuation on/before that date and the recorded ownership share. Foreign values use core exact-date CurrencyFreaks observations. Missing values/rates and manual values older than 90 days make the snapshot incomplete; totals are null, not invented zeros. Current rates never substitute for historical rates. Recalculation creates a numbered revision and preserves earlier snapshots. The chart uses only the latest complete revision for each date and is hidden in privacy mode.

## Migration and operations

- `bun run db:migrate` applies additive `0029_budget_methods` and `0030_personal_v2`. Do not refresh/delete existing databases.
- Restart the API and web development process after updating.
- No new workers, LLM, API secrets or queue services are required. Foreign net-worth valuations reuse the existing CurrencyFreaks configuration and historical-access constraints.
- All new financial tables are registered for privacy export/deletion, protected by workspace policies and active-owner write fences.
- Calculation schedules are persisted as versioned JSON rather than a separate `debt_schedule_rows` table. Allocations are stored on buckets rather than an additional `budget_allocations` table; these are purposeful schema substitutions.

## Remaining work before issue #5 V2 can be called complete

- Household workspace type, authenticated invitations, owner/member/viewer capabilities, account privacy/grants, membership removal and sharing UI.
- Enforce record visibility across all legacy queries, reports/caches, exports, forecasts and worker deliveries. The current database connection can bypass RLS, so adding policies alone is insufficient.
- Focused functional acceptance and two-partner privacy verification. Static checks do not establish these acceptance criteria.
