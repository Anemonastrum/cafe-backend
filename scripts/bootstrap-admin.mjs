import { createDatabase } from '../src/configs/database.js';
import { hashPassword, validPassword } from '../src/utils/password.js';
import { withWriteTx } from '../src/utils/transaction.js';
import { lockCafe } from '../src/models/lock.model.js';
import { appendAudit } from '../src/services/audit.service.js';

let db;
try {
  if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error();
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 4096) throw new Error();
  }
  const body = JSON.parse(input);
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !['username', 'full_name', 'password'].includes(k))
      || typeof body.username !== 'string' || !body.username.trim() || [...body.username].length > 60
      || typeof body.full_name !== 'string' || !body.full_name.trim() || [...body.full_name].length > 150
      || !validPassword(body.password)) throw new Error();
  const password_hash = await hashPassword(body.password);
  db = createDatabase({ databaseUrl: process.env.DATABASE_URL });
  await db.$connect();
  await withWriteTx(db, async tx => {
    await lockCafe(tx);
    // Any existing admin blocks bootstrap, including inactive accounts; recovery is separate.
    if (await tx.users.count({ where: { role: 'admin' } })) throw new Error();
    const user = await tx.users.create({ data: { username: body.username, full_name: body.full_name,
      password_hash, role: 'admin', is_active: true } });
    await appendAudit(tx, { actor: user, action: 'auth.bootstrap', entityType: 'users', entityId: user.id });
  });
  console.log('Initial admin created');
} catch {
  console.error('Bootstrap refused or failed. Use JSON on stdin, valid input, reachable database and no existing admin.');
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect().catch(() => { process.exitCode = 1; });
}
