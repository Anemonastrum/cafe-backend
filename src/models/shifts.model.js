export const ownOpenShift=(db,cashier_id)=>db.cashier_shifts.findFirst({where:{cashier_id,status:'open'},orderBy:{id:'asc'}});
export const registerOpenShift=(db,cash_register_id)=>db.cashier_shifts.findFirst({where:{cash_register_id,status:'open'}});
export const shiftById=(db,id)=>db.cashier_shifts.findUnique({where:{id}});
export async function lockShift(tx,id){await tx.$queryRaw`SELECT id FROM cashier_shifts WHERE id=${id} FOR UPDATE`;return shiftById(tx,id);}
export const createShift=(tx,data)=>tx.cashier_shifts.create({data});
export const closeShiftRow=(tx,id,data)=>tx.cashier_shifts.update({where:{id},data});
export async function hasUnresolvedWork(tx,id){
 await tx.$queryRaw`SELECT o.id FROM orders o WHERE o.shift_id=${id} OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.shift_id=${id}) ORDER BY o.id FOR UPDATE`;
 await tx.$queryRaw`SELECT p.id FROM payments p WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id=p.order_id AND (o.shift_id=${id} OR EXISTS (SELECT 1 FROM payments related WHERE related.order_id=o.id AND related.shift_id=${id}))) ORDER BY p.id FOR UPDATE`;
 return Boolean(await tx.orders.findFirst({where:{reconciliation_hold:true,OR:[{shift_id:id},{fk_payments_order_back:{some:{shift_id:id}}}]}})||await tx.orders.findFirst({where:{shift_id:id,status:{not:'cancelled'},payment_status:{not:'paid'}}})||await tx.payments.findFirst({where:{shift_id:id,status:'pending'}}));
}
export const shiftDetail=(db,id)=>db.cashier_shifts.findUnique({where:{id},include:{fk_shifts_cashier:{select:{id:true,full_name:true,username:true}},fk_shifts_register:true}});
export async function shiftRows(db,actor,q){
 const where={...(actor.role==='cashier'||q.mine?{cashier_id:actor.id}:q.cashier_id?{cashier_id:q.cashier_id}:{}),...(q.cash_register_id?{cash_register_id:q.cash_register_id}:{}),...(q.status?{status:q.status}:{}),...(q.from||q.to?{opened_at:{...(q.from?{gte:q.from}:{}),...(q.to?{lt:q.to}:{})}}:{})};
 return db.$transaction(async tx=>({data:await tx.cashier_shifts.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await tx.cashier_shifts.count({where})}),{isolationLevel:'RepeatableRead'});
}
export async function shiftOrderRows(tx,id,q){const where={shift_id:id};return{data:await tx.orders.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await tx.orders.count({where})};}
export async function shiftSales(tx,id){
 const groups=await tx.payments.groupBy({by:['payment_method_id'],where:{shift_id:id,status:'paid'},_sum:{amount:true},_count:{_all:true}});
 const methods=await tx.payment_methods.findMany({where:{id:{in:groups.map(g=>g.payment_method_id)}},select:{id:true,name:true,code:true}});
 return groups.map(g=>({payment_method_id:g.payment_method_id,...methods.find(m=>m.id===g.payment_method_id),transaction_count:g._count._all,amount:g._sum.amount}));
}
