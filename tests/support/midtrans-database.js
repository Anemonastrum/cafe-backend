import { createDatabase } from '../../src/configs/database.js';

// Separate explicit scope; ordinary testDatabaseConfig and historical app remain unchanged.
export function midtransDatabaseConfig(env = process.env) {
  let url;
  try {
    url = new URL(env.MIDTRANS_TEST_DATABASE_URL);
    if (url.protocol !== 'mysql:' || url.hostname !== '10.10.10.9' || (url.port || '3306') !== '3306'
        || decodeURIComponent(url.pathname) !== '/app_midtrans_test' || url.search || url.hash
        || env.MIDTRANS_TEST_DATABASE_TARGET !== '10.10.10.9:3306/app_midtrans_test') throw new Error('Unauthorized Midtrans test database');
  } catch { throw new Error('Unauthorized Midtrans test database'); }
  process.env.TEST_DATABASE_URL = url.href; // Existing HTTP fixture config, never ordinary DB helper.
  return { databaseUrl: url.href };
}
export async function withMidtransDatabase(fn) {
  const db = createDatabase(midtransDatabaseConfig());
  try { await db.$connect(); return await fn(db); }
  finally { await db.$disconnect(); }
}
