import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withMidtransDatabase } from '../support/midtrans-database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
import { hasUnresolvedWork } from '../../src/models/shifts.model.js';
import { withWriteTx } from '../../src/utils/transaction.js';
import { lockCafe } from '../../src/models/lock.model.js';
import { failManualPayment } from '../../src/services/payment.service.js';

test('shift closure uses bounded query count for historical orders', async () => withMidtransDatabase(async db => {
  const f = await orderFixture(db);
  try {
    const shift = (await f.api('/cashier-shifts/open', 'POST', { cash_register_id: String(f.registers[0].id) }, f.cashier)).body.data;
    await db.orders.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ cashier_id: f.cashierA.id, shift_id: BigInt(shift.id), order_type: 'dine_in', status: 'cancelled', order_number: 'BULK-' + i, client_request_id: randomUUID() })) });
    await withWriteTx(db, async tx => {
      await lockCafe(tx);
      let calls = 0;
      const counted = new Proxy(tx, { get(target, key) {
        if (key === '$queryRaw') return (...args) => { calls++; return target.$queryRaw(...args); };
        if (key === 'orders' || key === 'payments') return new Proxy(target[key], { get(model, method) { return (...args) => { calls++; return model[method](...args); }; } });
        return target[key];
      } });
      assert.equal(await hasUnresolvedWork(counted, BigInt(shift.id)), false);
      assert.ok(calls <= 5, `Expected bounded round trips; got ${calls}`);
    });
  } finally { await f.cleanup(); }
}));

test('hold alone blocks eligible confirmation and new checkout; unheld controls succeed', async () => withMidtransDatabase(async db => {
  const f = await orderFixture(db), method = await db.payment_methods.findUnique({ where: { code: 'qris' } });
  try {
    await db.payment_methods.update({ where: { id: method.id }, data: { is_enabled: true, provider: 'manual' } });
    await f.api('/cashier-shifts/open', 'POST', { cash_register_id: String(f.registers[0].id) });
    for (const kind of ['confirm', 'manual', 'cash']) {
      const result = await f.api('/orders', 'POST', { ...f.input, client_request_id: randomUUID() });
      assert.equal(result.status, 201);
      const id = BigInt(result.body.data.id);
      const pay = () => request(f.h, { path: `/orders/${id}/payments/${kind === 'cash' ? 'cash' : 'qris'}`, method: 'POST', body: kind === 'cash' ? { cash_received: '50000' } : { provider: 'manual' }, ...f.admin, headers: { Origin: f.config.allowedOrigin, 'Idempotency-Key': randomUUID() } });
      let confirmId;
      if (kind === 'confirm') { const pending = await pay(); assert.equal(pending.status, 201); confirmId = pending.body.data.id; }
      else if (kind === 'manual') {
        const prior = await pay(); assert.equal(prior.status, 201);
        await db.payments.update({ where: { id: BigInt(prior.body.data.id) }, data: { status: 'failed', failed_at: new Date() } });
      }
      const action = kind === 'confirm' ? () => f.api(`/payments/${confirmId}/confirm-manual`, 'POST') : pay;
      await db.orders.update({ where: { id }, data: { reconciliation_hold: true } });
      assert.equal((await action()).status, 409, kind);
      await db.orders.update({ where: { id }, data: { reconciliation_hold: false } });
      const control = await action();
      assert.equal(control.status, kind === 'confirm' ? 200 : 201, JSON.stringify(control.body));
    }
  } finally { await f.cleanup(); await db.payment_methods.update({ where: { id: method.id }, data: { is_enabled: method.is_enabled, provider: method.provider } }); }
}));

// Run only with explicit isolated-schema env; no historical app fixture writes.
test('P12 forward persistence columns exist with safe legacy defaults', async () => withMidtransDatabase(async db => {
  const fields = await db.$queryRaw`SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('reconciliation_hold','gateway_attempt_snapshot','gateway_charge_started_at','issued_by_user_id')`;
  assert.equal(fields.length, 4);
  assert.equal(fields.find(f => f.COLUMN_NAME === 'issued_by_user_id').IS_NULLABLE, 'YES');
  assert.ok(fields.some(f => f.COLUMN_NAME === 'reconciliation_hold' && f.COLUMN_DEFAULT === '0'));
}));

test('P12 reconciliation hold freezes mounted mutations, recovery and all payment-related shifts', async () => withMidtransDatabase(async db => {
  const f = await orderFixture(db), method = await db.payment_methods.findUnique({ where: { code: 'qris' } });
  try {
    await db.payment_methods.update({ where: { id: method.id }, data: { is_enabled: true, provider: 'manual' } });
    const origin = (await f.api('/cashier-shifts/open', 'POST', { cash_register_id: String(f.registers[0].id) }, f.cashier)).body.data;
    const processor = (await f.api('/cashier-shifts/open', 'POST', { cash_register_id: String(f.registers[1].id) })).body.data;
    const otherShift = (await f.api('/cashier-shifts/open', 'POST', { cash_register_id: String(f.registers[2].id) }, f.other)).body.data;
    const created = await f.api('/orders', 'POST', f.input, f.cashier);
    assert.equal(created.status, 201);
    const order = created.body.data, id = BigInt(order.id), item = order.items[0];
    const pay = (provider, session = f.admin) => request(f.h, { path: `/orders/${id}/payments/qris`, method: 'POST', body: { provider }, ...session, headers: { Origin: f.config.allowedOrigin, 'Idempotency-Key': randomUUID() } });
    const pending = await pay('manual'); assert.equal(pending.status, 201);
    const paymentId = BigInt(pending.body.data.id), actor = await f.actor(f.adminA, f.admin);
    const snapshot = { version: 1, amount: '50000.00', currency: 'IDR', gateway_order_id: pending.body.data.payment_reference, pricing_snapshot_version: 1 };
    const started = new Date('2026-11-13T00:00:00.123Z');
    await db.payments.update({ where: { id: paymentId }, data: { gateway_attempt_snapshot: snapshot, gateway_charge_started_at: started } });
    const stored = await db.payments.findUnique({ where: { id: paymentId } });
    assert.deepEqual(stored.gateway_attempt_snapshot, snapshot);
    assert.equal(stored.gateway_charge_started_at.toISOString(), started.toISOString());
    // Nullable issuer preserves FK on nonnull IDs; this is storage proof, not settlement.
    const receipt = await db.receipts.create({ data: { payment_id: paymentId, receipt_number: 'NULL-' + paymentId, cafe_name_snapshot: 'Fixture', issued_by_user_id: null } });
    assert.equal(receipt.issued_by_user_id, null);
    await assert.rejects(db.receipts.update({ where: { id: receipt.id }, data: { issued_by_user_id: 18446744073709551615n } }));
    await db.receipts.delete({ where: { id: receipt.id } });
    await db.orders.update({ where: { id }, data: { reconciliation_hold: true } });
    // Remove pending invariant so hold alone must block each mutation.
    await db.payments.update({ where: { id: paymentId }, data: { status: 'failed', failed_at: new Date() } });
    const routes = [
      [`/orders/${id}`, 'PATCH', { notes: 'blocked' }],
      [`/orders/${id}/hold`, 'POST', undefined], [`/orders/${id}/resume`, 'POST', undefined],
      [`/orders/${id}/status`, 'PATCH', { status: 'preparing' }],
      [`/orders/${id}/cancel`, 'POST', { reason: 'blocked' }],
      [`/orders/${id}/items`, 'POST', { product_id: String(f.product.id), quantity: 1 }],
      [`/orders/${id}/items/${item.id}`, 'PATCH', { quantity: 3 }],
      [`/orders/${id}/items/${item.id}`, 'DELETE', undefined],
      [`/orders/${id}/discounts`, 'POST', { name: 'blocked', calculation: 'fixed', value: '1' }],
      [`/orders/${id}/discounts/999999`, 'DELETE', undefined],
      [`/payments/${paymentId}/confirm-manual`, 'POST', undefined],
    ];
    for (const [path, verb, body] of routes) {
      const response = await f.api(path, verb, body);
      assert.equal(response.status, 409, path + ': ' + JSON.stringify(response.body));
    }
    await db.payments.update({ where: { id: paymentId }, data: { status: 'pending', failed_at: null } });
    await assert.rejects(failManualPayment(db, actor, { id: paymentId, reason: 'blocked', expected_status: 'pending' }), error => error.status === 409);
    assert.equal((await pay('manual')).status, 409);
    const cash = await request(f.h, { path: `/orders/${id}/payments/cash`, method: 'POST', body: { cash_received: '50000' }, ...f.admin, headers: { Origin: f.config.allowedOrigin, 'Idempotency-Key': randomUUID() } });
    assert.equal(cash.status, 409);
    // Failed attempt with paid replacement cannot escape hold through paid/cancelled filters.
    await db.payments.update({ where: { id: paymentId }, data: { status: 'failed', failed_at: new Date(), provider: 'midtrans' } });
    await db.orders.update({ where: { id }, data: { payment_status: 'paid', paid_at: new Date() } });
    const paidLifecycle = await f.api(`/orders/${id}/status`, 'PATCH', { status: 'preparing' });
    assert.equal(paidLifecycle.status, 409);
    for (const shift of [origin, processor]) {
      const close = await f.api(`/cashier-shifts/${shift.id}/close`, 'POST', {});
      assert.equal(close.status, 409, JSON.stringify(close.body));
      assert.equal((await db.cashier_shifts.findUnique({ where: { id: BigInt(shift.id) } })).status, 'open');
    }
    // Unrelated shift remains closeable; reads and existing closed-shift replay remain allowed.
    assert.equal((await f.api(`/cashier-shifts/${otherShift.id}/close`, 'POST', {})).status, 200);
    assert.equal((await f.api(`/orders/${id}`)).status, 200);
    assert.equal((await db.orders.findUnique({ where: { id } })).notes, null);
    assert.equal(await db.receipts.count({ where: { payment_id: paymentId } }), 0);
  } finally {
    await f.cleanup();
    await db.payment_methods.update({ where: { id: method.id }, data: { is_enabled: method.is_enabled, provider: method.provider } });
  }
}));
