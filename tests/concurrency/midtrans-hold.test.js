import test from 'node:test';
import assert from 'node:assert/strict';
import { withMidtransDatabase } from '../support/midtrans-database.js';
import { orderFixture } from '../support/orders.js';
import { observeCafeLock } from '../support/shifts.js';
import { withWriteTx } from '../../src/utils/transaction.js';
import { lockCafe } from '../../src/models/lock.model.js';
import { closeShift } from '../../src/services/shifts.service.js';

const gate = () => {
  let ready, release;
  return { held: new Promise(r => { ready = r; }), wait: new Promise(r => { release = r; }), ready: () => ready(), release: () => release() };
};
test('hold versus shift closure serializes both schedules; closed shift never reopens', async () => withMidtransDatabase(async db => {
  const f = await orderFixture(db);
  let g, first, second;
  try {
    const shift = (await f.api('/cashier-shifts/open', 'POST', { cash_register_id: String(f.registers[0].id) }, f.cashier)).body.data;
    const actor = await f.actor(f.adminA, f.admin);
    const order = await db.orders.create({ data: { cashier_id: f.cashierA.id, shift_id: BigInt(shift.id), order_type: 'dine_in', order_number: 'HOLD-' + shift.id, client_request_id: crypto.randomUUID(), status: 'cancelled' } });
    g = gate();
    // Hold wins first. Closure must block, then reject even cancelled unpaid order.
    first = withWriteTx(db, async tx => { await lockCafe(tx); await tx.orders.update({ where: { id: order.id }, data: { reconciliation_hold: true } }); g.ready(); await g.wait; });
    await g.held;
    const observer = observeCafeLock(db);
    second = closeShift(observer.db, actor, { id: BigInt(shift.id) }).then(() => null, error => error);
    try { await observer.assertBlocked(); } finally { g.release(); }
    await first;
    assert.equal((await second).code, 'SHIFT_CONFLICT');
    assert.equal((await db.cashier_shifts.findUnique({ where: { id: BigInt(shift.id) } })).status, 'open');

    // Test-only reset of fixture hold, not operational release functionality.
    await db.orders.update({ where: { id: order.id }, data: { reconciliation_hold: false } });
    g = gate();
    const heldDb = { $transaction: (fn, options) => db.$transaction(async tx => { const result = await fn(tx); g.ready(); await g.wait; return result; }, options) };
    first = closeShift(heldDb, actor, { id: BigInt(shift.id) });
    await g.held;
    const nextObserver = observeCafeLock(db);
    second = withWriteTx(nextObserver.db, async tx => { await lockCafe(tx); await tx.orders.update({ where: { id: order.id }, data: { reconciliation_hold: true } }); });
    try { await nextObserver.assertBlocked(); } finally { g.release(); }
    await first; await second;
    assert.equal((await db.orders.findUnique({ where: { id: order.id } })).reconciliation_hold, true);
    assert.equal((await db.cashier_shifts.findUnique({ where: { id: BigInt(shift.id) } })).status, 'closed');
    assert.equal((await closeShift(db, actor, { id: BigInt(shift.id) })).status, 'closed');
  } finally { g?.release(); await Promise.allSettled([first, second].filter(Boolean)); await f.cleanup(); }
}));
