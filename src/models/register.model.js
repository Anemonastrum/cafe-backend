export const registerById=(db,id)=>db.cash_registers.findUnique({where:{id}});
export async function lockRegister(tx,id){await tx.$queryRaw`SELECT id FROM cash_registers WHERE id=${id} FOR UPDATE`;return registerById(tx,id);}
export async function registerRows(db,actor,q){const where=actor.role==='admin'&&q.include_inactive?{}:{is_active:true};return db.$transaction(async tx=>({data:await tx.cash_registers.findMany({where,orderBy:q.orderBy,skip:q.skip,take:q.limit}),total:await tx.cash_registers.count({where})}),{isolationLevel:'RepeatableRead'});}
export const createRegisterRow=(tx,data)=>tx.cash_registers.create({data});
export const updateRegisterRow=(tx,id,data)=>tx.cash_registers.update({where:{id},data});
