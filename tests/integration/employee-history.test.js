import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p10-t1 acceptance: employee histories, owner revenue and half-open Jakarta dates',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);
 try{
  const open=await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);assert.equal(open.status,201);const shift=BigInt(open.body.data.id);
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[1].id)},f.admin);
  const create=async()=>{const r=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID(),items:[{product_id:String(f.product.id),quantity:3}]},f.cashier);assert.equal(r.status,201);return r.body.data;};
  const order=await create(),edge=await create(),unpaid=await create();
  for(const o of [order,edge]){const pay=await request(f.h,{path:'/orders/'+o.id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.admin,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(pay.status,201);await db.payments.update({where:{id:BigInt(pay.body.data.id)},data:{paid_at:new Date(o===order?'2026-01-01T17:00:00Z':'2026-01-02T17:00:00Z')}});}
  for(const o of [order,edge,unpaid])await db.orders.update({where:{id:BigInt(o.id)},data:{created_at:new Date('2026-01-01T17:00:00Z')}});
  await db.cashier_shifts.update({where:{id:shift},data:{opened_at:new Date('2026-01-01T17:00:00Z')}});
  const range='?from=2026-01-02T00:00:00%2B07:00&to=2026-01-03T00:00:00%2B07:00',base='/admin/users/'+f.cashierA.id;
  for(const suffix of ['/orders','/shifts','/sales-summary']){assert.equal((await f.api(base+suffix+range,'GET',undefined,{})).status,401);assert.equal((await f.api(base+suffix+range,'GET',undefined,f.cashier)).status,403);assert.equal((await f.api('/admin/users/18446744073709551615'+suffix+range)).status,404);}
  const summary=await f.api(base+'/sales-summary'+range);assert.equal(summary.status,200,JSON.stringify(summary.body));assert.equal(summary.body.data.paid_sales_total,'75000.00');assert.equal(summary.body.data.transaction_count,1);assert.equal(summary.body.data.average_order_value,'75000.00');
  const empty=(await f.api('/admin/users/'+f.adminA.id+'/sales-summary'+range)).body.data;assert.equal(empty.paid_sales_total,'0.00');assert.equal(empty.average_order_value,'0.00');
  const orders=await f.api(base+'/orders'+range+'&status=pending&payment_status=paid&limit=1&page=2&sort_by=created_at');assert.equal(orders.body.meta.total,2);assert.equal(orders.body.data[0].id,edge.id);assert.ok(!JSON.stringify(orders.body).includes('request_hash'));
  const pending=await f.api(base+'/orders'+range+'&payment_status=pending');assert.deepEqual(pending.body.data.map(o=>o.id),[unpaid.id]);
  const shifts=await f.api(base+'/shifts'+range+'&status=open');assert.equal(shifts.body.meta.total,1);assert.equal(shifts.body.data[0].id,String(shift));
  for(const suffix of ['/orders','/shifts','/sales-summary'])for(const query of ['?from=2026-02-30T00:00:00Z&to=2026-03-02T00:00:00Z','?from=2026-01-03T00:00:00Z&to=2026-01-01T00:00:00Z','?timezone=UTC','?from=2026-01-01','?from=2025-01-01T00:00:00Z&to=2026-01-03T00:00:00Z','?unknown=x'])assert.equal((await f.api(base+suffix+query)).status,422,query);
 }finally{await f.cleanup();}
}));
