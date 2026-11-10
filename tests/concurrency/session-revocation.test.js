import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';
import { lockCafe } from '../../src/models/lock.model.js';
import { rotateSession, sessionDigest } from '../../src/services/auth.service.js';
import { withWriteTx } from '../../src/utils/transaction.js';

test('refresh cannot resurrect session after logout-all in either concurrent ordering', async () => withDatabase(async db => {
  const f = await fixture(db), config = testConfig(), h = await startApp({ db, config });
  try {
    const a = await loginAs(h, f.cashierA.username, f.password), b = await loginAs(h, f.cashierA.username, f.password);
    const call = (path, session) => request(h, { method: 'POST', path, body: {}, ...session, headers: { Origin: config.allowedOrigin } });
    const [refresh, logout] = await Promise.all([call('/auth/refresh', b), call('/auth/logout-all', a)]);
    assert.equal(logout.status, 204); assert.ok([200, 401].includes(refresh.status));
    const cookie = refresh.status === 200 ? refresh.headers.get('set-cookie').split(';')[0] : b.cookie;
    assert.equal((await request(h, { path: '/auth/me', cookie })).status, 401);
    assert.equal(await db.auth_sessions.count({ where: { user_id: f.cashierA.id, revoked_at: null } }), 0);
  } finally { await h.close(); await f.cleanup(); }
}));

test('stale authenticated actor rechecks deactivation after waiting on mutation lock', async () => withDatabase(async db => {
  const f = await fixture(db), config = testConfig(), h = await startApp({ db, config });
  try {
    const login = await loginAs(h, f.cashierA.username, f.password);
    const tokenHash = sessionDigest(login.cookie.split('=')[1]);
    const session = await db.auth_sessions.findUnique({ where: { token_hash: tokenHash } });
    const actor = { id: f.cashierA.id, role: 'cashier', sessionId: session.id, tokenHash };
    let release, locked;
    const gate = new Promise(r => { release = r; }), acquired = new Promise(r => { locked = r; });
    const disable = withWriteTx(db, async tx => {
      await lockCafe(tx); await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`;
      await tx.users.update({ where: { id: actor.id }, data: { is_active: false } });
      locked(); await gate;
    });
    await acquired;
    const rotation = rotateSession(db, actor, {});
    const rejected = assert.rejects(rotation, { status: 401 });
    release(); await disable; await rejected;
    assert.equal((await db.auth_sessions.findUnique({ where: { id: session.id } })).token_hash, tokenHash);
  } finally { await h.close(); await f.cleanup(); }
}));
