import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { observeCafeLock } from '../support/shifts.js';
import { cancelOrder,changeStatus,assertEditable,lockOrderForActor } from '../../src/services/orders.service.js';
import { lockedActor } from '../../src/services/auth.service.js';
import { lockRegister } from '../../src/models/register.model.js';
import { lockShift } from '../../src/models/shifts.model.js';
import { withWriteTx } from '../../src/utils/transaction.js';
const gate=()=>{let release,ready;return{wait:new Promise(r=>release=r),held:new Promise(r=>ready=r),release:()=>release(),ready:()=>ready()};};
const heldDb=(db,g)=>({$transaction:(fn,options)=>db.$transaction(async tx=>{const value=await fn(tx);g.ready();await g.wait;return value;},options)});
test('cancel/payment fixture serializes both directions; duplicate preparation adds one history',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let currentGate,first,second;
 try{
  const shift=(await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier)).body.data,actor=await f.actor(f.adminA,f.admin);
  const method=await db.payment_methods.findFirst({where:{code:'cash'}});
  // Test-only future-payment fixture. Real P08 mounted payment route not claimed.
  const pay=(database,id)=>withWriteTx(database,async tx=>{
   await lockedActor(tx,actor,[f.cashierA.id]);await lockRegister(tx,f.registers[0].id);await lockShift(tx,BigInt(shift.id));
   const order=await lockOrderForActor(tx,actor,id);await assertEditable(tx,order);
   await tx.payments.create({data:{order_id:id,shift_id:BigInt(shift.id),payment_method_id:method.id,payment_reference:randomUUID(),idempotency_key:randomUUID(),amount:order.grand_total,status:'paid',paid_at:new Date(),processed_by_user_id:actor.id}});
   return tx.orders.update({where:{id},data:{payment_status:'paid',paid_at:new Date()}});
  });
  for(const cancelFirst of [true,false]){
   const created=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID()},f.cashier),id=BigInt(created.body.data.id),g=gate();currentGate=g;
   first=cancelFirst?cancelOrder(heldDb(db,g),actor,{id,reason:'cancel wins'},{}):pay(heldDb(db,g),id);await g.held;
   const observer=observeCafeLock(db);
   second=(cancelFirst?pay(observer.db,id):cancelOrder(observer.db,actor,{id,reason:'payment wins'},{})).then(()=>null,error=>error);
   try{await observer.assertBlocked();}finally{g.release();await first;}
   const error=await second;assert.equal(error.status,409);
   const stored=await db.orders.findUnique({where:{id}});assert.equal(stored.status,cancelFirst?'cancelled':'pending');assert.equal(stored.payment_status,cancelFirst?'pending':'paid');
   assert.equal(await db.payments.count({where:{order_id:id,status:'paid'}}),cancelFirst?0:1);
  }
  const order=(await f.api('/orders','POST',{...f.input,client_request_id:randomUUID()},f.cashier)).body.data;
  const results=await Promise.all([1,2].map(()=>changeStatus(db,actor,{id:BigInt(order.id),status:'preparing'},{})));assert.ok(results.every(r=>r.status==='preparing'));
  assert.equal(await db.order_status_history.count({where:{order_id:BigInt(order.id),to_status:'preparing'}}),1);
 }finally{
  currentGate?.release();await Promise.allSettled([first,second].filter(Boolean));
  const orders=await db.orders.findMany({where:{cashier_id:f.cashierA.id}});await db.payments.deleteMany({where:{order_id:{in:orders.map(o=>o.id)}}});await f.cleanup();
 }
}));
