export const paymentByKey=(tx,key)=>tx.payments.findUnique({where:{idempotency_key:key}});
export const paymentById=(tx,id)=>tx.payments.findUnique({where:{id}});
export async function lockPayment(tx,id){await tx.$queryRaw`SELECT id FROM payments WHERE id=${id} FOR UPDATE`;return paymentById(tx,id);}
export const insertPayment=(tx,data)=>tx.payments.create({data});
export const updatePayment=(tx,id,data)=>tx.payments.update({where:{id},data});
export const methodByCode=(tx,code)=>tx.payment_methods.findUnique({where:{code}});
export const paidAttempt=(tx,order_id)=>tx.payments.findFirst({where:{order_id,status:'paid'}});
export const insertEvent=(tx,data)=>tx.payment_events.create({data});
