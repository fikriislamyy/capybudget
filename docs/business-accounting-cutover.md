# Business accounting basis — proposed review specification

**Status: proposed; accounting review and approval required before implementation.**

Current business journals remain cash basis. Aging is a document-level outstanding report. Project profitability is explicitly cash basis, excludes invoice sales tax from revenue, includes recorded purchase tax in cash costs, follows effective reversal/refund dates, and keeps currencies separate. Neither report claims to be an accrual profit-and-loss statement or tax filing.

## Proposed accrual postings

| Event | Debit | Credit |
| --- | --- | --- |
| Issue sales invoice | Accounts receivable, gross | Revenue, net; output tax payable |
| Receive invoice payment | Cash/bank | Accounts receivable |
| Issue vendor bill | Expense/asset; eligible input tax, if reviewed | Accounts payable |
| Pay vendor bill | Accounts payable | Cash/bank |
| Bank settlement fee | Payment processing expense | Cash/bank or settlement clearing |
| Receive excess/unapplied payment | Cash/bank | Customer deposit/unapplied liability |
| Credit note/refund | Revenue/tax corrections and customer liability, as applicable | Receivable/customer liability/cash, as applicable |

Refunding cash and cancelling a sale are separate events. Define credit-note treatment, partial credits, chargebacks, recoverable disputes, and tax adjustments before implementing them. Do not automatically reverse revenue merely because a bank movement occurs.

## Invariants to approve

- Issued amounts, customer/vendor identity, tax policy, and currency snapshots are immutable.
- Every posting balances in native and workspace base currency; decimal arithmetic, dated FX rates, and documented rounding are required.
- Effective dates determine historical reports. Later reversals cannot rewrite prior closed periods.
- Provider events are deduplicated; a callback is not a second receipt. Imported settlement lines must match/clear existing entries rather than add revenue twice.
- Fees, net settlements, foreign-exchange gains/losses, rounding differences, and overpayments have named ledger accounts and documented posting rules.
- Refund/fee corrections append dated reversing entries with an audit trail; no deletion of financial history.
- Purchase input-tax eligibility is explicitly reviewed against the underlying tax invoice and applicable rules, never inferred solely from a configured rate.
- Owner/accountant permissions and workspace RLS apply equally to UI, workers, exports, and posting services.

## Cutover procedure to review

1. Select a cutover date and freeze the old cash-basis posting policy for historical records.
2. Export a backup and trial balance; reconcile bank balances, open invoices, vendor bills, credits, and unapplied funds by currency.
3. Classify each existing receipt/expense and document. Identify historical cash income/cost already recognized; do not post the same revenue/expense again when initializing AR/AP.
4. Design explicit opening/conversion entries and mappings. Obtain accounting approval of the trial balance and retained-equity adjustments.
5. Run a migration dry run on a restored isolated database. Compare totals before/after by currency and period; include partially paid/refunded/voided documents and late-dated reversals.
6. Add policy-version and cutover markers. Make the conversion resumable/idempotent, and stop writes during final conversion.
7. Apply only after signed review. Verify opening balances, reports, and bank reconciliation before reopening writes.
8. Roll back by restoring the pre-cutover backup if acceptance fails before new postings begin. Once new postings exist, use an approved corrective migration rather than silently switching back.

## Review checklist

- [ ] Accountant approves revenue recognition, tax, credit notes, disputes, and FX policies.
- [ ] Opening balances and retained-equity conversion reconcile.
- [ ] No duplicate cash-basis revenue/cost remains after conversion.
- [ ] Period closure, corrections, and document retention rules are specified.
- [ ] Isolated migration and permission tests pass.
- [ ] Owner approves the reviewed conversion date and deployment procedure.

Creating this specification does not mark accrual conversion complete or accountant-approved.
