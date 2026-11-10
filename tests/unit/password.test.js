import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';

test('password hashing is salted, bounded and verifies without normalization', async () => {
  const password = 'Long secret café 42';
  const start = performance.now();
  const a = await hashPassword(password), b = await hashPassword(password);
  console.log(`scrypt two hashes: ${Math.round(performance.now() - start)}ms`);
  assert.notEqual(a, b); assert.ok(a.length < 255);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(password + ' ', a), false);
  assert.equal(await verifyPassword('wrong', a), false);
  for (const bad of ['', 'plain', a.replace('131072', '262144'), a + 'x', null]) {
    assert.equal(await verifyPassword(password, bad), false);
  }
  for (const bad of ['', 'short', 'x'.repeat(129), null]) await assert.rejects(hashPassword(bad), { status: 422 });
  assert.equal(await verifyPassword('x'.repeat(513), a), false);
});

test('hash work admits two active plus eight queued and rejects overflow', async () => {
  const jobs = Array.from({ length: 11 }, () => hashPassword('Queue test password'));
  const result = await Promise.allSettled(jobs);
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 10);
  assert.equal(result[10].reason.status, 429);
  assert.equal(await verifyPassword('Queue test password', result[0].value), true);
});
