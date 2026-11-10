import { AppError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { revokeSessions } from '../models/auth.model.js';
import { appendAudit } from './audit.service.js';
import * as model from '../models/users.model.js';
const requireAdmin = actor => { if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Forbidden'); };
const conflict = () => new AppError(409, 'USER_CONFLICT', 'Employee change conflicts with current state');
export async function listUsers(db, actor, query) {
  requireAdmin(actor); const { data, total } = await model.listUserRows(db, query);
  return { data, meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) } };
}
export async function getUser(db, actor, id) {
  requireAdmin(actor); const user = await model.getUserRow(db, id);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Not found'); return user;
}
async function mutate(db, actor, id, action, data, context) {
  requireAdmin(actor);
  try {
    return await withWriteTx(db, async tx => {
      const { user: currentActor } = await lockedActor(tx, actor, id ? [id] : []);
      requireAdmin(currentActor);
      const before = id ? await model.getUserRow(tx, id) : null;
      if (id && !before) throw new AppError(404, 'NOT_FOUND', 'Not found');
      if (before && (data.role === 'cashier' || data.is_active === false)) {
        if (id === actor.id) throw conflict();
        if (before.role === 'admin' && before.is_active && await model.activeAdmins(tx) <= 1) throw conflict();
      }
      const after = id ? await model.updateUserRow(tx, id, data) : await model.createUserRow(tx, data);
      if (id && (data.is_active === false || data.password_hash)) await revokeSessions(tx, id);
      await appendAudit(tx, { actor: currentActor, action, entityType: 'users', entityId: after.id, before, after, context });
      return after;
    });
  } catch (error) { if (error.code === 'P2002') throw conflict(); throw error; }
}
export async function createUser(db, actor, input, context) {
  requireAdmin(actor); const { password, ...data } = input;
  return mutate(db, actor, null, 'users.create', { ...data, password_hash: await hashPassword(password) }, context);
}
export const updateUser = (db, actor, { id, patch }, context) => mutate(db, actor, id, 'users.update', patch, context);
export const setUserStatus = (db, actor, { id, is_active }, context) => mutate(db, actor, id, 'users.status', { is_active }, context);
export async function resetUserPassword(db, actor, { id, password }, context) {
  requireAdmin(actor);
  return mutate(db, actor, id, 'users.reset_password', { password_hash: await hashPassword(password) }, context);
}
