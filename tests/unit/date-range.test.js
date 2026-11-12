import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRange } from '../../src/utils/date-range.js';
test('report ranges reject Jakarta dates beyond four-digit calendar',()=>{
 for(const range of [
  {from:'9999-12-31T20:00:00Z',to:'9999-12-31T23:00:00Z'},
  {from:'9999-12-31T16:00:00Z',to:'9999-12-31T18:00:00Z'}
 ])assert.throws(()=>parseRange(range),{code:'INVALID_RANGE',status:422});
 assert.equal(parseRange({from:'9999-12-30T17:00:00Z',to:'9999-12-31T16:59:59.999Z'}).to.toISOString(),'9999-12-31T16:59:59.999Z');
});
