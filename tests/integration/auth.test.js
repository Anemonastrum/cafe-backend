import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request } from '../support/http.js';
const credentials = response => ({ cookie: response.headers.get('set-cookie')?.split(';')[0], csrf: response.body.data.csrf_token });

test('p02-t1 acceptance: login, live identity, reload CSRF and single-use rotation', async () => withDatabase(async db => {
  const f = await fixture(db); const config = testConfig(); const h = await startApp({ db, config });
  try {
    const login = (body, headers = { Origin: config.allowedOrigin }) => request(h, { method: 'POST', path: '/auth/login', body, headers });
    const body = { username: f.cashierA.username, password: f.password };
    assert.equal((await request(h, { path: '/auth/me' })).status, 401);
    assert.equal((await login(body, {})).status, 403);
    assert.equal((await login(body, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await login({ ...body, role: 'admin' })).status, 422);
    assert.equal((await login({ ...body, password: 'wrong' })).status, 401);
    const signed = await login(body); assert.equal(signed.status, 200);
    const session = credentials(signed);
    assert.match(signed.headers.get('set-cookie'), /HttpOnly/); assert.match(signed.headers.get('set-cookie'), /SameSite=Lax/);
    assert.equal(signed.body.data.user.role, 'cashier');
    assert.equal(JSON.stringify(signed.body).includes(f.cashierA.password_hash), false);
    const secret = session.cookie.split('=')[1]; assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(JSON.stringify(signed.body).includes(secret), false);
    const stored = await db.auth_sessions.findFirst({ where: { user_id: f.cashierA.id } });
    assert.equal(stored.token_hash, createHash('sha256').update(secret).digest('hex'));
    assert.equal(stored.token_hash.length, 64);
    const me = await request(h, { path: '/auth/me', cookie: session.cookie });
    assert.equal(me.status, 200); assert.equal(me.body.data.role, 'cashier'); assert.equal(me.body.data.csrf_token, session.csrf);
    assert.equal((await db.auth_sessions.findUnique({ where: { id: stored.id } })).token_hash, stored.token_hash);
    const refresh = extra => request(h, { method: 'POST', path: '/auth/refresh', body: {}, ...session, headers: { Origin: config.allowedOrigin }, ...extra });
    assert.equal((await refresh({ csrf: '' })).status, 403);
    assert.equal((await refresh({ headers: { Origin: 'https://evil.example' } })).status, 403);
    const race = await Promise.all([refresh(), refresh()]);
    assert.deepEqual(race.map(r => r.status).sort(), [200, 401]);
    const rotated = credentials(race.find(r => r.status === 200));
    assert.notEqual(rotated.csrf, session.csrf);
    assert.equal((await request(h, { path: '/auth/me', cookie: session.cookie })).status, 401);
    assert.equal((await db.auth_sessions.findUnique({ where: { id: stored.id } })).expires_at.getTime(), stored.expires_at.getTime());
    await db.users.update({ where: { id: f.cashierA.id }, data: { role: 'admin' } });
    assert.equal((await request(h, { path: '/auth/me', cookie: rotated.cookie })).body.data.role, 'admin');
    await db.users.update({ where: { id: f.cashierA.id }, data: { is_active: false } });
    assert.equal((await request(h, { path: '/auth/me', cookie: rotated.cookie })).status, 401);
    assert.equal((await login(body)).status, 401);
    await db.users.update({ where: { id: f.cashierA.id }, data: { is_active: true } });
    await db.auth_sessions.update({ where: { id: stored.id }, data: { expires_at: new Date(0) } });
    assert.equal((await request(h, { path: '/auth/me', cookie: rotated.cookie })).status, 401);
    const audit = JSON.stringify(await db.audit_logs.findMany({ where: { user_id: f.cashierA.id } }), (_, v) => typeof v === 'bigint' ? String(v) : v);
    assert.ok(audit.includes('auth.login')); assert.ok(audit.includes('auth.refresh'));
    for (const value of [secret, f.password, f.cashierA.password_hash]) assert.equal(audit.includes(value), false);
  } finally { await h.close(); await f.cleanup(); }
}));

test('username throttle binds DB collation aliases across separate client IPs', async () => withDatabase(async db => {
  const f = await fixture(db); const config = { ...testConfig(), trustProxy: 'loopback' }; const h = await startApp({ db, config });
  try {
    for (let i = 0; i < 6; i++) {
      const r = await request(h, { method: 'POST', path: '/auth/login',
        headers: { Origin: config.allowedOrigin, 'X-Forwarded-For': `192.0.2.${i + 1}` },
        body: { username: i % 2 ? f.cashierA.username.toUpperCase() : f.cashierA.username, password: 'wrong' } });
      assert.equal(r.status, i === 5 ? 429 : 401);
    }
  } finally { await h.close(); await f.cleanup(); }
}));

test('production cookies and exact-origin credentialed CORS', async () => withDatabase(async db => {
  const f = await fixture(db); const config = { ...testConfig(), mode: 'production', cookieSecure: true, allowedOrigin: 'https://cafe.example' };
  const h = await startApp({ db, config });
  try {
    const preflight = await request(h, { method: 'OPTIONS', path: '/auth/login', headers: { Origin: config.allowedOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), config.allowedOrigin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    const denied = await request(h, { method: 'OPTIONS', path: '/auth/login', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const login = await request(h, { method: 'POST', path: '/auth/login', body: { username: f.adminA.username, password: f.password }, headers: { Origin: config.allowedOrigin } });
    assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /; Secure/);
    assert.match(login.headers.get('set-cookie'), /Max-Age=28[0-9]{3}/);
  } finally { await h.close(); await f.cleanup(); }
}));

test('login failures throttle IP; auth has general limit', async () => withDatabase(async db => {
  const f = await fixture(db); const config = testConfig(); const h = await startApp({ db, config });
  try {
    for (let i = 0; i < 5; i++) {
      const r = await request(h, { method: 'POST', path: '/auth/login', headers: { Origin: config.allowedOrigin }, body: { username: `missing-${i}`, password: 'wrong' } });
      assert.equal(r.status, 401);
    }
    const blocked = await request(h, { method: 'POST', path: '/auth/login', headers: { Origin: config.allowedOrigin }, body: { username: f.cashierA.username.toUpperCase(), password: f.password } });
    assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
    let last;
    for (let i = 0; i < 31; i++) last = await request(h, { path: '/auth/me' });
    assert.equal(last.status, 429);
  } finally { await h.close(); await f.cleanup(); }
}));
