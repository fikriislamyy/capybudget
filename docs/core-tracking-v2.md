# Core tracking V2

This implements issue #3's V2 tracking features. Bank/e-wallet sync follows the user's clarification: upload **mutasi documents or images**, review, then confirm. Direct bank API/aggregator connections are outside this agreed implementation. Upload a new statement when you want to synchronize more activity.

## Start locally

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

The normal API development entry point starts the tracking worker. If running the API server directly instead, start the worker separately:

```bash
bun run dev:tracking-worker
```

PostgreSQL, Redis and private S3-compatible storage must be running. Existing SMTP configuration is unchanged. Migrations 0027 and 0028 preserve existing transactions, balances and journals; they do not reset data.

Production's existing `tracking-worker` service runs `src/tracking/worker.ts` and now handles recurring entries, statement parsing and local OCR. Rebuild the API image and run normal migrations before restarting services. English OCR model files and the native image/PDF dependencies are locked and bundled with the API image. No LLM or third-party OCR key is required.

## Currency setup

Create an account in **Accounts**, choosing its currency. The workspace currency remains the reporting base. Nonzero foreign opening balances use the dated CurrencyFreaks rate automatically.

To enable automatic dated rates, put `CURRENCYFREAKS_API_KEY` in the local or production environment, then restart/recreate the API and worker. Keep this key out of Git and the browser. [CurrencyFreaks documentation](https://currencyfreaks.com/documentation) explains API keys, historical endpoints and plan restrictions. The supported-currency dropdown already uses its public catalog and an offline fallback.

Rates mean **workspace currency units per one source-currency unit**. For example, a USD wallet in an IDR workspace might use a rate of 15,000 IDR/USD. This is an illustration, not a current market quote.

The worker refreshes dated foreign-wallet rates every six hours. Posting looks up the exact transaction date. Today (UTC) uses the free-plan latest-rates endpoint; past dates use the historical endpoint, which requires a paid CurrencyFreaks plan unless a dated rate is already cached. Future dates wait until the rate is available. Provider failures, unsupported dates and missing credentials prevent posting until a dated automatic rate is available; yesterday's rate is never silently substituted. Posted revisions retain the applied rate, date, provider, original and base amounts, actual transfer ratio, rounding adjustment and fee transaction reference. Later market updates do not change recorded history.

A foreign transfer needs the amount paid and the amount actually received. Reference-to-base rates for both currencies are fetched automatically. Conversion gains/losses balance through an FX equity ledger; they are excluded from ordinary income and spending. Explicit fees are separate expense transactions. Edit those fees separately after creation. Account screens show native balances; the dashboard/workspace reports show stored base-currency valuations. A report explicitly requested in another currency stays scoped to that currency. These are historical book values, not live marked-to-market balances. An accountant should review the FX ledger mapping before statutory reporting.

Foreign-currency automatic recurring payments stay pending when a dated rate is unavailable, allowing other rules to proceed. Once CurrencyFreaks can supply the dated rate, retry confirmation on the recurring screen. Cashflow forecasts continue to exclude foreign-currency accounts and events explicitly; workspace reports include stored base valuations.

## Splits and bulk actions

In the transaction form, choose **Split across categories**, add positive allocations and ensure they exactly equal the total. Transfers stay unsplit. Allocation categories must match the transaction type. Category filters, budgets, threshold alerts and category reports include split amounts; totals and transaction counts include the parent once.

Use transaction checkboxes or **Select this page**, then **Bulk actions**. Select at most 100 explicit records. Supported edits are date, category and tags; type/account/currency changes remain individual actions. Preview, then confirm. Stale versions or any invalid record roll back the whole batch. A category change requires compatible unsplit records. After deletion, **Restore deleted batch** restores that operation's records. Reapplying the same preview cannot duplicate a posting or reversal.

## Statement-based bank/e-wallet sync

1. Open **Import & scan** in Tracking.
2. Select **Bank / e-wallet statement**, the destination wallet, and CSV, XLSX, PDF or image format.
3. Upload a file of at most 10 MB. CSV supports comma or semicolon separators; XLSX supports the first worksheet, at most 50 columns/5,000 rows and a bounded 64 MB expanded archive. Formula cells are rejected and are never executed.
4. Wait for the background worker, then map the date, amount or debit/credit, merchant, notes, currency and reference columns. Choose the document's date order and decimal separator explicitly. Indonesian `12.500,50` uses comma decimals. Spreadsheet dates exported as calendar dates need the corresponding date format.
5. Review each transaction alongside the original document/row. Opening/closing balance rows are excluded. Invalid rows can be corrected or skipped. If the document includes currency codes, map that column so mismatches are rejected.
6. Choose a category, or select **Transfer** and its direction to link two tracked accounts. For incoming transfers, choose the source account; for outgoing transfers, choose the destination. Supply actual amounts for foreign transfers. Do not post both statement legs as income/expense.
7. Compare the mapped and recorded income/expense totals against your statement; transfers remain excluded from both. Correct invalid rows or skip them, with the reason shown. For possible duplicates, link an existing transaction, skip the row, or explicitly choose **Reviewed: keep both** after comparing the source. Similar date/amount alone does not prove a duplicate. Confirmation checks again for records added since preview.
8. Confirm the reviewed entries. Posted/skipped rows retain their state, so resuming or retrying does not post them twice. Counts show posted, skipped and remaining rows.

CSV/XLSX are the most reliable sources. Text PDFs support date–description–amount transaction lines; a trailing balance is ignored. BCA monthly text e-statements with TANGGAL/KETERANGAN/CBG/MUTASI/SALDO columns have a dedicated parser: the year comes from the statement period, wrapped descriptions are preserved, DB markers determine debit and unmarked entries are credit, and printed balance sections are checked. Opening/closing balance rows are excluded. The review screen initializes the debit/credit column mapping when processing finishes. Scanned PDFs (up to 10 pages), JPEG and PNG statements (up to 12 megapixels) use local OCR with the same line adapter. Layouts using separate multi-column debit/credit positions, multiple lines per transaction, OCR-confused dates or unsupported layouts can require corrected values, a CSV/XLSX export or manual entry. No arbitrary statement format is claimed to parse reliably.

### Remove a statement

Use **Delete** beside a recent statement and confirm. Queued processing is cancelled; a running parser discards its result after the import is removed. The source file is deleted after commit, with durable cleanup retries if storage is unavailable. Review rows are removed, and transactions already recorded remain in your accounts.

## Receipt capture

Choose **Receipt photo**, then upload JPEG, PNG or WebP (at most 10 MB and 12 megapixels). OCR runs on the server using a bundled model, with a timeout and bounded worker concurrency. Review the original photo and editable merchant/date/total/currency fields. Amount punctuation or dates may need correction, especially for blurry or rotated photos. The confidence score accompanies the extraction; it is not a guarantee that individual fields are right. Confirming creates a normal transaction and private receipt attachment. Failed scans offer retry and manual entry. Confirmation is replay-safe and checks for possible existing purchases before keeping both.

## Privacy and durability

Private source files use the existing encrypted S3 storage. Raw import rows, normalized review data and extracted receipt fields use field encryption. Workspace-scoped authorization, composite foreign keys, RLS policies and active-owner fences cover the new tables. Privacy exports and account erasure include these tables and files; access tokens are unnecessary for statement uploads.

Unconfirmed/source files and raw rows expire after seven days. The running tracking worker cleans them hourly; posted financial records remain. Confirmed receipts remain attached to their transaction. PostgreSQL records upload jobs durably, and the dispatcher enqueues committed rows even if Redis was unavailable when the upload was accepted. Retry states and stable job identities protect against duplicate execution.

## Checks performed during implementation

- Type checking: `bun run check`, zero errors/warnings.
- Production build: `bun run build`, successful. Existing CSS `:global` and date-library circular-dependency warnings remain outside this change.
- Migrations: existing local database upgrade with a pre-migration SQL backup, and a fresh isolated `capybudget_tracking_v2_test` database.
- Isolated API/service checks: foreign openings, split totals and rollback, foreign transfers, native balances, stored-base dashboard totals, category filtering, reconciled reports, bulk delete/replay/restore and stale-preview rollback, explicit transfer fees, foreign recurring deferral and confirmation, deterministic provider refresh with frozen FX history, CSV mapping, duplicate/retry handling, private receipt attachment, encrypted staging, workspace access checks.
- File/OCR checks: XLSX values and formula rejection, Indonesian decimal/date parsing, receipt and statement-image OCR, text PDF and scanned-PDF extraction.

Paid CurrencyFreaks credentials were not used for checks. Live bank/e-wallet statement layouts still need samples from the institutions you use. Production deployment and accountant review are separate from local implementation checks. Advanced SMS/email capture remains out of scope.
