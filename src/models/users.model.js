export const userSelect = { id: true, full_name: true, username: true, email: true, role: true,
  is_active: true, last_login_at: true, created_at: true, updated_at: true };
export const getUserRow = (db, id) => db.users.findUnique({ where: { id }, select: userSelect });
export async function listUserRows(db, query) {
  const where = { ...(query.role === undefined ? {} : { role: query.role }),
    ...(query.is_active === undefined ? {} : { is_active: query.is_active }),
    ...(query.search ? { OR: ['username','full_name','email'].map(k => ({ [k]: { contains: query.search } })) } : {}) };
  return db.$transaction(async tx => ({ data: await tx.users.findMany({ where, select: userSelect,
    skip: query.skip, take: query.limit, orderBy: query.orderBy }), total: await tx.users.count({ where }) }), { isolationLevel: 'RepeatableRead' });
}
export const createUserRow = (tx, data) => tx.users.create({ data, select: userSelect });
export const updateUserRow = (tx, id, data) => tx.users.update({ where: { id }, data, select: userSelect });
export const activeAdmins = tx => tx.users.count({ where: { role: 'admin', is_active: true } });
