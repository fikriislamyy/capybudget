/** Real provider calls with synthetic inputs only; never use the application ledger or SMTP. */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const databaseName = 'capybudget_assistant_v2_live_test';
if (!process.argv.includes('--isolated')) {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  assert(['localhost', '127.0.0.1'].includes(database.hostname), 'Local PostgreSQL required');
  assert(['localhost', '127.0.0.1'].includes(redis.hostname) && redis.pathname !== '/13', 'Redis DB 13 must be isolated from the app');
  if (process.env.ASSISTANT_LIVE_AUDIO_FILE) assert(await Bun.file(process.env.ASSISTANT_LIVE_AUDIO_FILE).exists(), 'Test WAV file must exist before making live requests');
  database.pathname = '/' + databaseName;
  redis.pathname = '/13';
  const env = {
    ...process.env, DATABASE_URL: database.toString(), REDIS_URL: redis.toString(),
    BETTER_AUTH_SECRET: randomUUID() + randomUUID(), BETTER_AUTH_URL: 'http://localhost:5173',
    PUBLIC_APP_URL: 'http://localhost:5173', PUBLIC_API_URL: 'http://localhost:3000',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASSWORD: '',
    EMAIL_FROM: 'Capy live fixture <noreply@example.test>'
  };
  const postgres = (await import('postgres')).default;
  const administration = new URL(database); administration.pathname = '/postgres';
  const admin = postgres(administration.toString(), { max: 1, onnotice: () => {} });
  try {
    if (!(await admin`select 1 from pg_database where datname=${databaseName}`).length)
      await admin.unsafe('create database ' + databaseName);
  } finally { await admin.end(); }
  const connection = postgres(database.toString(), { max: 1, onnotice: () => {} });
  try {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(drizzle(connection), { migrationsFolder: import.meta.dir + '/../drizzle' });
  } finally { await connection.end(); }
  const child = Bun.spawn(['bun', import.meta.filename, '--isolated'], { env, stdout: 'inherit', stderr: 'inherit' });
  process.exit(await child.exited);
}

assert(new URL(process.env.DATABASE_URL!).pathname === '/' + databaseName);
assert(new URL(process.env.REDIS_URL!).pathname === '/13');
assert(process.env.SMTP_HOST === '127.0.0.1' && process.env.SMTP_PORT === '1025');
const { client } = await import('../src/db');
const { app } = await import('../src/app'); app.compile();
const { hashPassword } = await import('better-auth/crypto');
const { languageConfiguration } = await import('../src/assistant/v2/providers');
const report: { date: string; models: Array<{ provider: string; text: string; voice: string }>; checks: Array<{ name: string; status: string; detail?: string }>; providerRequests: Array<{ provider: string; status: number }> } = {
  date: new Date().toISOString(), models: [], checks: [], providerRequests: []
};
const originalFetch = globalThis.fetch;
let workspace = '', cookie = '';
let worker: ReturnType<typeof Bun.spawn> | undefined;
const request = (path: string, method = 'GET', body?: unknown) => app.handle(new Request('http://localhost:5173' + path, {
  method, headers: { cookie, origin: 'http://localhost:5173', 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
}));
const base = () => `/api/workspaces/${workspace}/assistant`;
async function json(response: Response, status = 200): Promise<any> {
  if (response.status !== status) throw new Error('APP_HTTP_' + response.status);
  return response.json();
}
async function check(name: string, run: () => Promise<void>) {
  try { await run(); report.checks.push({ name, status: 'passed' }); console.log('PASS ' + name); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Only our fixed status codes can enter reports. Never print arbitrary exceptions or provider bodies.
    const detail = /^(APP_HTTP_\d+|EXTRACTION_AMOUNT_UNRESOLVED)$/.test(message) ? message : 'Check failed; inspect the named stage without logging credentials';
    report.checks.push({ name, status: 'failed', detail }); console.log('FAIL ' + name + ': ' + detail);
  }
}
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = String(input), provider = url.startsWith('https://api.groq.com/') ? 'groq' : url.startsWith('https://api.meta.ai/') ? 'muse' : null;
  if (provider && typeof init?.body === 'string') {
    assert(!init.body.includes(workspace), 'Workspace identifiers must stay local');
  }
  const response = await originalFetch(input, init);
  if (provider) report.providerRequests.push({ provider, status: response.status });
  return response;
}) as typeof fetch;

try {
  // Retire this script's earlier fixtures; never sweep real workspaces.
  await client`update workspaces set archived_at=now() where name='Assistant live fixture' and owner_user_id like 'assistant-live-%'`;
  const actor = 'assistant-live-' + randomUUID(), email = actor + '@example.test', password = 'IsolatedLiveChecks!42';
  await client`insert into "user"(id,name,email,email_verified) values(${actor},'Assistant live fixture',${email},true)`;
  await client`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${actor},'credential',${actor},${await hashPassword(password)})`;
  const login = await request('/api/auth/sign-in/email', 'POST', { email, password });
  await json(login.clone()); cookie = login.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  workspace = (await json(await request('/api/workspaces', 'POST', { kind: 'business', name: 'Assistant live fixture', currency: 'IDR', timezone: 'Asia/Jakarta' }), 201)).workspace.id;
  await json(await request(`/api/workspaces/${workspace}/accounts`, 'POST', { name: 'Fixture cash', kind: 'cash', currency: 'IDR', openingBalance: '1000000', openingDate: '2026-01-01' }), 201);
  const accounts = (await json(await request(`/api/workspaces/${workspace}/accounts`))).items;
  const categories = (await json(await request(`/api/workspaces/${workspace}/categories`))).items;
  const account = accounts[0].id, category = categories.find((c: any) => c.type === 'expense').id;
  await json(await request(base() + '/settings', 'PATCH', { version: 1, sourcePermissions: { history: true, merchant: true, goals: true }, accounts: accounts.map((a: any) => ({ id: a.id, included: true, allowExternalAi: true, lowBalanceThreshold: '0', protectedAmount: '0' })) }));
  const count = async () => Number((await client`select count(*) from transactions where workspace_id=${workspace}`)[0]!.count);
  for (const provider of ['groq', 'muse']) {
    process.env.ASSISTANT_AI_PROVIDER = provider;
    const config = languageConfiguration();
    report.models.push({ provider, text: config.model, voice: languageConfiguration(true).model });
    if (!config.available) { report.checks.push({ name: provider + ' configuration', status: 'blocked', detail: 'Configure supported models, key and data terms acknowledgement' }); continue; }
    const prefs = await json(await request(base() + '/settings'));
    await json(await request(base() + '/settings', 'PATCH', { version: prefs.settings.version, externalAiEnabled: true, externalAiProvider: provider, voiceAiEnabled: true }));
    for (const [locale, text] of [['en', 'How much did I spend this month?'], ['id', 'Berapa pengeluaran saya bulan ini?']]) {
      await check(provider + ' ' + locale + ' grounded chat', async () => {
        const key = randomUUID(), body = { text, locale, requestKey: key }, before = await count();
        const answer = await json(await request(base() + '/v2/chat', 'POST', body));
        assert.equal(answer.tool, 'spending');
        const [ledger] = await client`select coalesce(sum(amount),0)::text as amount from transactions where workspace_id=${workspace} and type='expense' and deleted_at is null`;
        assert.equal(Number(answer.facts.amount), Number(ledger!.amount));
        const calls = report.providerRequests.length;
        assert.deepEqual(await json(await request(base() + '/v2/chat', 'POST', body)), answer);
        assert.equal(report.providerRequests.length, calls); assert.equal(await count(), before);
      });
    }
    await check(provider + ' extraction and explicit confirmation', async () => {
      const before = await count();
      const draft = await json(await request(base() + '/v2/entry', 'POST', { text: 'I spent 45k IDR at Fixture Cafe today using Fixture cash', locale: 'en', requestKey: randomUUID() }));
      if (draft.fields.amount !== '45000.0000') throw new Error('EXTRACTION_AMOUNT_UNRESOLVED');
      assert.equal(await count(), before);
      const body = { version: draft.version, fields: { ...draft.fields, type: 'expense', accountId: account, categoryId: category, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()) } };
      assert.notEqual((await request(base() + '/v2/entry/' + draft.id + '/confirm', 'POST', body)).status, 200);
      assert.equal(await count(), before);
      const confirmed = { ...body, confirmation: 'CREATE_TRANSACTION' };
      const saved = await json(await request(base() + '/v2/entry/' + draft.id + '/confirm', 'POST', confirmed));
      const retry = await json(await request(base() + '/v2/entry/' + draft.id + '/confirm', 'POST', confirmed));
      assert.equal(retry.transactionId, saved.transactionId); assert.equal(await count(), before + 1);
    });
    const audio = process.env.ASSISTANT_LIVE_AUDIO_FILE;
    if (audio) await check(provider + ' live transcription (test WAV)', async () => {
      const bytes = await Bun.file(audio).bytes(), before = await count();
      const response = await app.handle(new Request('http://localhost:5173' + base() + '/v2/voice', { method: 'POST', headers: { cookie, origin: 'http://localhost:5173', 'content-type': 'audio/wav', 'idempotency-key': randomUUID() }, body: bytes }));
      const result = await json(response);
      assert.match(result.transcript.toLowerCase(), /spend|spent/); assert.match(result.transcript.toLowerCase(), /month/);
      assert.equal(await count(), before); bytes.fill(0);
    });
    else report.checks.push({ name: provider + ' live transcription', status: 'blocked', detail: 'Set ASSISTANT_LIVE_AUDIO_FILE to a harmless mono 16/24 kHz PCM WAV' });
  }
  await check('Weekly check-in → encrypted Redis job → email worker → Mailpit, once', async () => {
    // Dedicated Redis database and actual worker, not a mocked sendEmail callback.
    worker = Bun.spawn(['bun', import.meta.dir + '/../src/email/worker.ts'], { env: process.env, stdout: 'ignore', stderr: 'ignore' });
    const loaded = await json(await request(base() + '/v2/summaries'));
    await json(await request(base() + '/v2/summary-schedule', 'PUT', { version: loaded.schedule?.version ?? 0, enabled: true, cadence: 'weekly', nudgeFrequency: 'off', channels: ['in_app', 'email'], sendTime: '00:00', quietStart: '00:00', quietEnd: '00:00' }));
    const { sweepAssistantSummaries } = await import('../src/assistant/v2/summaries');
    await sweepAssistantSummaries(); await sweepAssistantSummaries();
    let accepted = false;
    for (let i = 0; i < 100; i++) {
      const rows = await client`select d.status from finance_notification_deliveries d join finance_notifications n on n.id=d.notification_id where d.workspace_id=${workspace} and n.kind='assistant-summary'`;
      if (rows.length === 1 && rows[0]!.status === 'accepted') { accepted = true; break; }
      await Bun.sleep(200);
    }
    assert(accepted, 'Mailpit queue delivery did not complete');
    const mailbox = await (await originalFetch('http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent('to:' + email))).json();
    assert.equal(mailbox.messages.length, 1);
    assert.equal((await client`select id from assistant_summaries where workspace_id=${workspace}`).length, 1);
  });
  await check('Monthly check-in → email worker → Mailpit, once', async () => {
    const loaded = await json(await request(base() + '/v2/summaries'));
    await json(await request(base() + '/v2/summary-schedule', 'PUT', { version: loaded.schedule.version, enabled: true, cadence: 'monthly', nudgeFrequency: 'off', channels: ['in_app', 'email'], sendTime: '00:00', quietStart: '00:00', quietEnd: '00:00' }));
    const { sweepAssistantSummaries } = await import('../src/assistant/v2/summaries');
    await sweepAssistantSummaries(); await sweepAssistantSummaries();
    let accepted = false;
    for (let i = 0; i < 100; i++) {
      const rows = await client`select d.status from finance_notification_deliveries d join finance_notifications n on n.id=d.notification_id join assistant_summaries s on s.id=n.source_id where d.workspace_id=${workspace} and n.kind='assistant-summary' and s.kind='monthly'`;
      if (rows.length === 1 && rows[0]!.status === 'accepted') { accepted = true; break; }
      await Bun.sleep(200);
    }
    assert(accepted, 'Monthly Mailpit delivery did not complete');
    const mailbox = await (await originalFetch('http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent('to:' + email))).json();
    assert.equal(mailbox.messages.length, 2);
    assert.equal((await client`select id from assistant_summaries where workspace_id=${workspace}`).length, 2);
  });
} finally {
  globalThis.fetch = originalFetch;
  if (worker) { worker.kill('SIGTERM'); await worker.exited; }
  if (workspace) await client`update workspaces set archived_at=now() where id=${workspace}`;
  await client.end();
  await Bun.write(import.meta.dir + '/../../../docs/assistant-live-verification.json', JSON.stringify(report, null, 2) + '\n');
}
process.exit(report.checks.some(c => c.status !== 'passed') ? 1 : 0);
