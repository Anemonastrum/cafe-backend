import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/configs/env.js';
import { parseId } from '../../src/utils/ids.js';
import { toWire } from '../../src/utils/serialize.js';
import { parsePage } from '../../src/utils/pagination.js';

const env = {
  NODE_ENV: 'test', DATABASE_URL: 'mysql://user:secret@localhost:3306/testdb',
  ALLOWED_ORIGIN: 'http://localhost:5173', CSRF_KEY: 'c'.repeat(32),
  READINESS_SECRET: 'r'.repeat(32),
};
async function serve(t, db) {
  const server = createApp({ db, config: loadConfig(env) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('root compatibility, liveness and unknown route envelope', async t => {
  const url = await serve(t);
  assert.deepEqual(await (await fetch(url)).json(), { message: 'API is running' });
  assert.deepEqual(await (await fetch(`${url}/api/v1/health`)).json(), { data: { status: 'ok' } });
  const missing = await fetch(`${url}/api/v1/missing`);
  assert.equal(missing.status, 404);
  const body = await missing.json();
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.match(body.request_id, /^[0-9a-f-]{36}$/);
  assert.equal(missing.headers.get('x-request-id'), body.request_id);
  assert.equal(missing.headers.get('x-powered-by'), null);
});

test('readiness requires internal secret and reports DB failure without leaking it', async t => {
  const url = await serve(t, { $queryRaw: async () => { throw new Error('mysql://private:secret@database'); } });
  for (const key of [undefined, 'wrong']) {
    const response = await fetch(`${url}/api/v1/ready`, { headers: key ? { 'X-Readiness-Key': key } : {} });
    assert.equal(response.status, 403);
  }
  const response = await fetch(`${url}/api/v1/ready`, { headers: { 'X-Readiness-Key': env.READINESS_SECRET } });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.ok(!body.includes('private') && !body.includes('secret') && !body.includes(env.READINESS_SECRET));
});

test('readiness succeeds only after successful database query', async t => {
  let queried = false;
  const url = await serve(t, { $queryRaw: async strings => {
    assert.equal(strings.join(''), 'SELECT 1'); queried = true; return [{ '1': 1 }];
  } });
  const response = await fetch(`${url}/api/v1/ready`, { headers: { 'X-Readiness-Key': env.READINESS_SECRET } });
  assert.equal(response.status, 200);
  assert.equal(queried, true);
  assert.deepEqual(await response.json(), { data: { status: 'ready' } });
});

test('JSON parser errors and body limits stay sanitized', async t => {
  const url = await serve(t);
  for (const [body, status, code] of [['{"password":"hidden",', 400, 'MALFORMED_JSON'], [JSON.stringify({ text: 'a'.repeat(1024 * 1024) }), 413, 'BODY_TOO_LARGE']]) {
    const response = await fetch(`${url}/api/v1/missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    const data = await response.json();
    assert.equal(data.error.code, code);
    assert.ok(!JSON.stringify(data).includes('hidden'));
  }
});

test('ID parser preserves unsigned bigint boundaries and rejects unsafe input', () => {
  assert.equal(parseId('18446744073709551615'), 18446744073709551615n);
  assert.equal(parseId(42), 42n);
  for (const value of [0, -1, 1.5, 9007199254740992, '', '0', '+1', '-1', '1.0', ' 1', '18446744073709551616', {}, null, true]) {
    assert.throws(() => parseId(value), { status: 422 });
  }
});

test('wire conversion preserves IDs, dates, arrays and null without global patch', () => {
  assert.deepEqual(toWire({ id: 9007199254740993n, date: new Date('2026-11-10T00:00:00Z'), items: [1n, null] }), {
    id: '9007199254740993', date: '2026-11-10T00:00:00.000Z', items: ['1', null],
  });
  assert.equal(BigInt.prototype.toJSON, undefined);
});

test('pagination validates bounds, sort allowlist and stable ID tie-break', () => {
  assert.deepEqual(parsePage({}, ['created_at']), { page: 1, limit: 20, skip: 0, orderBy: [{ id: 'asc' }] });
  assert.deepEqual(parsePage({ page: '2', limit: '100', sort_by: 'created_at', sort_order: 'desc' }, ['created_at']), {
    page: 2, limit: 100, skip: 100, orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
  for (const query of [{ page: '0' }, { page: '1.5' }, { limit: '101' }, { limit: '0' }, { page: '9007199254740991', limit: '100' }, { sort_by: '__proto__' }, { sort_order: 'DESC' }, { page: ['1', '2'] }]) {
    assert.throws(() => parsePage(query, ['created_at']), { status: 422 });
  }
});

test('production rejects blank, control-character and header-unsafe secrets', () => {
  const production = { ...env, NODE_ENV: 'production', ALLOWED_ORIGIN: 'https://cafe.example' };
  for (const name of ['CSRF_KEY', 'READINESS_SECRET']) {
    for (const value of [' '.repeat(32), 'x'.repeat(32) + '\n', '\t' + 'x'.repeat(32), 'x'.repeat(32) + '\0']) {
      assert.throws(() => loadConfig({ ...production, [name]: value }), { message: `Invalid or missing ${name}` });
    }
  }
  for (const value of [' ' + 'x'.repeat(32), 'x'.repeat(32) + ' ', '秘密'.repeat(16)]) {
    assert.throws(() => loadConfig({ ...production, READINESS_SECRET: value }));
  }
  assert.equal(loadConfig(production).readinessSecret, production.READINESS_SECRET);
});

test('configuration rejects unsafe production settings without exposing credentials', () => {
  assert.equal(loadConfig(env).port, 3000);
  assert.equal(loadConfig(env).cookieSecure, true);
  assert.equal(loadConfig({ ...env, ALLOW_INSECURE_COOKIE: 'true' }).cookieSecure, false);
  for (const changes of [
    { DATABASE_URL: undefined }, { DATABASE_URL: 'mysql://u:private@host/db?ssl=false' },
    { DATABASE_URL: 'http://u:private@host/db' }, { PORT: '1.5' }, { PORT: '65536' },
    { CSRF_KEY: 'short' }, { READINESS_SECRET: '' }, { ALLOWED_ORIGIN: '*' },
    { ALLOWED_ORIGIN: 'https://user:secret@host' }, { ALLOWED_ORIGIN: 'https://host/path' },
    { NODE_ENV: 'production', ALLOW_INSECURE_COOKIE: 'true' },
    { NODE_ENV: 'production', ALLOWED_ORIGIN: 'http://host' }, { TRUST_PROXY: 'true' },
  ]) {
    assert.throws(() => loadConfig({ ...env, ...changes }), error => !error.message.includes('private') && !error.message.includes('mysql://'));
  }
});
