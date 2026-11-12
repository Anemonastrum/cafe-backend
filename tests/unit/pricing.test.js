import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateQuote } from '../../src/services/pricing.service.js';
import { money,Decimal } from '../../src/utils/money.js';
import { quoteView } from '../../src/services/orders.service.js';
import { toWire } from '../../src/utils/serialize.js';
import { canonicalHash } from '../../src/utils/idempotency.js';
test('quote line and grouped tax rates retain four decimals on wire',()=>{
 const pricing=calculateQuote({lines:[line('taxed','100',{id:1n,name:'VAT',rate:new Decimal('7.1250'),inclusive:false}),line('untaxed','10')]});
 const wire=toWire(quoteView(pricing));
 assert.equal(wire.lines[0].tax.rate,'7.1250');
 assert.equal(wire.taxes[0].rate,'7.1250');
 assert.equal(wire.lines[1].tax,null);
 assert.equal(wire.grand_total,'117.13');
});
test('empty draft repricing keeps captured fixed charge and zero merchandise',()=>{
 const result=calculateQuote({lines:[],discounts:[{key:'d',name:'Fixed',calculation:'fixed',value:'100'}],charges:[{key:'c',name:'Service',calculation:'fixed',value:'10'}]});
 assert.equal(result.subtotal.toFixed(2),'0.00');assert.equal(result.discounts[0].amount.toFixed(2),'0.00');assert.equal(result.grandTotal.toFixed(2),'10.00');
});
const line=(key,base,tax=null)=>({key,quantity:1,base,variantTotal:'0',addonTotal:'0',promoReduction:'0',tax});
test('exclusive/inclusive pricing and staged discounts preserve exact totals',()=>{
 const exclusive=calculateQuote({lines:[{...line('a','100000',{id:1n,name:'VAT',rate:'10',inclusive:false}),promoReduction:'20000'}],discounts:[{key:'d',name:'Ten',calculation:'percent',value:'10'}],charges:[{key:'c',name:'Service',calculation:'fixed',value:'12800'}]});
 assert.equal(exclusive.grandTotal.toFixed(2),'92000.00');assert.equal(exclusive.taxTotal.toFixed(2),'7200.00');
 const inclusive=calculateQuote({lines:[line('a','111000',{id:1n,name:'VAT',rate:'11',inclusive:true})]});
 assert.equal(inclusive.grandTotal.toFixed(2),'111000.00');assert.equal(inclusive.taxTotal.toFixed(2),'11000.00');
 const residual=calculateQuote({lines:['a','b','c'].map(k=>line(k,'0.01')),discounts:[{key:'d',calculation:'fixed',value:'0.02'}]});
 assert.deepEqual(residual.lines.map(l=>l.orderDiscount.toFixed(2)),['0.01','0.01','0.00']);assert.equal(residual.orderDiscountTotal.toFixed(2),'0.02');
 const mixed=calculateQuote({lines:[line('a','0.05',{id:1n,name:'VAT',rate:'10',inclusive:false}),line('b','111',{id:2n,name:'Inc',rate:'11',inclusive:true})],charges:[{key:'c',calculation:'percent',value:'10'}]});
 assert.equal(mixed.lines[0].taxAmount.toFixed(2),'0.01');assert.equal(mixed.grandTotal.toFixed(2),'122.17');
 for(const discounts of [[{calculation:'percent',value:'100'}],[{calculation:'fixed',value:'999'}]])assert.equal(calculateQuote({lines:[line('a','1')],discounts}).grandTotal.toFixed(2),'0.00');
 assert.equal(calculateQuote({lines:[line('a','0')]}).grandTotal.toFixed(2),'0.00');
});
test('pricing rejects overflow, bad percentages and negative sale unit',()=>{
 for(const value of ['-1','1000000000000','1.001',1,'NaN'])assert.throws(()=>money(value));
 assert.throws(()=>calculateQuote({lines:[{...line('a','1'),variantTotal:'-2'}]}));
 assert.throws(()=>calculateQuote({lines:[{...line('a','999999999999.99'),quantity:999}]}));
 assert.throws(()=>calculateQuote({lines:[line('a','1')],discounts:[{calculation:'percent',value:'101'}]}));
 assert.equal(canonicalHash({operation:'create',actor:1n,input:{b:'2',a:'1'}}),canonicalHash({input:{a:'1',b:'2'},actor:1n,operation:'create'}));
 assert.notEqual(canonicalHash({actor:1n}),canonicalHash({actor:2n}));
});
