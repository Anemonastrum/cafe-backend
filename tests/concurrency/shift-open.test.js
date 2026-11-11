import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { shiftFixture,observeCafeLock } from '../support/shifts.js';
import { openShift } from '../../src/services/shifts.service.js';
import { lockCafe } from '../../src/models/lock.model.js';
test('same cashier on different registers and different cashiers on same register have one winner',async()=>withDatabase(async db=>{
 const f=await shiftFixture(db);
 try{
  const admin=await f.actor(f.adminA,f.admin),cashier=await f.actor(f.cashierA,f.cashier);
  for(const inputs of [[[admin,0],[admin,1]],[[admin,0],[cashier,0]]]){
   let release,ready;const gate=new Promise(r=>release=r),locked=new Promise(r=>ready=r);
   const blocker=db.$transaction(async tx=>{await lockCafe(tx);ready();await gate;});await locked;
   const observers=inputs.map(()=>observeCafeLock(db));
   const calls=inputs.map(([actor,i],index)=>openShift(observers[index].db,actor,{cash_register_id:f.registers[i].id},{}));
   const resultsPromise=Promise.allSettled(calls);
   try{await Promise.all(observers.map(o=>o.assertBlocked()));}finally{release();await blocker;await resultsPromise;}
   const results=await resultsPromise;
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
   assert.equal(await db.cashier_shifts.count({where:{cash_register_id:{in:f.registers.map(r=>r.id)}}}),1);
   await db.cashier_shifts.deleteMany({where:{cash_register_id:{in:f.registers.map(r=>r.id)}}});
  }
 }finally{await f.cleanup();}
}));
