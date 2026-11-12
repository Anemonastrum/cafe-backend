import { readFileSync, statSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createDatabase } from '../../src/configs/database.js';
import { midtransDatabaseConfig } from './midtrans-database.js';
export function testDatabaseConfig() {
  if (process.env.MIDTRANS_TEST_DATABASE_URL !== undefined || process.env.MIDTRANS_TEST_DATABASE_TARGET !== undefined) return midtransDatabaseConfig();
  const path = new URL('../../.env.test', import.meta.url);
  if ((statSync(path).mode & 0o077) !== 0) throw new Error('.env.test must be owner-readable only');
  const env = parseEnv(readFileSync(path, 'utf8'));
  const url = new URL(env.TEST_DATABASE_URL);
  const target = `${url.hostname}:${url.port || '3306'}${decodeURIComponent(url.pathname)}`;
  if (env.TEST_DATABASE_TARGET !== target || target !== '10.10.10.9:3306/app') throw new Error('Unauthorized test database target');
  // Explicitly disposable target is user-authorized; never infer authorization from credentials.
  process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL;
  return { databaseUrl: env.TEST_DATABASE_URL };
}
export async function withDatabase(fn) {
  const db = createDatabase(testDatabaseConfig());
  try { await db.$connect(); return await fn(db); }
  finally { await db.$disconnect(); }
}
