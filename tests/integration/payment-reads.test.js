import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p08-t3 acceptance: scoped payment reads, filtered lists and allowlisted events',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),method=await db.payment_methods.findUnique({where:{code:'qris'}});
 try{
  await db.payment_methods.update({where:{id:method.id},data:{provider:'manual',is_enabled:true}});
  const shift=(await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier)).body.data;
  const order=(await f.api('/orders','POST',f.input,f.cashier)).body.data;
  const call=(path,body)=>request(f.h,{path,method:'POST',body,...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});
  const pending=(await call('/orders/'+order.id+'/payments/qris',{provider:'manual'})).body.data;
  const path='/payments/'+pending.id,events='/admin/payments/'+pending.id+'/events';
  assert.equal((await f.api(path,'GET',undefined,{})).status,401);assert.equal((await f.api(path,'GET',undefined,f.other)).status,404);
  assert.equal((await f.api('/orders/'+order.id+'/payments','GET',undefined,f.other)).status,404);
  assert.equal((await f.api('/admin/payments','GET',undefined,f.cashier)).status,403);assert.equal((await f.api(events,'GET',undefined,f.cashier)).status,403);
  const secret='LEAK-ME-'+randomUUID();await db.payment_events.create({data:{payment_id:BigInt(pending.id),event_type:'provider_debug',payload:{status:'pending',actor_id:String(f.cashierA.id),signature_key:secret,raw:{password:secret},reason:{password:secret}}}});
  await db.payments.update({where:{id:BigInt(pending.id)},data:{gateway_transaction_id:secret,gateway_order_id:secret,gateway_status:secret}});
  const detail=await f.api(path,'GET',undefined,f.cashier);assert.equal(detail.status,200);assert.equal(detail.body.data.status,'pending');assert.ok(!JSON.stringify(detail.body).includes(secret));assert.ok(!JSON.stringify(detail.body).includes('request_hash'));
  const history=await f.api(events+'?limit=1&page=2');assert.equal(history.status,200);assert.ok(history.body.meta.total>=2);assert.ok(!JSON.stringify(history.body).includes(secret));
  const all=await f.api(events);assert.ok(!JSON.stringify(all.body).includes(secret));assert.equal(typeof all.body.data.find(e=>e.event_type==='provider_debug').payload.reason,'undefined');
  await db.payments.update({where:{id:BigInt(pending.id)},data:{status:'failed',failed_at:new Date()}});
  assert.equal((await f.api(path)).body.data.status,'failed');
  const paid=(await call('/orders/'+order.id+'/payments/cash',{cash_received:'100000'})).body.data;
  const list=await f.api('/orders/'+order.id+'/payments?status=paid&limit=1','GET',undefined,f.cashier);assert.equal(list.status,200);assert.equal(list.body.meta.total,1);assert.equal(list.body.data[0].id,paid.id);
  const query=`status=paid&payment_method_id=${paid.payment_method_id}&cashier_id=${f.cashierA.id}&search=${paid.payment_reference}&from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z&limit=1`;
  const admin=await f.api('/admin/payments?'+query);assert.equal(admin.status,200);assert.equal(admin.body.meta.total,1);assert.equal(admin.body.data[0].id,paid.id);
  assert.equal((await f.api('/admin/payments?status=pending&search='+paid.payment_reference)).body.meta.total,0);
  for(const q of ['status=refunded','payment_method_id=0','cashier_id=x','from=2026-02-30T00:00:00Z','from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z','extra=1','sort_by=request_hash'])assert.equal((await f.api('/admin/payments?'+q)).status,422);
  assert.equal((await f.api(events+'?status=paid')).status,422);assert.equal((await f.api('/orders/'+order.id+'/payments?cashier_id=1')).status,422);
  const summary=await f.api('/cashier-shifts/'+shift.id+'/summary','GET',undefined,f.cashier);assert.equal(summary.body.data.paid_sales_total,paid.amount);assert.equal(summary.body.data.transaction_count,1);
 }finally{await f.cleanup();await db.payment_methods.update({where:{id:method.id},data:{provider:method.provider,is_enabled:method.is_enabled}});}
}));
