import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';

test('p02-t2 acceptance: password change revokes others, logout and logout-all revoke current', async () => withDatabase(async db => {
  const f = await fixture(db); const config = testConfig(); const h = await startApp({ db, config });
  try {
    const a = await loginAs(h, f.cashierA.username, f.password), b = await loginAs(h, f.cashierA.username, f.password);
    const call = (path, body = {}, session = a, method = 'POST') => request(h, { path, method, body, ...session, headers: { Origin: config.allowedOrigin } });
    for (const path of ['/auth/logout', '/auth/logout-all', '/auth/me/password']) {
      const method = path.endsWith('password') ? 'PATCH' : 'POST';
      assert.equal((await call(path, {}, {}, method)).status, 401);
      assert.equal((await call(path, {}, { cookie: a.cookie }, method)).status, 403);
      assert.equal((await request(h, { path, method, body: {}, ...a, headers: { Origin: 'https://evil.example' } })).status, 403);
    }
    assert.equal((await call('/auth/me/password', { current_password: 'wrong', new_password: 'New password 42!' }, a, 'PATCH')).status, 401);
    assert.equal((await call('/auth/me/password', { current_password: f.password, new_password: 'short' }, a, 'PATCH')).status, 422);
    assert.equal((await call('/auth/me/password', { current_password: f.password, new_password: 'New password 42!' }, a, 'PATCH')).status, 200);
    assert.equal((await request(h, { path: '/auth/me', cookie: a.cookie })).status, 200);
    assert.equal((await request(h, { path: '/auth/me', cookie: b.cookie })).status, 401);
    const c = await loginAs(h, f.cashierA.username, 'New password 42!');
    const loggedOut = await call('/auth/logout'); assert.equal(loggedOut.status, 204); assert.equal(loggedOut.bytes.length, 0);
    assert.match(loggedOut.headers.get('set-cookie'), /cafe_session=;/);
    assert.equal((await request(h, { path: '/auth/me', cookie: a.cookie })).status, 401);
    const d = await loginAs(h, f.cashierA.username, 'New password 42!');
    assert.equal((await call('/auth/logout-all', {}, c)).status, 204);
    for (const session of [c, d]) assert.equal((await request(h, { path: '/auth/me', cookie: session.cookie })).status, 401);
    const logs = await db.audit_logs.findMany({ where: { user_id: f.cashierA.id } });
    assert.ok(logs.some(l => l.action === 'auth.password_change'));
    const text = JSON.stringify(logs, (_, v) => typeof v === 'bigint' ? String(v) : v);
    for (const secret of [f.password, 'New password 42!', a.cookie.split('=')[1]]) assert.equal(text.includes(secret), false);
    assert.equal(await db.auth_sessions.count({ where: { user_id: f.cashierA.id, revoked_at: null } }), 0);
    // Both allowed roles use same lifecycle.
    const admin = await loginAs(h, f.adminA.username, f.password);
    assert.equal((await call('/auth/logout', {}, admin)).status, 204);
  } finally { await h.close(); await f.cleanup(); }
}));
