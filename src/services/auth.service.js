import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockCafe } from '../models/lock.model.js';
import * as model from '../models/auth.model.js';
import { appendAudit } from './audit.service.js';
export const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Invalid credentials or expired session');
export const sessionDigest = secret => createHash('sha256').update(secret).digest('hex');
export const csrfFor = (secret, key) => createHmac('sha256', key).update(secret).digest('base64url');
export const safeUser = user => ({ id: user.id, full_name: user.full_name, username: user.username, email: user.email, role: user.role });
const dummyHash = `scrypt$v1$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
const newSecret = () => randomBytes(32).toString('base64url');
export async function login(db, { username, password }, context) {
  const candidate = await model.findUser(db, username);
  const matches = await verifyPassword(password, candidate?.password_hash ?? dummyHash);
  if (!matches || !candidate?.is_active) throw unauthorized();
  const secret = newSecret();
  return withWriteTx(db, async tx => {
    await lockCafe(tx);
    const user = await model.lockUser(tx, candidate.id);
    if (!user?.is_active || user.password_hash !== candidate.password_hash) throw unauthorized();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const session = await model.createSession(tx, { id: randomUUID(), user_id: user.id,
      token_hash: sessionDigest(secret), expires_at: expiresAt, ip_address: context.ip ?? null });
    await model.updateUser(tx, user.id, { last_login_at: new Date() });
    await appendAudit(tx, { actor: user, action: 'auth.login', entityType: 'auth_sessions', entityId: session.id, context });
    return { secret, expiresAt, user: safeUser(user) };
  });
}
export async function lockedActor(tx, actor) {
  await lockCafe(tx);
  const user = await model.lockUser(tx, actor.id);
  const session = await model.lockSession(tx, actor.sessionId);
  if (!user?.is_active || !session || session.user_id !== user.id || session.revoked_at
      || session.expires_at <= new Date() || session.token_hash !== actor.tokenHash) throw unauthorized();
  return { user, session };
}
export async function logout(db, actor, context) {
  return withWriteTx(db, async tx => {
    const { session } = await lockedActor(tx, actor);
    await model.updateSession(tx, session.id, { revoked_at: new Date() });
    await appendAudit(tx, { actor, action: 'auth.logout', entityType: 'auth_sessions', entityId: session.id, context });
  });
}
export async function logoutAll(db, actor, context) {
  return withWriteTx(db, async tx => {
    await lockedActor(tx, actor);
    await model.revokeSessions(tx, actor.id);
    await appendAudit(tx, { actor, action: 'auth.logout_all', entityType: 'users', entityId: actor.id, context });
  });
}
export async function changePassword(db, actor, { current_password, new_password }, context) {
  const candidate = await model.userById(db, actor.id);
  if (!candidate?.is_active || !await verifyPassword(current_password, candidate.password_hash)) throw unauthorized();
  const password_hash = await hashPassword(new_password);
  return withWriteTx(db, async tx => {
    const { user, session } = await lockedActor(tx, actor);
    if (user.password_hash !== candidate.password_hash) throw unauthorized();
    await model.updateUser(tx, user.id, { password_hash });
    await model.revokeSessions(tx, user.id, session.id);
    await appendAudit(tx, { actor, action: 'auth.password_change', entityType: 'users', entityId: user.id, context });
    return safeUser(user);
  });
}
export async function rotateSession(db, actor, context) {
  const secret = newSecret();
  return withWriteTx(db, async tx => {
    const { user, session } = await lockedActor(tx, actor);
    await model.updateSession(tx, session.id, { token_hash: sessionDigest(secret) });
    await appendAudit(tx, { actor, action: 'auth.refresh', entityType: 'auth_sessions', entityId: session.id, context });
    return { secret, expiresAt: session.expires_at, user: safeUser(user) };
  });
}
