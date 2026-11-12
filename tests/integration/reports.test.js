import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p10-t2 acceptance: seven reports from settled snapshots without multiplied revenue',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let tax;
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  tax=await db.taxes.create({data:{name:'Inclusive',rate_percent:'10',is_inclusive:true}});await db.products.update({where:{id:f.product.id},data:{tax_id:tax.id}});
  const create=async()=>{const r=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID(),items:[{product_id:String(f.product.id),quantity:1},{product_id:String(f.product.id),quantity:2}]},f.cashier);assert.equal(r.status,201);return r.body.data;};
  const order=await create(),cancelled=await create(),pending=await create();
  const pay=await request(f.h,{path:'/orders/'+order.id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(pay.status,201);assert.equal(pay.body.data.amount,'75000.00');const payment=await db.payments.findUnique({where:{id:BigInt(pay.body.data.id)}}),{id,created_at,updated_at,...paymentData}=payment;
  const boundary=new Date('2026-01-04T17:00:00Z');await db.payments.update({where:{id},data:{paid_at:boundary,created_at:new Date('2025-12-01T00:00:00Z')}});
  await db.payments.create({data:{...paymentData,order_id:BigInt(pending.id),status:'pending',paid_at:null,cash_received:null,cash_change:null,payment_reference:'PAY-'+randomUUID(),idempotency_key:randomUUID(),created_at:new Date('2026-01-03T17:00:00Z')}});
  await db.payments.create({data:{...paymentData,status:'failed',paid_at:null,cash_received:null,cash_change:null,payment_reference:'PAY-'+randomUUID(),idempotency_key:randomUUID(),created_at:new Date('2026-01-03T17:00:00Z')}});
  await db.payments.create({data:{...paymentData,status:'failed',paid_at:null,cash_received:null,cash_change:null,payment_reference:'PAY-'+randomUUID(),idempotency_key:randomUUID(),created_at:new Date('2026-01-06T17:00:00Z')}});
  // Two captured inclusive groups share one paid order; joining them must not multiply revenue.
  await db.order_taxes.updateMany({where:{order_id:BigInt(order.id)},data:{name:'Captured group A',taxable_amount:'22000',tax_amount:'2000'}});
  await db.order_taxes.create({data:{order_id:BigInt(order.id),name:'Captured group B',rate_percent:'10',is_inclusive:true,taxable_amount:'53000',tax_amount:'4818.18'}});
  assert.equal((await f.api('/orders/'+cancelled.id+'/cancel','POST',{reason:'No refund'},f.admin)).status,200);
  await db.orders.update({where:{id:BigInt(cancelled.id)},data:{cancelled_at:boundary}});for(const o of [order,cancelled,pending])await db.orders.update({where:{id:BigInt(o.id)},data:{created_at:new Date('2026-01-03T17:00:00Z')}});
  await db.categories.update({where:{id:f.category.id},data:{name:'Renamed'}});await db.products.update({where:{id:f.product.id},data:{name:'Renamed product',base_price:'1'}});
  const range='?from=2026-01-04T00:00:00%2B07:00&to=2026-01-07T00:00:00%2B07:00',get=(name,extra='')=>f.api('/admin/reports/'+name+range+extra);
  for(const name of ['sales','payments','products','categories','employees','orders','cancellations']){const path='/admin/reports/'+name+range;assert.equal((await f.api(path,'GET',undefined,{})).status,401);assert.equal((await f.api(path,'GET',undefined,f.cashier)).status,403);assert.equal((await get(name)).status,200);assert.equal((await get(name,'&unknown=x')).status,422);assert.equal((await f.api('/admin/reports/'+name+'?from=2026-01-05T00:00:00Z&to=2026-01-04T00:00:00Z')).status,422);}
  const sales=(await get('sales')).body;assert.equal(sales.meta.totals.revenue,'75000.00');assert.equal(sales.meta.totals.count,1);assert.equal(sales.meta.totals.gross_sales,'75000.00');assert.equal(sales.meta.totals.tax,'6818.18');assert.equal(sales.meta.totals.net_sales,'68181.82');assert.equal(sales.meta.totals.average_order_value,'75000.00');assert.deepEqual(sales.data.map(b=>b.count),[0,1,0]);assert.equal(sales.data[1].start,'2026-01-04T17:00:00.000Z');
  const weeks=(await get('sales','&group_by=week')).body;assert.equal(weeks.data[0].start,'2025-12-28T17:00:00.000Z');assert.equal(weeks.data[1].start,'2026-01-04T17:00:00.000Z');assert.equal(weeks.data[1].revenue,'75000.00');
  const month=(await get('sales','&group_by=month')).body;assert.equal(month.data[0].start,'2025-12-31T17:00:00.000Z');assert.equal(month.meta.totals.revenue,'75000.00');
  const methods=(await get('payments')).body.data;assert.deepEqual(methods.map(m=>[m.code,m.status,m.count,m.amount]),[['cash','failed',1,'75000.00'],['cash','paid',1,'75000.00'],['cash','pending',1,'75000.00']]);
  const products=(await get('products')).body.data;assert.equal(products.length,1);assert.equal(products[0].product_name,'Snapshot tea');assert.equal(products[0].quantity,3);assert.equal(products[0].revenue,'75000.00');
  const categories=(await get('categories')).body.data;assert.equal(categories[0].category_name,f.category.name);assert.equal(categories[0].quantity,3);assert.equal(categories[0].revenue,'75000.00');
  const employees=(await get('employees')).body.data;assert.equal(employees[0].owner_id,String(f.cashierA.id));assert.equal(employees[0].revenue,'75000.00');assert.equal(employees[0].count,1);
  const orders=(await get('orders')).body.data;assert.equal(orders.reduce((n,o)=>n+o.count,0),3);assert.equal(orders.reduce((n,o)=>n+o.unpaid_count,0),2);
  const cancellations=(await get('cancellations')).body.data;assert.equal(cancellations.length,1);assert.equal(cancellations[0].reason,'No refund');assert.equal(cancellations[0].actor,String(f.adminA.id));assert.equal(cancellations[0].refunds,undefined);
  const page=(await get('payments','&limit=1&page=2')).body;assert.equal(page.meta.total,3);assert.equal(page.data[0].status,'paid');
  const empty=(await f.api('/admin/reports/sales?from=2026-02-01T00:00:00Z&to=2026-02-02T00:00:00Z')).body;assert.equal(empty.meta.totals.revenue,'0.00');assert.equal(empty.meta.totals.average_order_value,'0.00');
  for(const name of ['payments','products','categories','employees','orders','cancellations']){const empty=await f.api('/admin/reports/'+name+'?from=2026-02-01T00:00:00Z&to=2026-02-02T00:00:00Z');assert.deepEqual(empty.body.data,[]);assert.equal(empty.body.meta.total,0);}
  const edge=(await f.api('/admin/reports/sales?from=2026-01-03T17:00:00Z&to=2026-01-04T17:00:00Z')).body;assert.equal(edge.meta.totals.revenue,'0.00');
  await db.orders.update({where:{id:BigInt(order.id)},data:{item_discount_total:'1000',order_discount_total:'500',service_charge_total:'2000'}});const adjusted=(await get('sales')).body.meta.totals;assert.equal(adjusted.discounts,'1500.00');assert.equal(adjusted.service_charges,'2000.00');assert.equal(adjusted.net_sales,'66681.82');assert.equal(adjusted.revenue,'75000.00');
  for(const name of ['products','categories'])assert.equal((await get(name)).body.data[0].revenue,'75000.00');
  assert.equal((await f.api('/admin/reports/sales?from=9999-12-31T20:00:00Z&to=9999-12-31T23:00:00Z')).status,422);
 }finally{await f.cleanup();if(tax)await db.taxes.delete({where:{id:tax.id}});}
}));
