import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withWriteTx } from '../../src/utils/transaction.js';
import { queueSignal } from '../../src/utils/signals.js';
test('post-commit signal retry drops rolled-back attempt; delivery error never retries mutation',async()=>{
 let attempts=0;const delivered=[],events={publish:async(...args)=>delivered.push(args)};
 const db={$transaction:async fn=>{const value=await fn({});if(++attempts===1)throw Object.assign(new Error('deadlock'),{code:'P2034'});return value;}};
 assert.equal(await withWriteTx(db,async tx=>{queueSignal(tx,events,'settings:updated',{fields:['cafe_name']},{kind:'settings'});return 7;}),7);assert.equal(attempts,2);assert.equal(delivered.length,1);
 let writes=0;const broken={publish:async()=>{throw new Error('offline');}};assert.equal(await withWriteTx({$transaction:async fn=>{writes++;return fn({});}},async tx=>{queueSignal(tx,broken,'settings:updated',{fields:[]},{kind:'settings'});return 8;}),8);assert.equal(writes,1);
});
