import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { withDatabase } from '../support/database.js';
import { withWriteTx } from '../../src/utils/transaction.js';

test('write transaction sees a second connection commit (ReadCommitted, not session default)', async () => withDatabase(async db => {
  const row = await db.categories.create({ data: { name: `isolation-${randomUUID()}` } });
  try {
    await withWriteTx(db, async tx => {
      assert.equal((await tx.categories.findUnique({ where: { id: row.id } })).sort_order, 0);
      // Awaited external commit is the barrier: first read, second connection commit, next read.
      await db.categories.update({ where: { id: row.id }, data: { sort_order: 7 } });
      assert.equal((await tx.categories.findUnique({ where: { id: row.id } })).sort_order, 7);
    });
  } finally { await db.categories.delete({ where: { id: row.id } }); }
}));
