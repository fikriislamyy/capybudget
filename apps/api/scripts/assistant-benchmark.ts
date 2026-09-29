import { projectCashflow } from '../src/assistant/forecast';

const today = '2026-01-01';
const accounts = Array.from({ length: 10 }, (_, index) => ({
  id: `account-${index}`,
  name: `Account ${index + 1}`,
  balance: '1000000.0000',
  currency: 'IDR',
  protectedAmount: '10000.0000',
  dailyExpenseAverage: '5000.0000',
  dailyIncomeAverage: '1000.0000'
}));
const events = Array.from({ length: 10_000 }, (_, index) => ({
  id: `transaction-${index}`,
  date: (() => { const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + index % 91); return date.toISOString().slice(0, 10); })(),
  accountId: `account-${index % accounts.length}`,
  amount: index % 5 === 0 ? '25000.0000' : '-10000.0000',
  kind: 'transaction' as const,
  description: 'Synthetic transaction'
}));

const samples: number[] = [];
for (let run = 0; run < 6; run++) {
  const start = performance.now();
  const result = projectCashflow({ today, horizonDays: 90, accounts, events });
  const elapsed = performance.now() - start;
  if (run > 0) samples.push(elapsed);
  if (result.rows.length !== 2_002) throw new Error(`Unexpected forecast row count: ${result.rows.length}`);
}
samples.sort((a, b) => a - b);
const medianMs = samples[Math.floor(samples.length / 2)]!;
console.log(JSON.stringify({ fixture: 'synthetic', accounts: accounts.length, transactionEvents: events.length, horizonDays: 90, warmups: 1, measuredRuns: samples.length, medianMs: Number(medianMs.toFixed(2)), maxMs: Number(samples.at(-1)!.toFixed(2)), scope: 'in-memory calculation only; database snapshot/query time excluded' }, null, 2));
