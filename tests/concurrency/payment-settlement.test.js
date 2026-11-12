import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { observeCafeLock } from '../support/shifts.js';
import { startApp,request } from '../support/http.js';
import { createCashPayment } from '../../src/services/payment.service.js';
const gate=()=>{let release,ready;return{wait:new Promise(r=>release=r),held:new Promise(r=>ready=r),release:()=>release(),ready:()=>ready()};};
const wrap=(db,transaction)=>new Proxy(db,{get(target,key){return key==='$transaction'?transaction:target[key];}});
test('mounted cash/cash, pay/cancel and processor-close/pay both schedules serialize',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let g,first,second;const servers=[];
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  let adminShift=(await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[1].id)})).body.data;
  const create=async()=>{const r=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID()},f.cashier);assert.equal(r.status,201);return r.body.data;};
  const call=(h,path,body,key)=>request(h,{path,method:'POST',body,...f.admin,headers:{Origin:f.config.allowedOrigin,...(key?{'Idempotency-Key':key}:{})}});
  for(const scenario of ['cash-first','cash-retry','cancel-first','pay-first','close-first','pay-before-close']){
   const order=await create(),key=randomUUID(),paymentPath='/orders/'+order.id+'/payments/cash',cancelPath='/orders/'+order.id+'/cancel',closePath='/cashier-shifts/'+adminShift.id+'/close';g=gate();
   const held=wrap(db,(fn,options)=>db.$transaction(async tx=>{try{const value=await fn(tx);g.ready();await g.wait;return value;}catch(error){g.ready();await g.wait;throw error;}},options));
   const holder=await startApp({db:held,config:f.config});servers.push(holder);
   const observer=observeCafeLock(db),contender=await startApp({db:wrap(db,observer.db.$transaction),config:f.config});servers.push(contender);
   const cancelFirst=scenario==='cancel-first',closeFirst=scenario==='close-first';
   first=call(holder,cancelFirst?cancelPath:closeFirst?closePath:paymentPath,cancelFirst?{reason:'cancel wins'}:closeFirst?{}:{cash_received:'100000'},cancelFirst||closeFirst?null:key);await g.held;
   second=call(contender,scenario==='pay-first'?cancelPath:scenario==='pay-before-close'?closePath:paymentPath,scenario==='pay-first'?{reason:'too late'}:scenario==='pay-before-close'?{}:{cash_received:'100000'},scenario==='pay-first'||scenario==='pay-before-close'?null:scenario==='cash-retry'?key:randomUUID());
   try{await observer.assertBlocked();}finally{g.release();}
   assert.equal((await first).status,cancelFirst||closeFirst?200:201);
   assert.equal((await second).status,scenario==='cash-retry'||scenario==='pay-before-close'?200:409);
   const payments=await db.payments.findMany({where:{order_id:BigInt(order.id)}});assert.equal(payments.length,cancelFirst||closeFirst?0:1);
   if(payments.length)assert.equal(await db.receipts.count({where:{payment_id:payments[0].id}}),1);
   if(closeFirst||scenario==='pay-before-close')adminShift=(await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[1].id)})).body.data;
   await holder.close();await contender.close();servers.splice(0);
  }
 }finally{g?.release();await Promise.allSettled([first,second].filter(Boolean));for(const h of servers)await h.close();await f.cleanup();}
}));
test('receipt failure rolls back payment, order, event and audit atomically',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const order=(await f.api('/orders','POST',f.input,f.cashier)).body.data,actor=await f.actor(f.cashierA,f.cashier);
  const broken={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='receipts')return{findUnique:target.receipts.findUnique.bind(target.receipts),create:async()=>{throw new Error('Injected receipt failure');}};return target[key];}})),options)};
  await assert.rejects(createCashPayment(broken,actor,{orderId:BigInt(order.id),idempotencyKey:randomUUID(),cash_received:'100000'},{}),/Injected receipt failure/);
  assert.equal(await db.payments.count({where:{order_id:BigInt(order.id)}}),0);assert.equal((await db.orders.findUnique({where:{id:BigInt(order.id)}})).payment_status,'pending');
  assert.equal(await db.audit_logs.count({where:{user_id:actor.id,action:'payments.paid'}}),0);
 }finally{await f.cleanup();}
}));
