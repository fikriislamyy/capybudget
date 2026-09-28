import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export const client = postgres(process.env.DATABASE_URL ?? 'postgres://capybudget:capybudget@localhost:5432/capybudget');
export const db = drizzle(client);
