import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMidtransClient, qrisAmount, verifySignature } from '../../src/integrations/midtrans.js';

const key = 'sandbox-api-key-for-unit-tests-only';
const secret = 'signature-secret-for-unit-tests-only';
const reference = 'PAY-12345678-1234-4234-8234-123456789abc';
const provider = (extra = {}) => ({ status_code: '200', order_id: reference, transaction_id: 'tx-123', payment_type: 'qris', currency: 'IDR', gross_amount: '12500.00', transaction_status: 'pending', ...extra });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unavailable = error => error.status === 503 && error.code === 'PROVIDER_UNAVAILABLE' && !error.message.includes(key);

// Break caught: rounding fractional approved totals, accepting unsafe or zero amounts.
test('QRIS accepts positive whole IDR without rounding or float precision loss', () => {
  assert.equal(qrisAmount('12500.00'), 12500);
  assert.equal(qrisAmount('999999999999.00'), 999999999999);
  for (const amount of ['0', '0.00', '1.01', '-1', '1e3', '01', '1000000000000', 'Infinity', 12500, null]) {
    assert.throws(() => qrisAmount(amount), error => error.status === 422);
  }
});

// Break caught: using ServerKey, normalizing signed strings, accepting malformed signatures.
test('signature uses exact strings, distinct secret and bounded rotation keys', () => {
  const payload = { order_id: reference, status_code: '200', gross_amount: '12500.00' };
  const signature_key = createHash('sha512').update(reference + '20012500.00' + secret).digest('hex');
  assert.equal(verifySignature({ ...payload, signature_key }, [secret]), true);
  assert.equal(verifySignature({ ...payload, signature_key: signature_key.toUpperCase() }, [key, secret]), true);
  assert.equal(verifySignature({ ...payload, signature_key }, [key]), false);
  assert.equal(verifySignature({ ...payload, gross_amount: '12500', signature_key }, [secret]), false);
  for (const signature_key of ['', 'a'.repeat(127), 'g'.repeat(128), null, {}, 'é'.repeat(128)]) {
    assert.equal(verifySignature({ ...payload, signature_key }, [secret]), false);
  }
  for (const payload of [null, [], {}, { order_id: reference, status_code: 200, gross_amount: '12500.00' }]) {
    assert.equal(verifySignature(payload, [secret]), false);
  }
  assert.equal(verifySignature({ ...payload, signature_key }, []), false);
  assert.equal(verifySignature({ ...payload, signature_key }, ['', secret]), false);
  assert.equal(verifySignature({ ...payload, signature_key }, [key, secret, key]), false);
});

test('sparse rotation arrays cannot sign with implicit undefined secret', () => {
  const payload = { order_id: reference, status_code: '200', gross_amount: '12500.00' };
  const forged = createHash('sha512').update(reference + '20012500.00undefined').digest('hex');
  const valid = createHash('sha512').update(reference + '20012500.00' + secret).digest('hex');
  for (const secrets of [Array(1), [, secret], [secret, ,]]) {
    assert.equal(verifySignature({ ...payload, signature_key: forged }, secrets), false);
    assert.equal(verifySignature({ ...payload, signature_key: valid }, secrets), false);
  }
});

test('HTTP and MIME rejection cancels unread response stream', async () => {
  for (const [status, type] of [[500, 'application/json'], [200, 'text/html']]) {
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    const client = createMidtransClient({ serverKey: key }, async () => new Response(stream, { status, headers: { 'Content-Type': type } }));
    await assert.rejects(client.getProviderStatus(reference), unavailable);
    assert.equal(cancelled, true);
  }
});

// Break caught: arbitrary host/redirect, wrong auth or amount, leaking raw fields to callers.
test('charge fixes sandbox destination, emits integer IDR, returns bounded observation only', async () => {
  const client = createMidtransClient({ serverKey: key }, async (url, options) => {
    assert.equal(url, 'https://api.sandbox.midtrans.com/v2/charge');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from(key + ':').toString('base64'));
    assert.deepEqual(JSON.parse(options.body), { payment_type: 'qris', transaction_details: { order_id: reference, gross_amount: 12500 } });
    assert.ok(options.signal instanceof AbortSignal);
    return response(provider({ status_code: '201', signature_key: 'never-return', status_message: key, actions: [{ name: 'generate-qr-code', method: 'GET', url: 'https://api.sandbox.midtrans.com/v2/qris/tx-123/qr-code' }] }), 201);
  });
  assert.deepEqual(await client.chargeQris({ gatewayOrderId: reference, amount: '12500.00' }), {
    gatewayOrderId: reference, transactionId: 'tx-123', statusCode: '201', status: 'pending', amount: '12500.00', currency: 'IDR', paymentType: 'qris',
    qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/tx-123/qr-code',
  });
});

test('invalid charge input and credentials fail before outbound network', async () => {
  let calls = 0;
  const client = createMidtransClient({ serverKey: key }, async () => { calls++; throw new Error('unexpected network'); });
  for (const gatewayOrderId of ['', '../status', 'a'.repeat(51), 'x?y', 'hello\n']) {
    await assert.rejects(client.chargeQris({ gatewayOrderId, amount: '100.00' }), error => error.status === 422);
    await assert.rejects(client.getProviderStatus(gatewayOrderId), error => error.status === 422);
  }
  await assert.rejects(client.chargeQris({ gatewayOrderId: reference, amount: '100.01' }), error => error.status === 422);
  assert.equal(calls, 0);
  for (const serverKey of ['', ' ', key + '\n', 'x:y'.repeat(12), null]) assert.throws(() => createMidtransClient({ serverKey }));
  for (const timeoutMs of [0, -1, 30001, NaN, '5000']) assert.throws(() => createMidtransClient({ serverKey: key, timeoutMs }));
});

test('status query distinguishes not_found from terminal failure or safe replacement', async () => {
  const client = createMidtransClient({ serverKey: key }, async (url, options) => {
    assert.equal(url, `https://api.sandbox.midtrans.com/v2/${reference}/status`);
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return response({ status_code: '404', status_message: key });
  });
  assert.deepEqual(await client.getProviderStatus(reference), { gatewayOrderId: reference, status: 'not_found', statusCode: '404' });
});

test('provider statuses remain observations, never financial settlement instructions', async () => {
  for (const status of ['pending', 'settlement', 'deny', 'cancel', 'expire', 'capture', 'refund', 'chargeback', 'new_state']) {
    const client = createMidtransClient({ serverKey: key }, async () => response(provider({ transaction_status: status, private_field: key })));
    const observation = await client.getProviderStatus(reference);
    assert.equal(observation.status, status);
    assert.equal(JSON.stringify(observation).includes(key), false);
    assert.equal(observation.paid, undefined);
  }
});

test('timeouts and network failures never retry charge or expose provider errors', async () => {
  for (const failure of [new Error(key), new DOMException('accepted then timed out', 'TimeoutError')]) {
    let calls = 0;
    const client = createMidtransClient({ serverKey: key }, async () => { calls++; throw failure; });
    await assert.rejects(client.chargeQris({ gatewayOrderId: reference, amount: '12500.00' }), unavailable);
    assert.equal(calls, 1);
  }
});

test('transport rejects error HTTP, wrong identity, non-IDR, invalid money and unsafe QR URLs', async () => {
  const cases = [
    response(provider(), 500), response(provider(), 302), response({ status_code: '401', status_message: key }),
    response(provider({ order_id: 'other' })), response(provider({ transaction_id: '' })),
    response(provider({ payment_type: 'credit_card' })), response(provider({ currency: 'USD' })),
    response(provider({ gross_amount: 12500 })), response(provider({ gross_amount: '12500.01' })),
    response(provider({ gross_amount: '12501.00' })), response(provider({ transaction_status: 'x'.repeat(41) })),
    response(provider({ actions: [{ name: 'generate-qr-code', method: 'GET', url: 'https://evil.example/qr' }] })),
    response(provider({ actions: [{ name: 'generate-qr-code', method: 'GET', url: 'http://api.sandbox.midtrans.com/qr' }] })),
    response(provider({ actions: [{ name: 'generate-qr-code', method: 'GET', url: 'https://user:pass@api.sandbox.midtrans.com/qr' }] })),
    new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
  ];
  for (const result of cases) {
    const client = createMidtransClient({ serverKey: key }, async () => result);
    await assert.rejects(client.chargeQris({ gatewayOrderId: reference, amount: '12500.00' }), unavailable);
  }
});

test('response size bound applies to streamed bytes without Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } });
  const client = createMidtransClient({ serverKey: key }, async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(client.getProviderStatus(reference), unavailable);
  assert.equal(cancelled, true);
});
