export const paymentByKey=(tx,key)=>tx.payments.findUnique({where:{idempotency_key:key}});
export const paymentById=(tx,id)=>tx.payments.findUnique({where:{id}});
export async function lockPayment(tx,id){await tx.$queryRaw`SELECT id FROM payments WHERE id=${id} FOR UPDATE`;return paymentById(tx,id);}
export const insertPayment=(tx,data)=>tx.payments.create({data});
export const updatePayment=(tx,id,data)=>tx.payments.update({where:{id},data});
export const methodByCode=(tx,code)=>tx.payment_methods.findUnique({where:{code}});
export const paidAttempt=(tx,order_id)=>tx.payments.findFirst({where:{order_id,status:'paid'}});
export const insertEvent=(tx,data)=>tx.payment_events.create({data});

export function paymentWhere(q){return{...(q.orderId?{order_id:q.orderId}:{}),...(q.status?{status:q.status}:{}),...(q.payment_method_id?{payment_method_id:q.payment_method_id}:{}),...(q.cashier_id?{processed_by_user_id:q.cashier_id}:{}),...(q.search?{payment_reference:{contains:q.search}}:{}),...(q.from||q.to?{created_at:{...(q.from?{gte:q.from}:{}),...(q.to?{lt:q.to}:{})}}:{})};}
export async function paymentRows(db,q){const where=paymentWhere(q);return db.$transaction(async tx=>({data:await tx.payments.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await tx.payments.count({where})}),{isolationLevel:'RepeatableRead'});}
export async function eventRows(db,id,q){const where={payment_id:id};return db.$transaction(async tx=>({data:await tx.payment_events.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await tx.payment_events.count({where})}),{isolationLevel:'RepeatableRead'});}
