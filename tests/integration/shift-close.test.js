import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { shiftFixture } from '../support/shifts.js';
test('p06-t2 acceptance: closure guards, filtered history, paid attribution not tender',async()=>withDatabase(async db=>{
 const f=await shiftFixture(db),{api,cashier,other,registers}=f,orders=[];
 try{
  const own=(await api('/cashier-shifts/open','POST',{cash_register_id:String(registers[0].id)},cashier)).body.data;
  const ownId=BigInt(own.id),adminShift=(await api('/cashier-shifts/open','POST',{cash_register_id:String(registers[1].id)})).body.data;
  const path=`/cashier-shifts/${own.id}`;
  for(const p of ['/cashier-shifts/mine',path+'/summary',path+'/orders','/admin/cashier-shifts','/admin/cashier-shifts/'+own.id])assert.equal((await api(p,'GET',undefined,{})).status,401);
  for(const p of ['/admin/cashier-shifts','/admin/cashier-shifts/'+own.id])assert.equal((await api(p,'GET',undefined,cashier)).status,403);
  for(const p of [path+'/summary',path+'/orders'])assert.equal((await api(p,'GET',undefined,other)).status,404);
  assert.equal((await api(path+'/close','POST',{},{})).status,401);
  assert.equal((await api(path+'/close','POST',{}, {cookie:cashier.cookie})).status,403);
  assert.equal((await api(path+'/close','POST',{},other)).status,404);
  assert.equal((await api(path+'/close','POST',{closing_cash:'1'},cashier)).status,422);
  const order=await db.orders.create({data:{order_number:randomUUID(),client_request_id:randomUUID(),cashier_id:f.cashierA.id,shift_id:ownId,order_type:'dine_in',grand_total:'75000'}});orders.push(order.id);
  assert.equal((await api(path+'/close','POST',{},cashier)).status,409);
  await db.orders.update({where:{id:order.id},data:{status:'cancelled'}});
  const method=await db.payment_methods.findFirst({where:{code:'cash'}});
  const payment=await db.payments.create({data:{order_id:order.id,shift_id:ownId,payment_method_id:method.id,payment_reference:randomUUID(),idempotency_key:randomUUID(),amount:'75000',cash_received:'100000',cash_change:'25000',processed_by_user_id:f.adminA.id,status:'pending'}});
  assert.equal((await api(path+'/close','POST',{},cashier)).status,409);
  await db.orders.update({where:{id:order.id},data:{status:'preparing',payment_status:'paid'}});
  await db.payments.update({where:{id:payment.id},data:{status:'paid',paid_at:new Date()}});
  // Failed payment neither blocks closing nor counts as revenue.
  await db.payments.create({data:{order_id:order.id,shift_id:ownId,payment_method_id:method.id,payment_reference:randomUUID(),idempotency_key:randomUUID(),amount:'999',processed_by_user_id:f.cashierA.id,status:'failed'}});
  const summary=await api(path+'/summary','GET',undefined,cashier);assert.equal(summary.status,200);
  assert.equal(summary.body.data.paid_sales_total,'75000.00');assert.equal(summary.body.data.transaction_count,1);assert.equal(summary.body.data.method_breakdown[0].amount,'75000.00');assert.ok(summary.body.data.duration_seconds>=0);
  assert.equal((await api(`/cashier-shifts/${adminShift.id}/summary`)).body.data.paid_sales_total,'0.00');
  const list=await api(path+'/orders?limit=1&sort_by=created_at','GET',undefined,cashier);assert.equal(list.body.meta.total,1);assert.equal(list.body.data[0].id,String(order.id));
  const mine=await api('/cashier-shifts/mine?status=open&from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z','GET',undefined,cashier);assert.equal(mine.status,200);assert.ok(mine.body.data.every(s=>s.cashier_id===String(f.cashierA.id)));
  const filtered=await api(`/admin/cashier-shifts?cashier_id=${f.cashierA.id}&cash_register_id=${registers[0].id}&status=open&limit=1`);assert.equal(filtered.body.meta.total,1);
  const detail=await api('/admin/cashier-shifts/'+own.id);assert.equal(detail.status,200);assert.equal(detail.body.data.cashier.id,String(f.cashierA.id));assert.ok(!JSON.stringify(detail.body).includes('password_hash'));
  for(const q of ['status=bad','cashier_id=0','from=2026-02-30T00:00:00Z','from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z','from=2026-01-01T00:00:00Z&to=2028-01-01T00:00:00Z','extra=1'])assert.equal((await api('/admin/cashier-shifts?'+q)).status,422);
  assert.equal((await api('/cashier-shifts/mine?cashier_id='+f.adminA.id,'GET',undefined,cashier)).status,422);
  const closed=await api(path+'/close','POST',{closing_notes:'Done'});assert.equal(closed.status,200);assert.equal(closed.body.data.closed_by_user_id,String(f.adminA.id));
  const replay=await api(path+'/close','POST',{closing_notes:'Changed'},cashier);assert.equal(replay.status,200);assert.equal(replay.body.data.closed_at,closed.body.data.closed_at);assert.equal(replay.body.data.closing_notes,'Done');
  assert.equal((await api('/cashier-shifts/current','GET',undefined,cashier)).body.data,null);
  assert.equal(await db.audit_logs.count({where:{action:'shifts.close',entity_id:own.id}}),1);
 }finally{
  await db.payments.deleteMany({where:{order_id:{in:orders}}});await db.orders.deleteMany({where:{id:{in:orders}}});await f.cleanup();
 }
}));
