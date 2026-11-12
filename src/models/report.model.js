import { Prisma } from '@prisma/client';
export const employeeExists=(tx,id)=>tx.users.findUnique({where:{id},select:{id:true}});
export const inRange=range=>({gte:range.from,lt:range.to});
export async function employeeRows(tx,id,q,kind){const table=kind==='orders'?tx.orders:tx.cashier_shifts,where={cashier_id:id,[kind==='orders'?'created_at':'opened_at']:inRange(q.range),...(q.status?{status:q.status}:{}),...(q.payment_status?{payment_status:q.payment_status}:{})};return{data:await table.findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await table.count({where})};}
export async function ownerSales(tx,id,range){const [row]=await tx.$queryRaw(Prisma.sql`SELECT COUNT(DISTINCT o.id) AS transaction_count, COALESCE(SUM(p.amount),0) AS paid_sales_total FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='paid' AND o.cashier_id=${id} AND p.paid_at>=${range.from} AND p.paid_at<${range.to}`);return row;}

const paidRange=range=>Prisma.sql`p.status='paid' AND p.paid_at>=${range.from} AND p.paid_at<${range.to}`;
export async function reportRows(tx,{report,range,group_by='day',page,rank_by,paidOnly=false}){
 let query;
 if(report==='sales'){
  const local=Prisma.sql`DATE_ADD(p.paid_at,INTERVAL 7 HOUR)`,bucket=group_by==='week'?Prisma.sql`DATE_SUB(DATE(${local}),INTERVAL WEEKDAY(${local}) DAY)`:group_by==='month'?Prisma.sql`DATE_FORMAT(${local},'%Y-%m-01')`:Prisma.sql`DATE(${local})`;
  query=Prisma.sql`SELECT CAST(${bucket} AS CHAR) AS bucket, COUNT(DISTINCT o.id) AS count, SUM(o.subtotal) AS gross_sales, SUM(o.item_discount_total+o.order_discount_total) AS discounts, SUM(o.tax_total) AS tax, SUM(o.service_charge_total) AS service_charges, SUM(o.subtotal-o.item_discount_total-o.order_discount_total-COALESCE(it.inclusive_tax,0)) AS net_sales, SUM(p.amount) AS revenue FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN (SELECT order_id,SUM(tax_amount) AS inclusive_tax FROM order_taxes WHERE is_inclusive=TRUE GROUP BY order_id) it ON it.order_id=o.id WHERE ${paidRange(range)} GROUP BY bucket ORDER BY bucket`;
  return{data:await tx.$queryRaw(query)};
 }
 if(report==='payments')query=Prisma.sql`SELECT m.code,p.status,COUNT(*) AS count,SUM(p.amount) AS amount FROM payments p JOIN payment_methods m ON m.id=p.payment_method_id WHERE ((p.status='paid' AND p.paid_at>=${range.from} AND p.paid_at<${range.to}) OR (p.status<>'paid' AND p.created_at>=${range.from} AND p.created_at<${range.to})) GROUP BY m.code,p.status`;
 if(report==='products'||report==='categories'){
  const identity=report==='products'?Prisma.sql`i.product_id,i.product_name,i.category_name`:Prisma.sql`i.category_name`;
  query=Prisma.sql`SELECT ${identity},SUM(i.quantity) AS quantity,SUM(i.line_total) AS revenue FROM order_items i WHERE EXISTS (SELECT 1 FROM payments p WHERE p.order_id=i.order_id AND ${paidRange(range)}) GROUP BY ${identity}`;
 }
 if(report==='employees')query=Prisma.sql`SELECT o.cashier_id AS owner_id,COUNT(DISTINCT o.id) AS count,SUM(p.amount) AS revenue FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${paidRange(range)} GROUP BY o.cashier_id`;
 if(report==='orders')query=Prisma.sql`SELECT o.status,COUNT(*) AS count,SUM(o.is_held) AS held_count,SUM(o.payment_status<>'paid') AS unpaid_count FROM orders o WHERE o.created_at>=${range.from} AND o.created_at<${range.to} GROUP BY o.status`;
 if(report==='cancellations')query=Prisma.sql`SELECT id AS order_id,cancelled_at,cancel_reason AS reason,cancelled_by_user_id AS actor,cancel_approved_by_user_id AS approval FROM orders WHERE status='cancelled' AND cancelled_at>=${range.from} AND cancelled_at<${range.to}`;
 if(paidOnly)query=Prisma.sql`SELECT * FROM (${query}) paid_groups WHERE status='paid'`;
 const order=rank_by==='quantity'?Prisma.sql`quantity DESC,revenue DESC,product_id,product_name,category_name`:rank_by==='revenue'?Prisma.sql`revenue DESC,quantity DESC,product_id,product_name,category_name`:{payments:Prisma.sql`code,CAST(status AS CHAR)`,products:Prisma.sql`product_id,product_name,category_name`,categories:Prisma.sql`category_name`,employees:Prisma.sql`owner_id`,orders:Prisma.sql`status`,cancellations:Prisma.sql`cancelled_at,order_id`}[report];
 const [total]=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total FROM (${query}) grouped_report`);
 return{data:await tx.$queryRaw(Prisma.sql`${query} ORDER BY ${order} LIMIT ${page.limit} OFFSET ${page.skip}`),total:Number(total.total)};
}
