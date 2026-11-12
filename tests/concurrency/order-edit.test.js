import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { observeCafeLock } from '../support/shifts.js';
import { editItem } from '../../src/services/orders.service.js';
const gate=()=>{let release,ready;return{wait:new Promise(r=>release=r),held:new Promise(r=>ready=r),release:()=>release(),ready:()=>ready()};};
test('concurrent quantity and instruction edits block at lock and preserve merged state',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);const hold=gate();let writing,second;
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const order=(await f.api('/orders','POST',f.input,f.cashier)).body.data,actor=await f.actor(f.cashierA,f.cashier);
  const id=BigInt(order.id),itemId=BigInt(order.items[0].id);
  const held={$transaction:(fn,options)=>db.$transaction(async tx=>{const value=await fn(tx);hold.ready();await hold.wait;return value;},options)};
  writing=editItem(held,actor,{id,itemId,patch:{quantity:3}},{});await hold.held;
  const contender=observeCafeLock(db);second=editItem(contender.db,actor,{id,itemId,patch:{special_instructions:'keep quantity'}},{});
  try{await contender.assertBlocked();}finally{hold.release();await writing;}
  await second;
  const stored=await db.order_items.findUnique({where:{id:itemId}});assert.equal(stored.quantity,3);assert.equal(stored.special_instructions,'keep quantity');assert.equal(stored.line_subtotal.toFixed(2),'75000.00');
 }finally{hold.release();await Promise.allSettled([writing,second].filter(Boolean));await f.cleanup();}
}));
