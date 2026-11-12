import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { observeCafeLock } from '../support/shifts.js';
import { startApp,request } from '../support/http.js';
const gate=()=>{let release,ready;return{wait:new Promise(r=>release=r),held:new Promise(r=>ready=r),release:()=>release(),ready:()=>ready()};};
const wrap=(db,transaction)=>new Proxy(db,{get(target,key){return key==='$transaction'?transaction:target[key];}});
test('mounted cash/manual races both schedules; concurrent manual confirms issue one receipt',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),method=await db.payment_methods.findUnique({where:{code:'qris'}});let g,first,second;const servers=[];
 try{
  await db.payment_methods.update({where:{id:method.id},data:{provider:'manual',is_enabled:true}});
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const call=(h,path,body,key)=>request(h,{path,method:'POST',body,...f.cashier,headers:{Origin:f.config.allowedOrigin,...(key?{'Idempotency-Key':key}:{})}});
  for(const scenario of ['cash-first','manual-first','confirm']){
   const order=(await f.api('/orders','POST',{...f.input,client_request_id:randomUUID()},f.cashier)).body.data,base='/orders/'+order.id+'/payments';g=gate();
   let confirmPath;
   if(scenario==='confirm'){const pending=await call(f.h,base+'/qris',{provider:'manual'},randomUUID());confirmPath='/payments/'+pending.body.data.id+'/confirm-manual';}
   const holder=await startApp({db:wrap(db,(fn,options)=>db.$transaction(async tx=>{try{const result=await fn(tx);g.ready();await g.wait;return result;}catch(error){g.ready();await g.wait;throw error;}},options)),config:f.config});servers.push(holder);
   const observer=observeCafeLock(db),contender=await startApp({db:wrap(db,observer.db.$transaction),config:f.config});servers.push(contender);
   first=call(holder,confirmPath??base+(scenario==='cash-first'?'/cash':'/qris'),confirmPath?undefined:scenario==='cash-first'?{cash_received:'100000'}:{provider:'manual'},confirmPath?null:randomUUID());await g.held;
   second=call(contender,confirmPath??base+(scenario==='cash-first'?'/qris':'/cash'),confirmPath?undefined:scenario==='cash-first'?{provider:'manual'}:{cash_received:'100000'},confirmPath?null:randomUUID());
   try{await observer.assertBlocked();}finally{g.release();}
   assert.equal((await first).status,confirmPath?200:201);assert.equal((await second).status,confirmPath?200:409);
   const payments=await db.payments.findMany({where:{order_id:BigInt(order.id)}});assert.equal(payments.length,1);
   assert.equal(await db.receipts.count({where:{payment_id:payments[0].id}}),scenario==='manual-first'?0:1);
   assert.equal(await db.payment_events.count({where:{payment_id:payments[0].id,event_type:'paid'}}),scenario==='manual-first'?0:1);
   await holder.close();await contender.close();servers.splice(0);
  }
 }finally{g?.release();await Promise.allSettled([first,second].filter(Boolean));for(const h of servers)await h.close();await f.cleanup();await db.payment_methods.update({where:{id:method.id},data:{provider:method.provider,is_enabled:method.is_enabled}});}
}));
