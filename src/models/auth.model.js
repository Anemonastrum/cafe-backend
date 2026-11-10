export const userById = (db, id) => db.users.findUnique({ where: { id } });
export const findUser = (db, username) => db.users.findUnique({ where: { username } });
export const findSession = (db, token_hash) => db.auth_sessions.findUnique({ where: { token_hash }, include: { fk_sessions_user: true } });
export async function lockUser(tx, id) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  return tx.users.findUnique({ where: { id } });
}
export async function lockSession(tx, id) {
  await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${id} FOR UPDATE`;
  return tx.auth_sessions.findUnique({ where: { id } });
}
export const createSession = (tx, data) => tx.auth_sessions.create({ data });
export const updateSession = (tx, id, data) => tx.auth_sessions.update({ where: { id }, data });
export const revokeSessions = (tx, user_id, except) => tx.auth_sessions.updateMany({
  where: { user_id, revoked_at: null, ...(except ? { id: { not: except } } : {}) }, data: { revoked_at: new Date() },
});
export const updateUser = (tx, id, data) => tx.users.update({ where: { id }, data });
