import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
export function databaseOptions(value) {
  try {
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (url.protocol !== 'mysql:' || !url.hostname || !url.username || !database || database.includes('/') || url.search || url.hash) throw new Error();
    return { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password), database, timezone: '+00:00',
      connectionLimit: 5, connectTimeout: 5000, acquireTimeout: 5000 };
  } catch { throw new Error('Invalid or unsupported DATABASE_URL'); }
}
export function createDatabase(config) {
  return new PrismaClient({ adapter: new PrismaMariaDb(databaseOptions(config.databaseUrl)) });
}
