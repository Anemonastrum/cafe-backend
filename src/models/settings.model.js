export const readSettings = db => db.cafe_settings.findUnique({ where: { id: 1 } });
export const writeSettings = (tx, data) => tx.cafe_settings.update({ where: { id: 1 }, data });
export const readTax = (tx, id) => tx.taxes.findUnique({ where: { id } });
