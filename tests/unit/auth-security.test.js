import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoundedStore } from '../../src/middlewares/rate-limit.js';
import { authorize } from '../../src/middlewares/authorize.js';

test('bounded throttle store refuses new keys without evicting active bans', async () => {
  const store = new BoundedStore(2); store.init({ windowMs: 900000 });
  await store.increment('a'); await store.increment('b');
  await assert.rejects(store.increment('c'), { status: 429 });
  assert.equal((await store.increment('a')).totalHits, 2);
  await store.decrement('a'); assert.equal((await store.increment('a')).totalHits, 2);
  await store.resetKey('b'); assert.equal((await store.increment('c')).totalHits, 1);
});
test('role gates reject absent and forbidden actors', () => {
  const gate = authorize('admin'); let calls = 0;
  assert.throws(() => gate({}, {}, () => calls++), { status: 403 });
  assert.throws(() => gate({ actor: { role: 'cashier' } }, {}, () => calls++), { status: 403 });
  gate({ actor: { role: 'admin' } }, {}, () => calls++); assert.equal(calls, 1);
});
