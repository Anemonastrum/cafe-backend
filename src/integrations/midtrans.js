import { createHash, timingSafeEqual } from 'node:crypto';
import { money } from '../utils/money.js';
import { AppError } from '../utils/errors.js';

const host = 'https://api.sandbox.midtrans.com';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,50}$/.test(value);
const validSecret = value => typeof value === 'string' && /^[\x21-\x7e]{16,256}$/.test(value) && !value.includes(':');
const invalid = () => { throw new AppError(422, 'INVALID_PROVIDER_INPUT', 'Invalid sandbox payment input'); };
const unavailable = details => new AppError(503, 'PROVIDER_UNAVAILABLE', 'Sandbox provider outcome unavailable', details);

export function qrisAmount(amount) {
  const value = money(amount);
  if (!value.isInteger() || value.lte(0)) invalid();
  return value.toNumber(); // Schema ceiling is below Number.MAX_SAFE_INTEGER.
}

export function verifySignature(payload, secrets) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !validId(payload.order_id) || typeof payload.status_code !== 'string' || !/^\d{3}$/.test(payload.status_code)
      || typeof payload.gross_amount !== 'string' || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(payload.gross_amount)
      || typeof payload.signature_key !== 'string' || !/^[a-fA-F0-9]{128}$/.test(payload.signature_key)
      || !Array.isArray(secrets) || !secrets.length || secrets.length > 2 || ![...secrets].every(validSecret)) return false;
  const supplied = Buffer.from(payload.signature_key, 'hex');
  let matched = false;
  for (const secret of secrets) {
    const expected = createHash('sha512').update(payload.order_id + payload.status_code + payload.gross_amount + secret).digest();
    matched = timingSafeEqual(expected, supplied) || matched;
  }
  return matched;
}

async function readJson(response) {
  if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw unavailable();
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw unavailable();
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw unavailable();
    return data;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function observation(data, gatewayOrderId, expectedAmount) {
  if (!['200', '201'].includes(data.status_code) || !validId(data.order_id) || !validId(data.transaction_id)
      || data.payment_type !== 'qris' || data.currency !== 'IDR'
      || typeof data.transaction_status !== 'string' || !/^[a-z_]{1,40}$/.test(data.transaction_status)) throw unavailable();
  const amount = qrisAmount(data.gross_amount);
  const result = {
    gatewayOrderId: data.order_id, transactionId: data.transaction_id, statusCode: data.status_code,
    status: data.transaction_status, amount: amount.toFixed(2), currency: 'IDR', paymentType: 'qris',
  };
  if (data.order_id !== gatewayOrderId || (expectedAmount !== undefined && amount !== expectedAmount)) {
    // Reconciliation may persist this bounded conflict evidence; never treat it as settlement.
    throw unavailable({ observation: result });
  }
  if (data.actions !== undefined) {
    if (!Array.isArray(data.actions) || data.actions.length > 10) throw unavailable();
    const actions = data.actions.filter(action => action?.name === 'generate-qr-code');
    if (actions.length > 1) throw unavailable();
    if (actions.length) {
      const action = actions[0];
      if (action.method !== 'GET' || typeof action.url !== 'string' || action.url.length > 2048) throw unavailable();
      const url = new URL(action.url);
      if (url.origin !== host || url.username || url.password || url.hash || !url.pathname.startsWith('/v2/qris/')) throw unavailable();
      result.qrCodeUrl = url.href;
    }
  }
  return result;
}

// ponytail: sandbox-only transport; production requires separate reviewed enablement and evidence.
export function createMidtransClient({ serverKey, timeoutMs = 5000 }, fetchImpl = fetch) {
  if (!validSecret(serverKey) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) invalid();
  const headers = { Authorization: 'Basic ' + Buffer.from(serverKey + ':').toString('base64'), Accept: 'application/json', 'Content-Type': 'application/json' };
  async function request(path, body, gatewayOrderId, expectedAmount) {
    try {
      const response = await fetchImpl(host + path, {
        method: body === undefined ? 'GET' : 'POST', headers: { ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await readJson(response);
      if (body === undefined && data.status_code === '404') return { gatewayOrderId, status: 'not_found', statusCode: '404' };
      return observation(data, gatewayOrderId, expectedAmount);
    } catch (error) {
      if (error instanceof AppError && error.code === 'PROVIDER_UNAVAILABLE') throw error;
      throw unavailable(); // No raw response, URL, cause, credential or provider message escapes.
    }
  }
  return {
    async chargeQris({ gatewayOrderId, amount }) {
      if (!validId(gatewayOrderId)) invalid();
      const value = qrisAmount(amount);
      return request('/v2/charge', { payment_type: 'qris', transaction_details: { order_id: gatewayOrderId, gross_amount: value } }, gatewayOrderId, value);
    },
    async getProviderStatus(gatewayOrderId) {
      if (!validId(gatewayOrderId)) invalid();
      return request(`/v2/${gatewayOrderId}/status`, undefined, gatewayOrderId);
    },
  };
}
