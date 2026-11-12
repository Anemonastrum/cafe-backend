export const receiptForPayment=(tx,payment_id)=>tx.receipts.findUnique({where:{payment_id}});
export const insertReceipt=(tx,data)=>tx.receipts.create({data});
export const receiptSettings=tx=>tx.cafe_settings.findUnique({where:{id:1}});
export const ownerForReceipt=(tx,id)=>tx.users.findUnique({where:{id},select:{full_name:true}});

export const receiptById=(db,id)=>db.receipts.findUnique({where:{id},include:{fk_receipts_payment:true}});
export const paidPaymentForOrder=(db,order_id)=>db.payments.findFirst({where:{order_id,status:'paid'}});
export const insertReceiptEvent=(tx,data)=>tx.receipt_events.create({data});
export async function receiptEventRows(db,id,q){const where={receipt_id:id};return db.$transaction(async tx=>({data:await tx.receipt_events.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await tx.receipt_events.count({where})}),{isolationLevel:'RepeatableRead'});}
