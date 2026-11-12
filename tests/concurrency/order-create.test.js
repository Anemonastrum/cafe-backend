import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { observeCafeLock } from '../support/shifts.js';
import { startApp,request } from '../support/http.js';
import { testConfig } from '../support/fixtures.js';
import { createOrder } from '../../src/services/orders.service.js';
const gate=()=>{let release,ready;return{wait:new Promise(r=>release=r),held:new Promise(r=>ready=r),release:()=>release(),ready:()=>ready()};};
const wrapped=(db,transaction)=>new Proxy(db,{get(target,key){return key==='$transaction'?transaction:target[key];}});
test('same-key creates serialize, close-first blocks mounted create, create-first blocks mounted close',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let h;
 try{
  const actor=await f.actor(f.cashierA,f.cashier),open=()=>f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  await open();
  const results=await Promise.all([1,2].map(()=>createOrder(db,actor,f.normalized,{})));assert.deepEqual(results.map(r=>r.replay).sort(),[false,true]);assert.equal(results[0].order.id,results[1].order.id);
  await db.orders.update({where:{id:results[0].order.id},data:{status:'cancelled'}});
  const shift=(await f.api('/cashier-shifts/current','GET',undefined,f.cashier)).body.data;
  const closeGate=gate(),observer=observeCafeLock(db);
  const dbView=wrapped(db,(fn,options)=>observer.db.$transaction(async tx=>{const value=await fn(tx);if(value?.status==='closed'){closeGate.ready();await closeGate.wait;}return value;},options));
  h=await startApp({db:dbView,config:testConfig()});
  const api=(path,body)=>request(h,{method:'POST',path,body,...f.cashier,headers:{Origin:testConfig().allowedOrigin}});
  const closing=api(`/cashier-shifts/${shift.id}/close`,{});await closeGate.held;
  // New observer distinguishes contender query from holder's already-acquired lock.
  const contender=observeCafeLock(db),hc=await startApp({db:wrapped(db,contender.db.$transaction),config:testConfig()});
  const creating=request(hc,{method:'POST',path:'/orders',body:{...f.input,client_request_id:randomUUID()},...f.cashier,headers:{Origin:testConfig().allowedOrigin}});
  try{await contender.assertBlocked();}finally{closeGate.release();await closing;}
  assert.equal((await creating).status,409);await hc.close();await h.close();h=null;
  await open();const next=(await f.api('/cashier-shifts/current','GET',undefined,f.cashier)).body.data;
  const createGate=gate(),heldDb=wrapped(db,(fn,options)=>db.$transaction(async tx=>{const value=await fn(tx);if(value?.order){createGate.ready();await createGate.wait;}return value;},options));
  h=await startApp({db:heldDb,config:testConfig()});
  const writing=request(h,{method:'POST',path:'/orders',body:{...f.input,client_request_id:randomUUID()},...f.cashier,headers:{Origin:testConfig().allowedOrigin}});await createGate.held;
  const closeObserver=observeCafeLock(db),hh=await startApp({db:wrapped(db,closeObserver.db.$transaction),config:testConfig()});
  const blockedClose=request(hh,{method:'POST',path:`/cashier-shifts/${next.id}/close`,body:{},...f.cashier,headers:{Origin:testConfig().allowedOrigin}});
  try{await closeObserver.assertBlocked();}finally{createGate.release();await writing;}
  assert.equal((await blockedClose).status,409);await hh.close();
 }finally{if(h)await h.close();await f.cleanup();}
}));
test('failed child insertion rolls back numbering, order and children',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const actor=await f.actor(f.cashierA,f.cashier),before=await db.cafe_settings.findUnique({where:{id:1}});
  const broken=wrapped(db,(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='order_status_history')return{create:async()=>{throw new Error('Injected history failure');}};return target[key];}})),options));
  await assert.rejects(createOrder(broken,actor,f.normalized,{}),/Injected history failure/);
  assert.equal((await db.cafe_settings.findUnique({where:{id:1}})).next_order_number,before.next_order_number);
  assert.equal(await db.orders.count({where:{client_request_id:f.input.client_request_id}}),0);
  assert.equal(await db.order_items.count({where:{product_id:f.product.id}}),0);
 }finally{await f.cleanup();}
}));
