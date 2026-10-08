# Reports and Analytics V2 — issue #11

## What is available

Open **Reports → Custom reports** in either workspace. The existing dashboard and preset reports remain available above the builder.

| Report | What it shows |
|---|---|
| Transaction analytics | Recorded income, expenses, net activity and transaction count. Group by day, month, primary category or account; filter accounts, primary categories and tags. Transfers do not inflate income or spending. |
| Cashflow statement | Effective-dated cash movements, opening/closing balance and reconciliation. Existing operating/investing/financing mappings apply. |
| Budget vs actual | Each historical weekly/monthly budget revision and spending during the selected dates. A partial period shows the complete budget limit and is clearly labeled; limits are never silently prorated. |
| Profit and loss | Business income, expenses and profit, using cash or reviewed accrual accounting. |
| Balance sheet | Recorded business assets, liabilities and equity as of the included end date. Retained earnings are counted once; an unbalanced ledger blocks generation. |
| Tax evidence | Indonesia sales/purchase document registers, saved tax calculations, dated void reversals, totals kept separate by currency, and output-tax ledger reconciliation where eligible. This is evidence for qualified review, not a tax return or Coretax submission. |

### Build and save a report

1. Choose the report type and a preset or custom start/end date. The displayed end date is **included**. The API stores an exclusive boundary (`toExclusive`). Custom ranges allow 1–366 days and cannot include future activity.
2. For transaction analytics, optionally choose grouping, order and filters. Empty filters include everything within your workspace. Tags match **any** selected tag. Category filters match the transaction's primary category; split allocation spending is available in the existing spending reports.
3. Choose a comparison where supported. **Previous period** means the same number of days immediately before this period; it is not automatically the preceding calendar month. **Last year** uses matching calendar boundaries, clamps February 29 to February 28, and may have a different number of days.
4. Click **Preview report**. Background generation creates an immutable snapshot, then displays summary and paginated evidence. Changing transactions later does not change an existing snapshot.
5. Give it a name and **Save report**. Select it later to load, rename/update, or delete it. Definitions are private to the requesting user, even in a shared business workspace. Concurrent updates require the current version.
6. Export the snapshot to PDF, Excel or CSV. Click **Download file** once ready. Files require a signed-in, currently authorized user and expire after seven days. Privacy mode hides screen amounts; exported files still contain financial data.

### Business accounting prerequisites

- Cash statements report the existing effective-dated cash journal.
- Accrual statements require **Business → Accounting** preview, actual review reference, backup confirmation and activation. Their start date must be on/after the reviewed cutover.
- Complete accounting sync before reporting. Pending postings and unbalanced ledgers block accrual generation.
- Existing ledger account classes provide the statement mappings. The reviewed cutover, opening equity and accounting policy version are retained in the report. Period closing uses the existing `closed_through` policy; this feature does not reopen closed periods. Corrections must use an open effective date.
- Statements cover recorded accounts and supported postings. They do not invent inventory, depreciation, assets or liabilities that have not been recorded.

### Tax evidence

Tax remains **off until each business configures it**. Configure applicable, dated rates in Business tax. Reports read immutable invoice/vendor-bill line snapshots, rather than recalculating old documents using today's rates.

A document contributes on its issue date. A void contributes an equal, negative reversal on its effective date, including when that date falls in a later report period. Purchase tax is recorded evidence, **not an automatic input tax credit**. Payments/refunds do not automatically establish a tax amendment, exemption, credit note or cash-basis filing treatment. Missing tax snapshots and unavailable/different ledger reconciliation are explicitly flagged. Have a qualified reviewer check the underlying tax invoices, jurisdiction-specific treatment and any amendments before filing.

The report references [PMK 131/2024](https://www.jdih.kemenkeu.go.id/dok/pmk-131-tahun-2024/summary); DJP also explains [special tax-base rules and PMK 11/2025](https://stats.pajak.go.id/id/siaran-pers/pemerintah-terbitkan-aturan-dpp-nilai-lain-dan-besaran-tertentu-ppn). No new statutory rate is hardcoded or enabled by this feature.

### Email schedules

1. Select a **saved report with a relative period**.
2. Choose monthly (first day of the month) or weekly (Monday), local send time and attachment format. The workspace timezone and your selected language are recorded.
3. Confirm consent and click **Schedule selected saved report**. A schedule always covers the **previous complete** week/month, irrespective of the saved preset.
4. Edit, pause/resume or delete the schedule. Editing a saved definition or schedule invalidates old queued deliveries. Deleting the definition removes its schedules.
5. Review recent email attempts. **Accepted** means the SMTP server accepted the email, not that the recipient read it. **Outcome uncertain** requires manual investigation; automatic resend is suppressed.

Only your own currently verified email is supported. The reports worker generates the snapshot and encrypted private attachment, then uses the existing encrypted email queue. Dispatch rechecks membership/role, account status, verified recipient, consent/version, artifact checksum and expiry. External recipients and public download links are not supported. Tax evidence attachments retain their review warnings.

Timezone policy: choose the first matching UTC occurrence of a local send time; a missing local minute moves to the first available later minute that day. Unique schedule/occurrence keys prevent a repeated DST hour from sending twice. Recovery handles one outstanding occurrence and advances to the next future boundary rather than flooding the inbox with missed historical periods.

## Installation and operations

Apply the additive migrations (no database reset):

```sh
bun run --cwd apps/api db:migrate
```

Migrations `0050_reports_v2` and `0051_accounting_balance_trigger` add private saved definitions, schedules and deliveries, extend report snapshot sections, and fix the shared accrual balance trigger's entry/line field selection.

Keep the existing **reports worker** and **email worker** running. The reports recovery sweep processes schedules every 30 seconds. Existing PostgreSQL, Redis, S3-compatible private storage, encryption keys and SMTP settings are reused; no external AI configuration is needed. Scheduled report attachments are encrypted at rest and their queue payloads are encrypted. Delivery history is retained for 90 days; files/snapshots retain the existing seven-day expiry and cleanup path.

The new tables are registered in privacy export/deletion inventory. Saved definitions and schedules use user/workspace RLS and composite ownership foreign keys. Owner, accountant and viewer can manage their own report preferences; staff cannot access financial reports.

## Verification

```sh
bun run --cwd apps/api test:reports:v2:setup
bun run --cwd apps/api test:reports:v2
bun run --cwd apps/api test:reports:v2:browser
bun run --cwd apps/api check
bun run --cwd apps/web check
bun run --cwd apps/web build
```

The checks use `capybudget_reports_v2_test`, local Redis database 13, local encrypted object storage and Mailpit. They refuse remote database/storage destinations and force SMTP to local Mailpit. Application data is not reset. Browser checks start temporary servers on 3321/5321 and check light English and Night Pond Indonesian layouts at desktop/mobile widths.

Production deployment and business-specific accounting/tax sign-off remain separate release activities. Local fixtures are not professional approval of a business's books or tax treatment.
