import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withWriteTx } from '../../src/utils/transaction.js';
import { Prisma } from '@prisma/client';
import { toWire } from '../../src/utils/serialize.js';
import { databaseOptions } from '../../src/configs/database.js';
test('transaction retries recognized conflicts three times with explicit isolation', async () => {
  let calls = 0;
  const db = { $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    if (++calls < 3) throw Object.assign(new Error('conflict'), { code: 'P2034' });
    return fn({ marker: 7 });
  } };
  assert.equal(await withWriteTx(db, async tx => tx.marker), 7);
  assert.equal(calls, 3);
  calls = 0;
  db.$transaction = async () => { calls++; throw Object.assign(new Error('conflict'), { code: 'P2034' }); };
  await assert.rejects(withWriteTx(db, () => {}), { code: 'P2034' });
  assert.equal(calls, 3);
});
test('unique and unknown errors are never retried', async () => {
  for (const code of ['P2002', undefined]) {
    let calls = 0;
    const error = Object.assign(new Error('no retry'), { code });
    await assert.rejects(withWriteTx({ $transaction: async () => { calls++; throw error; } }, () => {}), e => e === error);
    assert.equal(calls, 1);
  }
});
test('database options percent-decode credentials, bound pool and reject dropped security options', () => {
  const config = databaseOptions('mysql://user%40cafe:p%3Ass@localhost:3307/app');
  assert.equal(config.user, 'user@cafe'); assert.equal(config.password, 'p:ss');
  assert.equal(config.port, 3307); assert.equal(config.timezone, '+00:00');
  assert.equal(config.connectionLimit, 5); assert.equal(config.connectTimeout, 5000);
  assert.throws(() => databaseOptions('mysql://user:secret@localhost/app?ssl=false'));
});
test('Prisma decimals retain two places at wire boundary', () => {
  assert.deepEqual(toWire({ price: new Prisma.Decimal('25000'), id: 9007199254740993n }), { price: '25000.00', id: '9007199254740993' });
});
