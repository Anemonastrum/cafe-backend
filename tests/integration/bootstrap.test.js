import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { withDatabase, testDatabaseConfig } from '../support/database.js';
import { verifyPassword } from '../../src/utils/password.js';
const run = (input, args = []) => new Promise((resolve, reject) => {
  const env = { ...process.env, DATABASE_URL: testDatabaseConfig().databaseUrl }; delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['scripts/bootstrap-admin.mjs', ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
  child.on('error', reject); child.on('close', code => resolve({ code, output }));
  child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input));
});

test('bootstrap rejects command-line secrets and concurrent attempts create only one first admin', async () => withDatabase(async db => {
  assert.equal(await db.users.count({ where: { role: 'admin' } }), 0, 'Bootstrap test needs no existing admin; never delete existing accounts');
  const suffix = randomUUID(), password = 'Bootstrap test password 42!';
  const inputs = [0, 1].map(n => ({ username: `bootstrap-${n}-${suffix}`, full_name: 'Bootstrap test', password }));
  try {
    const invalid = await run(inputs[0], ['--password', 'synthetic-not-a-secret']); assert.notEqual(invalid.code, 0);
    assert.equal(await db.users.count({ where: { username: { in: inputs.map(x => x.username) } } }), 0);
    const results = await Promise.all(inputs.map(x => run(x)));
    assert.deepEqual(results.map(r => r.code).sort(), [0, 1]);
    for (const r of results) assert.equal(r.output.includes(password), false);
    const users = await db.users.findMany({ where: { username: { in: inputs.map(x => x.username) } } });
    assert.equal(users.length, 1); assert.equal(users[0].is_active, true); assert.equal(users[0].role, 'admin');
    assert.equal(await verifyPassword(password, users[0].password_hash), true);
    assert.equal(await db.audit_logs.count({ where: { user_id: users[0].id, action: 'auth.bootstrap' } }), 1);
    assert.notEqual((await run(inputs[1])).code, 0);
  } finally {
    const users = await db.users.findMany({ where: { username: { in: inputs.map(x => x.username) } }, select: { id: true } });
    const ids = users.map(u => u.id);
    await db.audit_logs.deleteMany({ where: { user_id: { in: ids } } });
    await db.users.deleteMany({ where: { id: { in: ids } } });
  }
}));
