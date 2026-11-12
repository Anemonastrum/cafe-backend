import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
test('p07-t4 acceptance: forward history, paid preparation after closure, permission-gated cancellation',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),{api,cashier,other}=f,settings=await db.cafe_settings.findUnique({where:{id:1}});let id;
 try{
  const shift=(await api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},cashier)).body.data;
  const order=(await api('/orders','POST',f.input,cashier)).body.data;id=BigInt(order.id);const path='/orders/'+id;
  for(const [route,method,body] of [[path+'/status','PATCH',{status:'preparing'}],[path+'/cancel','POST',{reason:'mistake'}],[path+'/history','GET',undefined]]){
   assert.equal((await api(route,method,body,{})).status,401);assert.equal((await api(route,method,body,other)).status,404);
   if(method!=='GET')assert.equal((await api(route,method,body,{cookie:cashier.cookie})).status,403);
  }
  assert.equal((await api(path+'/status','PATCH',{status:'ready'},cashier)).status,409);
  assert.equal((await api(path+'/status','PATCH',{status:'cancelled'},cashier)).status,422);
  assert.equal((await api(path+'/status','PATCH',{status:'preparing',changed_by_user_id:'1'},cashier)).status,422);
  for(const reason of ['', ' ', 'x'.repeat(501)])assert.equal((await api(path+'/cancel','POST',{reason})).status,422);
  assert.equal((await api(path+'/history?extra=1')).status,422);
  await api(path+'/hold','POST',{},cashier);assert.equal((await api(path+'/status','PATCH',{status:'preparing'},cashier)).status,409);await api(path+'/resume','POST',{},cashier);
  assert.equal((await api(path+'/status','PATCH',{status:'preparing'},cashier)).status,200);
  const count=await db.order_status_history.count({where:{order_id:id}});
  assert.equal((await api(path+'/status','PATCH',{status:'preparing'},cashier)).status,200);assert.equal(await db.order_status_history.count({where:{order_id:id}}),count);
  assert.equal((await api(path+'/status','PATCH',{status:'pending'},cashier)).status,409);
  assert.equal((await api(path+'/status','PATCH',{status:'ready'})).status,200);
  assert.equal((await api(path+'/status','PATCH',{status:'completed'},cashier)).status,409);
  await db.orders.update({where:{id},data:{payment_status:'paid',paid_at:new Date()}});
  assert.equal((await api('/cashier-shifts/'+shift.id+'/close','POST',{},cashier)).status,200);
  assert.equal((await api(path+'/cancel','POST',{reason:'no refund'})).status,409);
  const completed=await api(path+'/status','PATCH',{status:'completed'},cashier);assert.equal(completed.status,200);assert.ok(completed.body.data.completed_at);
  const history=(await api(path+'/history','GET',undefined,cashier)).body.data;assert.deepEqual(history.map(h=>[h.from_status,h.to_status]),[[null,'pending'],['pending','preparing'],['preparing','ready'],['ready','completed']]);
  assert.equal(history[2].changed_by_user_id,String(f.adminA.id));assert.ok(history.every((h,i)=>i===0||BigInt(h.id)>BigInt(history[i-1].id)));
  await api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},cashier);
  const next=(await api('/orders','POST',{...f.input,client_request_id:randomUUID()},cashier)).body.data,nextPath='/orders/'+next.id;
  await db.cafe_settings.update({where:{id:1},data:{cashier_can_cancel:false}});
  assert.equal((await api(nextPath+'/cancel','POST',{reason:'mistake'},cashier)).status,403);
  const method=await db.payment_methods.findFirst({where:{code:'cash'}});
  const payment=await db.payments.create({data:{order_id:BigInt(next.id),payment_method_id:method.id,payment_reference:randomUUID(),idempotency_key:randomUUID(),amount:'1',processed_by_user_id:f.cashierA.id}});
  assert.equal((await api(nextPath+'/cancel','POST',{reason:'pending'})).status,409);await db.payments.delete({where:{id:payment.id}});
  await db.cafe_settings.update({where:{id:1},data:{cashier_can_cancel:true}});
  const cancelled=await api(nextPath+'/cancel','POST',{reason:'Mistake'},cashier);assert.equal(cancelled.status,200);assert.equal(cancelled.body.data.cancelled_by_user_id,String(f.cashierA.id));
  const repeated=await api(nextPath+'/cancel','POST',{reason:'Overwrite'},cashier);assert.equal(repeated.status,200);assert.equal(repeated.body.data.cancel_reason,'Mistake');assert.equal(repeated.body.data.cancelled_at,cancelled.body.data.cancelled_at);
  assert.equal((await api(nextPath+'/status','PATCH',{status:'preparing'},cashier)).status,409);
  assert.equal(await db.order_status_history.count({where:{order_id:BigInt(next.id),to_status:'cancelled'}}),1);
  const adminCancel=(await api('/orders','POST',{...f.input,client_request_id:randomUUID()},cashier)).body.data;
  assert.equal((await api('/orders/'+adminCancel.id+'/cancel','POST',{reason:'Admin correction'})).body.data.cancel_approved_by_user_id,String(f.adminA.id));
  const closed=(await api('/orders','POST',{...f.input,client_request_id:randomUUID()},cashier)).body.data;
  const current=(await api('/cashier-shifts/current','GET',undefined,cashier)).body.data;await db.cashier_shifts.update({where:{id:BigInt(current.id)},data:{status:'closed',closed_at:new Date()}});
  assert.equal((await api('/orders/'+closed.id+'/status','PATCH',{status:'preparing'},cashier)).status,409);
  assert.equal((await api('/orders/'+closed.id+'/cancel','POST',{reason:'closed'})).status,409);
 }finally{
  const rows=await db.orders.findMany({where:{cashier_id:f.cashierA.id}});await db.payments.deleteMany({where:{order_id:{in:rows.map(o=>o.id)}}});
  await db.cafe_settings.update({where:{id:1},data:{cashier_can_cancel:settings.cashier_can_cancel}});await f.cleanup();
 }
}));
