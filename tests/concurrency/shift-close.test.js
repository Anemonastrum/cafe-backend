import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { shiftFixture,observeCafeLock } from '../support/shifts.js';
import { openShift,closeShift,requireOpenShift } from '../../src/services/shifts.service.js';
import { lockCafe } from '../../src/models/lock.model.js';
import { lockUser } from '../../src/models/auth.model.js';
import { lockRegister } from '../../src/models/register.model.js';
const barrier=()=>{let release,ready;return{gate:new Promise(r=>release=r),locked:new Promise(r=>ready=r),release:()=>release(),ready:()=>ready()};};
test('close-first rejects new unpaid work; writer-first blocks close after commit',async()=>withDatabase(async db=>{
 const f=await shiftFixture(db),orders=[];
 try{
  const actor=await f.actor(f.cashierA,f.cashier),cash_register_id=f.registers[0].id;
  const writer=async(b,database=db)=>database.$transaction(async tx=>{
   await lockCafe(tx);await lockUser(tx,actor.id);await lockRegister(tx,cash_register_id);
   const shift=await requireOpenShift(tx,actor.id);
   const order=await tx.orders.create({data:{order_number:randomUUID(),client_request_id:randomUUID(),cashier_id:actor.id,shift_id:shift.id,order_type:'dine_in'}});orders.push(order.id);
   if(b){b.ready();await b.gate;}return order;
  });
  const first=await openShift(db,actor,{cash_register_id},{}),closeGate=barrier();
  // Actual close service runs; pause after its SQL writes but before transaction commits.
  const heldDb={$transaction:(fn,options)=>db.$transaction(async tx=>{const result=await fn(tx);closeGate.ready();await closeGate.gate;return result;},options)};
  const closing=closeShift(heldDb,actor,{id:first.id},{});await closeGate.locked;
  const writerLock=observeCafeLock(db);
  const blockedWriter=writer(undefined,writerLock.db).then(value=>({value}),error=>({error}));
  try{await writerLock.assertBlocked();}finally{closeGate.release();await closing;await blockedWriter;}
  assert.equal((await blockedWriter).error.status,409);assert.equal(orders.length,0);
  const second=await openShift(db,actor,{cash_register_id},{}),writeGate=barrier();
  const writing=writer(writeGate);await writeGate.locked;
  const closeLock=observeCafeLock(db);
  const blockedClose=closeShift(closeLock.db,actor,{id:second.id},{}).then(value=>({value}),error=>({error}));
  try{await closeLock.assertBlocked();}finally{writeGate.release();await writing;await blockedClose;}
  assert.equal((await blockedClose).error.status,409);
  assert.equal((await db.cashier_shifts.findUnique({where:{id:second.id}})).status,'open');
 }finally{await db.orders.deleteMany({where:{id:{in:orders}}});await f.cleanup();}
}));
