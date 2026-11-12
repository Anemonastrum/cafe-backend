import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withWriteTx } from '../../src/utils/transaction.js';
import { auditSignal,publishSignals,queueSignal } from '../../src/utils/signals.js';
test('order updates identify safe changed fields for notes, items and discounts',async()=>{
 for(const [action,before,after,expected] of [
  ['orders.edit',{notes:'before',order_type:'dine_in',grand_total:'10.00'},{notes:'after',order_type:'dine_in',grand_total:'10.00',request_hash:'private'},['notes']],
  ['orders.item.edit',{grand_total:'10.00'},{grand_total:'20.00'},['items','grand_total']],
  ['orders.discount.add',{order_discount_total:'0.00',grand_total:'20.00'},{order_discount_total:'1.00',grand_total:'19.00'},['discounts','order_discount_total','grand_total']],
 ]){const delivered=[],tx={};auditSignal(tx,{events:{publish:async(...args)=>delivered.push(args)},action,entityType:'orders',entityId:1n,before,after});await publishSignals(tx);assert.deepEqual(delivered[0],[
 'order:updated',{order_id:'1',fields:expected},{kind:'order',id:'1'}]);}
});
test('post-commit signal retry drops rolled-back attempt; delivery error never retries mutation',async()=>{
 let attempts=0;const delivered=[],events={publish:async(...args)=>delivered.push(args)};
 const db={$transaction:async fn=>{const value=await fn({});if(++attempts===1)throw Object.assign(new Error('deadlock'),{code:'P2034'});return value;}};
 assert.equal(await withWriteTx(db,async tx=>{queueSignal(tx,events,'settings:updated',{fields:['cafe_name']},{kind:'settings'});return 7;}),7);assert.equal(attempts,2);assert.equal(delivered.length,1);
 let writes=0;const broken={publish:async()=>{throw new Error('offline');}};assert.equal(await withWriteTx({$transaction:async fn=>{writes++;return fn({});}},async tx=>{queueSignal(tx,broken,'settings:updated',{fields:[]},{kind:'settings'});return 8;}),8);assert.equal(writes,1);
});
