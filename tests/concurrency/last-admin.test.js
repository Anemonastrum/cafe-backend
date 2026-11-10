import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, loginAs } from '../support/http.js';
import { sessionDigest } from '../../src/services/auth.service.js';
import { setUserStatus } from '../../src/services/users.service.js';
import { lockCafe } from '../../src/models/lock.model.js';

test('two stale admins cannot deactivate each other past last active admin', async () => withDatabase(async db => {
  const f = await fixture(db), h = await startApp({ db, config: testConfig() });
  try {
    const actors = [];
    for (const user of [f.adminA, f.adminB]) {
      const login = await loginAs(h, user.username, f.password), tokenHash = sessionDigest(login.cookie.split('=')[1]);
      const session = await db.auth_sessions.findUnique({ where: { token_hash: tokenHash } });
      actors.push({ id: user.id, role: 'admin', sessionId: session.id, tokenHash });
    }
    // Both operations start behind held singleton, using already-authenticated actors.
    let unlock, acquired;
    const gate = new Promise(r => { unlock = r; }), ready = new Promise(r => { acquired = r; });
    const blocker = db.$transaction(async tx => { await lockCafe(tx); acquired(); await gate; });
    await ready;
    const calls = actors.map((actor, i) => setUserStatus(db, actor, { id: actors[1-i].id, is_active: false }, {}));
    const resultsPromise = Promise.allSettled(calls);
    unlock(); await blocker;
    const results = await resultsPromise;
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.status, 401);
    assert.equal(await db.users.count({ where: { id: { in: actors.map(a => a.id) }, role: 'admin', is_active: true } }), 1);
    const inactive = await db.users.findFirst({ where: { id: { in: actors.map(a => a.id) }, is_active: false } });
    assert.equal(await db.auth_sessions.count({ where: { user_id: inactive.id, revoked_at: null } }), 0);
  } finally { await h.close(); await f.cleanup(); }
}));
