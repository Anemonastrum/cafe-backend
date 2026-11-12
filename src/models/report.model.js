import { Prisma } from '@prisma/client';
export const employeeExists=(tx,id)=>tx.users.findUnique({where:{id},select:{id:true}});
export const inRange=range=>({gte:range.from,lt:range.to});
export async function employeeRows(tx,id,q,kind){const table=kind==='orders'?tx.orders:tx.cashier_shifts,where={cashier_id:id,[kind==='orders'?'created_at':'opened_at']:inRange(q.range),...(q.status?{status:q.status}:{}),...(q.payment_status?{payment_status:q.payment_status}:{})};return{data:await table.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await table.count({where})};}
export async function ownerSales(tx,id,range){const [row]=await tx.$queryRaw(Prisma.sql`SELECT COUNT(DISTINCT o.id) AS transaction_count, COALESCE(SUM(p.amount),0) AS paid_sales_total FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='paid' AND o.cashier_id=${id} AND p.paid_at>=${range.from} AND p.paid_at<${range.to}`);return row;}
