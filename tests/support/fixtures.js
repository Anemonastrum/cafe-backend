import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/utils/password.js';
import { loadConfig } from '../../src/configs/env.js';
export const testPassword = 'Fixture password 42!';
export const testConfig = () => loadConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL,
  ALLOWED_ORIGIN: 'http://localhost:5173', CSRF_KEY: 'c'.repeat(32), READINESS_SECRET: 'r'.repeat(32), ALLOW_INSECURE_COOKIE: 'true' });
export async function fixture(db) {
  const users = {};
  const password_hash = await hashPassword(testPassword);
  const cleanup = async () => {
    const ids = Object.values(users).map(u => u.id);
    await db.audit_logs.deleteMany({ where: { user_id: { in: ids } } });
    await db.auth_sessions.deleteMany({ where: { user_id: { in: ids } } });
    await db.users.deleteMany({ where: { id: { in: ids } } });
  };
  try {
    for (const name of ['adminA', 'adminB', 'cashierA', 'cashierB']) {
      users[name] = await db.users.create({ data: { username: `${name}-${randomUUID()}`, full_name: name,
        role: name.startsWith('admin') ? 'admin' : 'cashier', password_hash } });
    }
    return { ...users, password: testPassword, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
