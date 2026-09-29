import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 10);
if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 100) {
  throw new Error('DATABASE_POOL_MAX must be an integer from 1 to 100');
}

export const client = postgres(process.env.DATABASE_URL ?? 'postgres://capybudget:capybudget@localhost:5432/capybudget', { max: poolMax });
export const db = drizzle(client);
