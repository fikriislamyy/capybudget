# Business finance V2 — implementation and acceptance

Issue: https://github.com/fikriislamyy/capybudget/issues/7

## Product choices

Pakasir API v2 for Indonesia; tax stays off until each business owner configures/enables it. Existing issued invoice snapshots and cash-basis journals are preserved. No automatic money movement is introduced.

## Implemented screens and workflows

| Area | Where to use it | Behavior |
| --- | --- | --- |
| Team access | Business → Team access | Expiring, hashed, email-bound invitations; emailed invitation with a fallback share link; email-locked registration, verification and sign-in; accept using a verified account; revoke; change accountant/staff/viewer roles; transfer ownership; last-owner protection |
| Audit trail | Business → Audit trail | Owner/accountant browse, entity filter, actor/date/actions, redacted details, paginated CSV export of the current page |
| Directory | Business → Customers & vendors | Search, pagination, contact details, duplicate-name warning, optimistic edits, archive; historical invoice/vendor snapshots stay intact |
| Catalog | Business → Products & services | Currency/price/unit/SKU/tax defaults, case-insensitive SKU uniqueness, search/archive; explicitly copy items and contact details into invoice drafts |
| Recurring invoices | Business → Recurring invoices | Saved invoice snapshots, anchored schedules, bounded catch-up, end dates, pause/resume, unique occurrences, leases and retries; draft generation by default; automatic issue/email opt-in |
| Pakasir | Business → Payments; issued IDR invoice details | Owner-only encrypted credentials; CapyBudget payment page with direct QRIS; shared-secret authenticated durable webhook inbox; delayed provider status inquiry; idempotent receipts; review conflicting outcomes |
| Payment reconciliation | Issued invoice → QRIS payment links | Match exact existing bank income; match net settlement with a verified fee while preserving bank balance; record actual fees/refunds/chargebacks; dated corrections and histories; unapplied funds remain separate from invoice receipts |
| Vendor bills | Business → Vendor bills | Vendor snapshot, editable draft, dated tax lines, issue/void, partial payments, exact imported-expense matching, idempotency and dated reversals |
| Aging | Business → Receivables & payables | As-of balances, current/1–30/31–60/61–90/>90-day buckets, historical effective payments/refunds/reversals/voids, separate currencies, CSV |
| Tax | Business → Business tax | Owner-configured dated rates, inclusive/exclusive exact calculations, immutable snapshots, sales/purchase registers with CSV, manually configured tax deadlines and in-app reminders/preferences |
| Profitability | Business → Project profitability | Client/project links, bounded allocations of transactions or invoice lines, date-filtered cash revenue/cost/profit/margin, separate currencies, undefined margin at zero revenue |

Changes to a recurring template's price/customer snapshot use a new template: pause the old one and create another from an updated saved invoice. Existing occurrences keep their snapshots. An email occurrence remains queued until the durable delivery outbox records accepted delivery; issuing/generating a PDF is not an email delivery.

Invitations are emailed automatically using the existing encrypted email queue and SMTP configuration. In **Business → Team access**, choose the email and role, then select **Send invitation**. A fallback link is shown once. The recipient opens the link and new users register on the existing signup page with their invited email prefilled and disabled, verify the OTP to be signed in automatically, and accept. Existing accounts still require their normal password, 2FA and device unlocking when enabled. Existing users sign in with the same invited email. New users complete onboarding before entering the invited business. Redis and an HttpOnly cookie preserve the flow across refreshes through onboarding; the server enforces the invited email. The flow expires with the invitation after seven days, and revocation takes effect immediately. Users can explicitly cancel the flow. Older share links still open this flow.

Run the API scheduler and email worker, with Redis and SMTP configured. Migration `0044_invitation_flow` adds a durable invitation email outbox so a queue outage does not lose an invitation. The team list shows queued, sent, failed or unconfirmed delivery. If delivery failed or is uncertain, share the saved link privately or create a replacement invitation (which revokes the earlier pending one). These changes passed TypeScript/Svelte checks; the invitation browser and SMTP flow has not been exercised as part of this refactor.

## Permissions

- **Owner:** financial and administrative actions, team, provider settings, and ownership transfer.
- **Accountant:** financial records, reports, tax reminders and audit; no member/provider/profile/tax-policy administration.
- **Staff:** prepare their own draft invoices and read the supporting directory/catalog/profile/tax configuration; no issued invoices, account balances, receipts, reports, or administration.
- **Viewer:** read financial data and export permitted documents/reports; no financial mutations.

API authorization is centralized and checked on requests. Workers recheck eligible membership; staff invoice queries also limit records to the actor's drafts. Additive RLS policies protect representative financial reads/writes for non-superuser SQL roles. API checks remain necessary on installations whose PostgreSQL login bypasses RLS.

## Accounting and tax limits

- Journals and project profitability remain **cash basis**. Invoice/vendor-bill issuance does not create accrual revenue/cost postings.
- Project invoice revenue excludes sales tax; recorded cash costs include purchase tax. Unallocated entries are excluded. Receipt/refund/reversal dates determine period attribution.
- Purchase input-tax credit eligibility is **not automatically determined**. Registers are tracking exports, not Coretax submissions or government tax invoices.
- Configured tax reminders are the owner's chosen dates; no statutory deadline is inferred.
- Provider receipts currently use the workspace's local confirmation date. Review bank settlement dates before period-end reconciliation.
- Unapplied cash is tracked without settling an invoice; it is not an accrual customer-liability ledger.

See [proposed accounting posting and cutover specification](business-accounting-cutover.md). The issue requires accounting review before accrual conversion. No review or conversion has been performed.

## Database and startup

Migrations `0031`–`0040` add tax, collaboration, directories, payments, recurrence, vendor documents, allocations, effective corrections, role RLS and net settlement matching. New tables are registered for privacy export/deletion. Credentials/contact snapshots are encrypted using the existing field-encryption keyring.

```sh
bun run --cwd apps/api db:migrate
bun run dev
```

Additive migrations have been applied to the local application database. No refresh/reset of application data was performed. Run the same additive migration command before deploying the updated API. Do not use `db:fresh` in production.

The API process starts recurring-invoice and payment reconciliation schedulers. Keep the existing email worker, Redis, object storage, and SMTP available for automatic invoice delivery. See [Pakasir sandbox/production setup](pakasir-setup.md).

## Verification

```sh
bun run --cwd apps/api test:business:setup
bun run --cwd apps/api test:business
bun run --cwd apps/api test:business:mailpit
bun run --cwd apps/api test:business:browser
bun run check
```

The setup creates/migrates **capybudget_business_v2_test**, separate from the application database. Checks derive that database URL and refuse unsafe integration destinations. They use Redis database 15 by default and a fresh test-only auth secret, preserving ordinary auth rate-limit keys. Set `BUSINESS_TEST_REDIS_URL` for a dedicated test Redis service if database 15 is in use; no Redis database is flushed.

Latest verification: **23 tests passed, 0 failed, 200 assertions** (including the local Mailpit check). Coverage includes role/API boundaries, revoked access, hashed verified-email invitations, last-owner protection/transfer, encryption and historical catalog snapshots, exact quantity/tax math, signed callback rejection/replay, idempotent receipts, refunds/fees/corrections with historical aging/profit, net settlement without changing bank balance, concurrent final-balance receipts, anchored month-end schedules and duplicate draft processing, vendor partial settlement/reversal, allocation bounds, tax reminder preferences/resolution, representative non-superuser RLS, and former-member privacy erasure preserving shared history. A generated recurring invoice was delivered with its real PDF attachment to local Mailpit; repeating delivery sent no second email. Browser smoke checks passed on 28 owner route/viewport combinations (1440px desktop and 390px mobile), with no detected runtime errors or page overflow, plus viewer creation-action visibility. Svelte/TypeScript checks passed with zero Svelte errors/warnings.

DOKU checks use provider fixtures. They do not demonstrate a real DOKU sandbox payment or production activation. Browser checks are route/layout smoke checks, not exhaustive populated-form acceptance. Local Mailpit acceptance does not validate production SMTP/storage credentials.

## Remaining release acceptance

1. Configure Pakasir sandbox credentials/channels and complete the real-provider acceptance steps in [pakasir-setup.md](pakasir-setup.md). Credentials were not available during implementation.
2. Verify the configured production PDF/storage/SMTP workers. Local recurring PDF email and revoked-actor checks passed; production credentials and service behavior have not been exercised.
3. Complete browser/mobile acceptance of the new screens and full endpoint/file permission matrix against the intended deployment role.
4. Obtain accounting review of the cutover specification before implementing/activating accrual accounting and its conversion.

**The complete V2 release is not marked 100% accepted.** The above configuration, integration acceptance, and accounting review are explicit outstanding work; Advanced features are outside this change.
