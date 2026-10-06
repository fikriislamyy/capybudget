# Pakasir invoice payments

CapyBudget uses Pakasir API v2 to generate direct QRIS payments for your own CapyBudget payment page. API v1 is deprecated and scheduled to stop on October 20, 2026.

## Update an existing installation

Apply the additive database migration before starting the updated API: run `bun run db:migrate` from the repository root. The local development database has already been migrated. The production deployment must also apply the migration; existing data is preserved.

## Set up a project

1. Sign in to Pakasir and create a project. Complete the provider’s verification requirements before accepting real payments.
2. Start with the project’s **sandbox mode** enabled. Copy its **project slug**, **API key**, and **webhook secret**. The webhook secret is separate from the API key.
3. In CapyBudget, switch to your business workspace. As its owner, open **Business → Payments**. Select an active IDR receiving account and an income category, then enter those credentials.
4. Select Sandbox to match the project’s mode. This selection does not change Pakasir’s project settings. Both modes use `https://app.pakasir.com/api/v2`.
5. Save the connection. In the Pakasir project dashboard set the webhook URL to your public API origin followed by the exact path shown for that connection:

   `https://api.capybudget.bebem.my.id/api/payments/pakasir/CONNECTION_UUID`

   For local development use a public HTTPS tunnel to the API. Localhost cannot receive provider notifications. Set the webhook secret in both places to the same value. Do not put any keys in `PUBLIC_*` environment variables.

## Test an invoice

1. Create and issue an IDR invoice.
2. Open its payment section, select your sandbox connection. QRIS is the only available method.
3. Click **Create QRIS payment**, then **Open payment page**. The public CapyBudget page displays a QR code, provider fee, total to pay, expiry, and payment confirmation. Use **Copy payment link** to share its full URL with your customer; no customer login is required. Pakasir may return a sample QR payload in sandbox; the page labels it explicitly and it is not payable through a banking app. Click **Simulate payment** on your CapyBudget payment page. The button is shown only for pending sandbox payments. The server verifies Pakasir’s actual sandbox mode before simulation, then checks provider status again; API keys never reach the browser. This records a test receipt through normal reconciliation. Production payments cannot use this action. Do not use real funds or assume a v1 simulator endpoint exists for v2.
4. Allow the callback and background status check to run, or click **Check status** after at least 60 seconds. CapyBudget verifies the order reference, transaction ID, exact amount, and sandbox mode with Pakasir before recording income.
5. If a bank import may already contain that income, resolve the review by matching it; do not add another manual receipt. Actual fees and refunds remain explicit, confirmed accounting actions.

Supported amounts for new QRIS payments: IDR 500–10,000,000. Provider availability and verification requirements still apply.

## Production

Switch the project to its production setting (or use a separate verified production project), and save a separate Production connection with its credentials. Keep sandbox projects separate from real accounting workspaces: completed sandbox transactions also exercise the receipt-posting flow.

## Recovery and previous payments

A timeout leaves the request available for review. **Check status** and the scheduler recover Pakasir links using the original order reference and amount, following v2’s find-or-create contract. An existing open checkout blocks another checkout for the same invoice. Reconcile or let it expire first.

Previously created Pakasir hosted links remain valid and use their original `payment_link` method during recovery. New requests use `method: qris` and public links of the form `https://capybudget.bebem.my.id/pay/RANDOM_TOKEN`; customers stay on your site. The QR code is generated locally from Pakasir’s verified QRIS payload. The public page polls stored status every 15 seconds; background provider checks confirm payment before income is recorded. Never mark payment successful based on a customer clicking a button. Keep the normal API process running for reconciliation.

Historical DOKU connections and requests are retained. They can still receive their original notifications and be reconciled. They cannot be selected for new payment links. Do not remove their notification URLs while payments are outstanding. No secrets or historical receipts are converted to Pakasir.

## Official documentation

- [API v2 introduction](https://pakasir.com/p/get-started)
- [Create transaction and payment link](https://pakasir.com/p/create-transaction)
- [Transaction status](https://pakasir.com/p/transaction-status)
- [Webhook and X-Secret authentication](https://pakasir.com/p/webhook)
- [Cancel transaction](https://pakasir.com/p/cancel-transaction)

No real Pakasir checkout has been verified without your project credentials. Configure and test a sandbox connection before production use.

## Sandbox simulator integration

The current Pakasir public PaymentV2 page uses `POST /api/transactions/{txn_id}/simulate` on `app.pakasir.com`. This is its web simulator endpoint, observed in the official public JavaScript bundle on October 5, 2026; it is not a documented v2 API guarantee. CapyBudget uses it only after verifying the stored order, amount, and actual sandbox mode with API v2. If Pakasir changes or restricts this endpoint, the page reports the failure and keeps normal status checks available. It never replaces provider confirmation with a local fake payment.

## Email invoices and resend payment links

Create a ready QRIS payment on the issued invoice, then click **Send invoice**. The existing branded email includes its PDF attachment and a **Pay with QRIS** button, a plain-text URL, expiry, and an explicit sandbox label when applicable. If no payable QRIS link exists, the PDF invoice still sends with its normal instructions. Email sending does not create a new checkout or select a sandbox/production connection automatically.

Use **Resend payment link** on invoice details to email only the existing payment link to the invoice recipient. Owners and accountants can use this action. It is disabled without a ready link. Each resend is queued, recorded in delivery history, and limited against duplicate requests. The email worker rechecks the exact payment request, outstanding balance, and expiry before sending; links that become unavailable are cancelled in the delivery history. Paid invoices and expired links cannot be resent as payable.
