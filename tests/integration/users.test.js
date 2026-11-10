import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';

test('p03-t1 acceptance: employee CRUD, filters, role/CSRF guards, revocation and audit', async () => withDatabase(async db => {
  const f = await fixture(db), config = testConfig(), h = await startApp({ db, config });
  const created = [];
  try {
    const admin = await loginAs(h, f.adminA.username, f.password), cashier = await loginAs(h, f.cashierA.username, f.password);
    const api = (path, method = 'GET', body, session = admin) => request(h, { path, method, body, ...session, headers: { Origin: config.allowedOrigin } });
    const input = { full_name: 'Test employee', username: `created-${randomUUID()}`, email: null, password: f.password, role: 'cashier', is_active: true };
    const routes = [['/admin/users','GET'],['/admin/users','POST'],[`/admin/users/${f.cashierA.id}`,'GET'],[`/admin/users/${f.cashierA.id}`,'PATCH'],[`/admin/users/${f.cashierA.id}/status`,'PATCH'],[`/admin/users/${f.cashierA.id}/reset-password`,'POST']];
    for (const [path, method] of routes) {
      assert.equal((await api(path, method, method === 'GET' ? undefined : {}, {})).status, 401);
      assert.equal((await api(path, method, method === 'GET' ? undefined : {}, cashier)).status, 403);
      if (method !== 'GET') assert.equal((await api(path, method, {}, { cookie: admin.cookie })).status, 403);
    }
    assert.equal((await api(`/admin/users/${f.adminA.id}`, 'PATCH', { role: 'cashier' })).status, 409);
    assert.equal((await api(`/admin/users/${f.adminA.id}/status`, 'PATCH', { is_active: false })).status, 409);
    for (const bad of [{ email: 'bad' }, { role: 'owner' }, { is_active: 'false' }, { unknown: 1 }, { password: 'short' }]) {
      assert.equal((await api('/admin/users', 'POST', { ...input, ...bad })).status, 422);
    }
    const added = await api('/admin/users', 'POST', input); assert.equal(added.status, 201); created.push(BigInt(added.body.data.id));
    assert.equal(added.body.data.email, null); assert.equal('password_hash' in added.body.data, false);
    assert.equal((await api('/admin/users', 'POST', { ...input, username: input.username.toUpperCase() })).status, 409);
    const id = added.body.data.id;
    assert.equal((await api(`/admin/users/${id}`)).body.data.username, input.username);
    assert.equal((await api(`/admin/users/${id}`, 'PATCH', { full_name: 'Edited', email: 'employee@example.test' })).status, 200);
    assert.equal((await api(`/admin/users/${id}`, 'PATCH', { email: null })).body.data.email, null);
    const filtered = await api(`/admin/users?role=cashier&is_active=true&search=${input.username}&page=1&limit=1&sort_by=username&sort_order=desc`);
    assert.equal(filtered.status, 200); assert.equal(filtered.body.meta.total, 1); assert.equal(filtered.body.data[0].id, id);
    for (const query of ['role=owner','is_active=1','sort_by=password_hash','search[x]=y','extra=1','page=0']) assert.equal((await api('/admin/users?' + query)).status, 422);
    assert.equal((await api('/admin/users/0')).status, 422); assert.equal((await api('/admin/users/18446744073709551615')).status, 404);
    assert.equal((await api(`/admin/users/${f.cashierA.id}/status`, 'PATCH', { is_active: false })).status, 200);
    assert.equal((await request(h, { path: '/auth/me', cookie: cashier.cookie })).status, 401);
    assert.equal(await db.auth_sessions.count({ where: { user_id: f.cashierA.id, revoked_at: null } }), 0);
    const other = await loginAs(h, f.cashierB.username, f.password);
    assert.equal((await api(`/admin/users/${f.cashierB.id}/reset-password`, 'POST', { password: 'Reset password 42!' })).status, 200);
    assert.equal((await request(h, { path: '/auth/me', cookie: other.cookie })).status, 401);
    await loginAs(h, f.cashierB.username, 'Reset password 42!');
    const audit = await db.audit_logs.findMany({ where: { user_id: f.adminA.id } });
    assert.ok(audit.some(x => x.action === 'users.reset_password'));
    const text = JSON.stringify(audit, (_, v) => typeof v === 'bigint' ? String(v) : v);
    for (const secret of [f.password, 'Reset password 42!', f.adminA.password_hash]) assert.equal(text.includes(secret), false);
  } finally {
    await db.auth_sessions.deleteMany({ where: { user_id: { in: created } } });
    await db.users.deleteMany({ where: { id: { in: created } } });
    await h.close(); await f.cleanup();
  }
}));
