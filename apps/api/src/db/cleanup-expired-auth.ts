import { client } from './index';

export {};

async function removeExpired(tableName: 'session' | 'verification'): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await client.unsafe<{ id: string }[]>(`
      WITH expired AS (
        SELECT id FROM "${tableName}"
        WHERE expires_at < now()
        ORDER BY expires_at
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "${tableName}" AS target
      USING expired
      WHERE target.id = expired.id
      RETURNING target.id
    `);
    total += deleted.length;
    if (deleted.length < 500) return total;
  }
}

try {
  const [sessions, verifications] = await Promise.all([
    removeExpired('session'), removeExpired('verification')
  ]);
  console.log(`Removed ${sessions} expired sessions and ${verifications} expired verification records.`);
} finally {
  await client.end();
}
