# Assistant V2 — local verification (step 3)

## Scope

These checks use the configured **real Groq and Meta Muse APIs**, synthetic questions and a separate local database, `capybudget_assistant_v2_live_test`. The app's financial records are not used. Redis database 13 isolates email jobs. SMTP is forced to Mailpit at `127.0.0.1:1025`; recipients use `example.test`.

The script selects each provider inside its child process. It does not edit `.env` or change the app's active provider. Each fixture workspace is archived after the run. Keys, message payloads and credentials are excluded from the saved report.

## Repeat the checks

Start local PostgreSQL, Redis and Mailpit. Keep both provider keys and the external data terms acknowledgement configured in the root `.env`.

```sh
# Use a harmless test recording of “How much did I spend this month?”
# Mono 16-bit PCM WAV, 16 or 24 kHz, at most 30 seconds / 2 MB.
ASSISTANT_LIVE_AUDIO_FILE=/absolute/path/test-question.wav \
  bun run --cwd apps/api test:assistant:v2:live
```

This makes real API calls and consumes provider quota. Without the audio path, text and email checks still run, but voice is reported as blocked. The command returns nonzero when any check fails or is blocked.

The machine-readable results are saved to [assistant-live-verification.json](assistant-live-verification.json). The local check covers:

- English and Indonesian spending questions for each provider, with totals checked against the isolated ledger.
- Retrying the same question without a second provider call.
- Transaction extraction without writing a transaction.
- Rejection when explicit confirmation is missing, followed by confirmation and retry producing exactly one transaction.
- Actual speech transcription for both providers, without recording a financial transaction.
- Weekly and monthly summaries through the actual scheduler sweep, encrypted Redis queue, email worker and Mailpit. Repeated sweeps must not duplicate the email.

The recorded voice run uses locally generated speech. It establishes that the adapters can transcribe intelligible audio through the API; it does **not** establish physical microphone capture, accent accuracy or mobile browser reliability.

### Results — 6 October 2026

- **10 live checks passed:** English/Indonesian chat, reviewed transaction confirmation and transcription for each provider, plus weekly and monthly queued Mailpit delivery.
- Text models: Groq `openai/gpt-oss-20b` and Meta `muse-spark-1.3`. Voice models: Groq `whisper-large-v3` and Meta `muse-voice-transcribe-1.0`.
- Both email cadences reached Mailpit once despite repeated scheduler sweeps.
- **129 unit checks and 20 isolated integration checks passed**, with API TypeScript checks clean.
- One earlier Muse extraction left the amount unresolved; it did not save a transaction. Currency-adorned amount spans such as `45k IDR` are now accepted only with a matching currency suffix, with regression coverage. Missing or ambiguous fields still require human review. Subsequent live checks passed; provider extraction remains probabilistic.

## Physical microphone checklist — deferred by request

Run later on a desktop browser and a phone, using HTTPS or localhost. Test the configured provider, then repeat with the other provider after changing the local provider configuration and renewing consent.

- [ ] Open **Ask Capy** and confirm the workspace and provider are correct.
- [ ] Enable language processing and separate voice consent in Assistant settings.
- [ ] Press **Voice**, allow microphone access and say “How much did I spend this month?”
- [ ] Press **Stop**. Check that recording stops and an accurate, editable transcript appears.
- [ ] Edit a word. Confirm nothing is sent until **Send** is pressed.
- [ ] Send and compare the answer with this month's recorded expenses.
- [ ] Repeat in Indonesian: “Berapa pengeluaran saya bulan ini?”
- [ ] Try “Catat makan 45k hari ini.” Choose missing account/category fields; verify no transaction appears until **Confirm & save**.
- [ ] Cancel recording, close the chat, switch workspace and lock the app separately. Confirm the browser's recording indicator stops each time.
- [ ] Deny microphone permission; confirm a useful error appears and text entry still works.
- [ ] Record to the 30-second limit; confirm capture stops and the UI remains usable.
- [ ] Check quiet-room and ordinary background-noise recordings. Correct ambiguous transcripts before sending.
- [ ] Note device, browser, provider, language and pass/fail for each item. Do not attach private financial recordings to a public issue.

## Deferred deployment checks

Production SMTP, deployed worker scheduling, HTTPS microphone permissions and production provider configuration remain deployment checks. Production verification was deferred separately. Passing these local fixtures does not establish general AI accuracy or complete the full issues #9/#10 requirement review.
