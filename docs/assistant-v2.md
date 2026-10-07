# Capy Assistant V2

The Assistant uses local calculations for every amount. **Groq** (default) or **Meta Muse** supplies optional language processing: choosing a read-only question type, extracting text entry, and transcribing recordings. Retrieved financial records are not sent to either provider. Submitted questions, transaction descriptions and recordings are sent to the selected provider.

## Enable Groq

1. Create a server API key in [Groq Console](https://console.groq.com/keys). Its free plan has request, token and audio quotas; check your [account limits](https://console.groq.com/docs/rate-limits). An API key is separate from a consumer chat subscription.
2. Review [Groq's data controls](https://console.groq.com/docs/your-data). Enable Zero Data Retention in the organization settings if required. The app cannot verify that console setting; the acknowledgement below is not proof of zero retention.
3. Set these variables in the API environment file:

   ```dotenv
   ASSISTANT_AI_PROVIDER=groq
   GROQ_API_KEY=your_private_api_key
   GROQ_MODEL=openai/gpt-oss-20b
   GROQ_TRANSCRIPTION_MODEL=whisper-large-v3
   ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED=true
   ASSISTANT_DAILY_AI_LIMIT=30
   ```

   Set the acknowledgement only after reviewing the selected provider's data terms. Supported strict text models: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`. Voice supports `whisper-large-v3` and `whisper-large-v3-turbo`. See [structured output](https://console.groq.com/docs/structured-outputs) and [speech-to-text](https://console.groq.com/docs/speech-to-text).
4. Apply additive migrations: `bun run --cwd apps/api db:migrate`. Restart the API and Assistant workers. For local development: `bun run --cwd apps/api dev` and, if the development runner is not starting workers, `bun run --cwd apps/api worker:assistant`.
5. In **AI Assistant → Privacy and data controls**, confirm external text processing for the displayed provider. Separately select **Allow in Capy answers** for accounts. Voice transcription needs its own switch. Save settings.

## Use Meta Muse instead

Create a developer API key following the [Meta model API overview](https://dev.meta.ai/docs/overview). Confirm API access and billing in the developer dashboard; consumer Muse token credits or subscriptions are not assumed to include API credits. Set:

```dotenv
ASSISTANT_AI_PROVIDER=muse
MUSE_API_KEY=your_private_api_key
MUSE_MODEL=muse-spark-1.3
MUSE_TRANSCRIPTION_MODEL=muse-voice-transcribe-1.0
ASSISTANT_EXTERNAL_DATA_TERMS_ACKNOWLEDGED=true
ASSISTANT_DAILY_AI_LIMIT=30
```

The adapter uses `https://api.meta.ai/v1/chat/completions` with strict JSON schemas. It allows Standard models `muse-spark-1.3`, `muse-spark-1.2`, and `muse-spark-1.1`; **Contributor models are rejected** because their data terms permit training on submitted content. Review [Meta's pricing and model data terms](https://dev.meta.ai/docs/pricing-rate-limits) and [structured output documentation](https://dev.meta.ai/docs/structured-output). Standard no-training terms do not imply zero retention.

Voice uses Meta's distinct `https://api.meta.ai/v1/asr/transcribe` endpoint, with multipart `request` and `audio` fields. Browser recordings are converted locally to mono 24 kHz, 16-bit PCM WAV before upload; no audio conversion library or server process is needed. The server validates the WAV format and 30-second duration before sending it. See [speech-to-text](https://dev.meta.ai/docs/speech-to-text) and the [transcription reference](https://dev.meta.ai/docs/api-reference/voice/transcribe).

There is no automatic switch between providers. Switching `ASSISTANT_AI_PROVIDER` requires fresh user consent; stale settings cannot grant permission to another provider. The migration also disables previous Gemini consent. Provider/model identity is pinned when each request starts and checked before saving its result.

Production containers load `/opt/capybudget/secrets/production.env`. Configure keys there and recreate the API and worker containers. Never use frontend `PUBLIC_` variables for keys. Existing Gemini environment variables are unused and can be removed from private environment files.

Without a configured key and consent, local forecasts, insights, scenarios, payment planning and summaries still work. Manual transaction entry remains available during outages. Provider errors are sanitized; a 429 limit response does not trigger a fallback or send data to another company.

## Ask Capy from any app page

Click the floating **Ask Capy / Tanya Capy** button above the bottom navigation or quick-add button. The chat opens in a compact desktop panel or a mobile dialog. It shows the active workspace and provider; switching workspaces clears the current widget and recording.

Describe a new transaction (for example, `capy, gue abis transaksi 50k idr di Point Cofee Indomaret menggunakan BCA`) to receive a **Review transaction entry** action. It opens an editable draft in the chat. Missing dates/categories must be chosen explicitly; only **Confirm & save** writes a transaction. Reporting a purchase is not treated as a search of old expenses.

Type a question and press **Send**, or Enter (Shift+Enter adds a new line). **Voice** records up to 30 seconds, then **Stop** transcribes it into the editable question field. Review the transcript before sending; **Cancel**, closing the dialog, or locking the app stops microphone capture. Voice needs separate consent, browser microphone permission, and HTTPS (localhost works for development).

Use the conversation selector to reopen saved conversations or **New** to start another. Privacy mode hides amounts and sensitive message text. The widget loads its chat code and settings only when opened. It uses the same read-only tools, provider configuration, account permissions and quotas as the Assistant page. If consent or provider configuration is missing, it links to Assistant privacy settings instead of sending data.

## Use the features

- **Insights:** refresh comparisons by category, merchant or account. Comparisons use equal elapsed days, capping the longer month if necessary. Category totals include split allocations. Transfers/deleted transactions are excluded; refunds logged as income are separate. Merchant comparisons require merchant permission. Click **See why** on a finding to inspect source records. Mark intentional charges or dismiss review prompts; nothing is deleted automatically.
- **Business runway:** a 90-day cash history gives gross and net monthly burn, with a month defined as 30 days. Transfers, opening entries, non-operating ledger classes and transactions excluded from the baseline are omitted. Funding misclassified as operating income must be corrected or excluded. Incomplete coverage has no runway estimate; nonpositive net burn is not a promise of unlimited runway.
- **Customer history:** payment patterns require at least five settled invoices. Partial balances and open overdue invoices are separate. Reversed payments and void invoices do not count as settled. This is not a credit score.
- **Savings opportunities:** review confirmed subscription overlaps, changed charges and budgets above their targets. A charge cannot tell whether a service is unused. Goal contributions are bounded by conservative headroom; no investment yield or guessed alternative price is offered.
- **What if?:** refresh the base forecast, name a scenario, and choose a purchase, invoice delay, expense change or recurring expense change. Compare minimum cash, safe-to-spend and first shortfall. Scenarios keep the ledger untouched; changed sources require a fresh base forecast.
- **Payment plan:** review obligations, essential status and explicitly agreed minimum/deferral terms. Unknown terms stay unknown. Partial allocations require supplier bills, which have a settlement model. The simulation keeps outstanding obligations in view. Opening the original record lets you review and confirm a real change through its existing workflow.
- **Ask Capy:** ask about spending, unpaid business invoices, forecasts, upcoming bills or goal progress. The fixed read-only registry supplies facts and source references. Requests to add transactions lead to a review draft; questions cannot move money, execute SQL or fetch external links. Previous conversations are private to you and the workspace.
- **Text & voice entry:** include the amount, date, account and category when possible. EN/ID text such as `lunch 45k today` is supported; `45k` means IDR 45,000. Ambiguous fields remain for review. Check the extracted fields and explicitly confirm. Retrying confirmation creates one transaction. Voice requires microphone permission and separate consent; recordings stop after 30 seconds and uploads are limited to 2 MB. Audio is transient; the editable transcript remains subject to the content retention period.
- **Check-ins:** load a preview, choose weekly/monthly summaries, off/daily/weekly nudges, send time and quiet hours in the workspace timezone. In-app is the default. Email is separately optional and contains period income/expense totals and a review link, rather than full account balances. A durable outbox retries known failures, deduplicates delivery and stops after opt-out. Uncertain SMTP outcomes require review rather than an automatic duplicate send.

## Privacy and limits

Account/source consent is checked before retrieval and again before storing language results. Changes erase old conversations and drafts and invalidate derived results. Content expires after 30 days; schedules remain preferences until changed or erased. Assistant export/deletion and full account privacy workflows include the new tables. Audio is not stored as an attachment.

Language requests have a 15-second deadline, bounded input/output, atomic daily quotas and idempotency keys. Analytics windows and evidence are bounded; incomplete data must not be interpreted as a guarantee. Advanced seasonality and financial health scores are outside this V2 scope.

## Isolated verification

The feature-by-feature audit of issues #9/#10, including deferred release checks, is in [assistant-v2-requirements.md](assistant-v2-requirements.md).

```sh
bun test apps/api/tests/assistant
bun --env-file=.env apps/api/scripts/assistant-v2-test-db.ts
bun --env-file=.env apps/api/scripts/assistant-v2-checks.ts
bun run --cwd apps/api check
bun run --cwd apps/web check
```

The setup creates `capybudget_assistant_v2_test`; checks use that database and Redis database 14. Provider calls are mocked, and email configuration is forced to local Mailpit. These checks do not validate real Groq/Meta credentials or either live service. A real text/voice smoke check requires your configured project and consent; production delivery remains a deployment check.

## Verification results (6 October 2026)

- 49 Assistant unit tests passed, including exact scenario deltas, calendar comparisons, burn, goals, entry grammar and forecast regressions.
- 15 isolated integration tests passed: consent and scoped data, atomic quota, one-write confirmation, stale scenarios, restricted SQL ownership, viewer permissions, voice consent, provider switching, Groq/Muse text and voice model identity, summary deduplication and Mailpit SMTP delivery.
- Provider checks cover strict schemas, sanitized throttling, refusal/truncation, bounded responses, cancellation, consent binding, and multipart voice requests for both providers.
- API TypeScript and web Svelte checks passed; the web production build passed. The build also reports existing date-library circular dependencies and CSS warnings outside the new V2 panel.
- Light-mode English browser checks passed at 1440px and 390px. Browser verification scripts also cover Night Pond, Indonesian, reduced motion and 360px layouts.
- The original two-pair duplicate fixture still demonstrates unavoidable ambiguity (precision 0.5 with one legitimate identical repeat). The broader 51-case evaluation is documented in [assistant-detection-evaluation.md](assistant-detection-evaluation.md). These are synthetic review cases, not measured production accuracy. New V2 findings do not automatically send fraud/anomaly notifications.
- Fresh and existing isolated databases accepted the migrations. The additive migrations were also applied to the local application database without resetting financial data.

Live local Groq/Meta text/audio and actual queued Mailpit checks are documented in [assistant-local-verification.md](assistant-local-verification.md), with results in [assistant-live-verification.json](assistant-live-verification.json). Physical microphone testing is deferred by request; its checklist is saved in that guide. Production SMTP and deployed scheduler operation remain deployment checks. Neither mocked tests nor these small live fixtures establish general model quality or forecast accuracy.

## Suggestion feedback

On forecast suggestions, V2 insight cards, goal coaching, savings opportunities and saved check-ins, choose **Helpful**, **Not helpful** or **Dismiss**. Selected ratings are saved privately per user and workspace and survive reloads. Dismiss hides that suggestion; it does not delete financial records. Feedback is local and never calls Groq or Muse.

Optional nudge rules:

- Two negative ratings on distinct suggestion fingerprints of the same type within 90 days pause that type for 14 days after the latest negative rating. Retrying a rating or repeatedly refreshing the same condition does not increase the count.
- A helpful rating resets that type's negative window. It never increases the frequency above the user's chosen daily/weekly setting.
- A dismissed fingerprint is excluded from optional nudges for the feedback retention period (90 days). Explicitly scheduled weekly/monthly summaries keep their cadence; dismissing one hides/cancels that particular check-in.
- Due-date alerts, payment reminders and recorded low-balance alerts keep their own notification preferences. Feedback does not change budgets, cancel subscriptions or move money.
- Eligibility is checked during scheduling and email delivery. Affected pending messages are suppressed; already accepted/sent email cannot be recalled.

The `assistant_feedback` table has actor/workspace RLS, a cascading reference to Assistant settings, a 90-day retention window, and is included in Assistant/account exports and deletion. Apply migration `0049_assistant_feedback` before deploying this feature.

## Detection evaluation and explanations

Run `bun run --cwd apps/api evaluate:assistant:detection --write` to regenerate the JSON and readable report from 51 labeled synthetic cases. No database, user data, provider credentials or network calls are used. The cases include everyday coffee/commute repeats, accidental duplicate records, linked payments, different accounts/currencies, sparse history, variable categories, planned one-offs and known ambiguous cases.

The detector version is separate from the general analytics version. In **Insights → See why**, duplicate candidates explain their matching fields and date-only uncertainty; unusual purchases show their historical sample, median and review threshold. A refreshed finding stores the current detector version. Removing a source also retires reviewed findings.

The new rules intentionally abstain on established repeated purchases at the same or higher daily frequency and sparse/unclassified history. This lowers unnecessary prompts but can miss actual duplicates. The evaluation keeps those misses and unavoidable false positives visible; it does not enable automatic anomaly notifications.
