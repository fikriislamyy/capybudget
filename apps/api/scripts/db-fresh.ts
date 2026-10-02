import postgres from 'postgres';
import { createInterface } from 'node:readline/promises';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: bun run db:fresh [--yes]\nDeletes the configured local PostgreSQL database and reapplies all migrations.\nStop the API and workers first. --yes skips the confirmation prompt.');
  process.exit(0);
}
if (args.some(arg => arg !== '--yes')) throw new Error('Unknown option. Use --help for usage.');
if (process.env.NODE_ENV === 'production') throw new Error('db:fresh is only available for local development.');
const target = new URL(process.env.DATABASE_URL ?? 'postgres://capybudget:capybudget@localhost:5432/capybudget');
if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(target.hostname)) throw new Error('db:fresh only accepts a local PostgreSQL host.');
const database = decodeURIComponent(target.pathname.slice(1));
if (!database || ['postgres', 'template0', 'template1'].includes(database) || database.includes('/') || database.includes('\0')) throw new Error('Refusing to reset a missing or system database name.');

console.log(`This permanently deletes every table and record in ${database} on ${target.hostname}:${target.port || '5432'}.`);
console.log('Stop the API and all workers first. Redis queues, uploaded files, and backups are not deleted.');
if (!args.includes('--yes')) {
  if (!process.stdin.isTTY) throw new Error('Interactive confirmation is required. Use --yes for an intentional scripted reset.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`Type the database name (${database}) to continue: `);
    if (answer.trim() !== database) { console.log('Cancelled. No data was changed.'); process.exitCode = 0; process.exit(0); }
  } finally { prompt.close(); }
}

const maintenance = new URL(target);
maintenance.pathname = '/postgres';
const admin = postgres(maintenance.toString(), { max: 1, connect_timeout: 10 });
const identifier = '"' + database.replaceAll('"', '""') + '"';
try {
  const [connections] = await admin<{ count: number }[]>`select count(*)::int as count from pg_stat_activity where datname = ${database}`;
  if (connections?.count) throw new Error('The database has active connections. Stop the API, workers, and database tools, then retry. No data was deleted.');
  await admin.unsafe(`DROP DATABASE IF EXISTS ${identifier}`);
  await admin.unsafe(`CREATE DATABASE ${identifier}`);
  console.log('Database recreated. Applying migrations…');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database reset failed.');
  process.exitCode = 1;
} finally { await admin.end(); }

if (!process.exitCode) {
  const result = await Bun.spawn([process.execPath, 'run', 'db:migrate'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: target.toString() },
    stdout: 'inherit', stderr: 'inherit', stdin: 'inherit',
  }).exited;
  process.exitCode = result;
  if (result === 0) console.log('Fresh migrations complete. Sign up and finish onboarding to create your default categories.');
  else console.error('The database was reset, but migrations failed. Fix the migration error and run bun run db:migrate.');
}
