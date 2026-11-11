export const ownOpenShift=(db,cashier_id)=>db.cashier_shifts.findFirst({where:{cashier_id,status:'open'},orderBy:{id:'asc'}});
export const registerOpenShift=(db,cash_register_id)=>db.cashier_shifts.findFirst({where:{cash_register_id,status:'open'}});
export const shiftById=(db,id)=>db.cashier_shifts.findUnique({where:{id}});
export async function lockShift(tx,id){await tx.$queryRaw`SELECT id FROM cashier_shifts WHERE id=${id} FOR UPDATE`;return shiftById(tx,id);}
export const createShift=(tx,data)=>tx.cashier_shifts.create({data});
