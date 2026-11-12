export const receiptForPayment=(tx,payment_id)=>tx.receipts.findUnique({where:{payment_id}});
export const insertReceipt=(tx,data)=>tx.receipts.create({data});
export const receiptSettings=tx=>tx.cafe_settings.findUnique({where:{id:1}});
export const ownerForReceipt=(tx,id)=>tx.users.findUnique({where:{id},select:{full_name:true}});
