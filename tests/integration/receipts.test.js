import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p09-t1 acceptance: scoped immutable receipt, safe print and reprint history',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),settings=await db.cafe_settings.findUnique({where:{id:1}});
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const input={...f.input,client_request_id:randomUUID(),notes:'<script>alert(1)</script>\n'+'long note '.repeat(390),items:[{product_id:String(f.product.id),quantity:3,special_instructions:'<img src=x onerror=alert(2)>'}]};
  const created=await f.api('/orders','POST',input,f.cashier);assert.equal(created.status,201);const order=created.body.data;
  assert.equal((await f.api('/orders/'+order.id+'/receipt','GET',undefined,f.cashier)).status,404);
  const paid=await request(f.h,{path:'/orders/'+order.id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(paid.status,201);
  const row=await db.receipts.findUnique({where:{payment_id:BigInt(paid.body.data.id)}}),id=String(row.id);
  const get=()=>f.api('/receipts/'+id,'GET',undefined,f.cashier);
  const original=await get();assert.equal(original.status,200,JSON.stringify(original.body));const receipt=original.body.data;
  assert.equal(receipt.order.order_number,order.order_number);assert.equal(receipt.payment.cash_received,'100000.00');assert.equal(receipt.payment.cash_change,'25000.00');assert.equal(receipt.order.grand_total,'75000.00');assert.equal(receipt.cashier_name_snapshot,f.cashierA.full_name);assert.equal(receipt.items[0].product_name,'Snapshot tea');assert.equal(receipt.pdf_url,null);
  const json=JSON.stringify(receipt);assert.ok(!json.includes('idempotency_key'));assert.ok(!json.includes('request_hash'));assert.ok(!json.includes('token_hash'));
  assert.deepEqual((await f.api('/orders/'+order.id+'/receipt','GET',undefined,f.admin)).body.data,receipt);
  for(const path of ['/receipts/'+id,'/orders/'+order.id+'/receipt','/receipts/'+id+'/print']){
   assert.equal((await f.api(path,'GET',undefined,{})).status,401);assert.equal((await f.api(path,'GET',undefined,f.other)).status,404);
  }
  await db.users.update({where:{id:f.cashierA.id},data:{full_name:'Renamed user'}});await db.products.update({where:{id:f.product.id},data:{name:'Renamed product',base_price:'1'}});await db.categories.update({where:{id:f.category.id},data:{name:'Renamed category'}});await db.cafe_settings.update({where:{id:1},data:{cafe_name:'Renamed cafe',receipt_paper_mm:'value_58'}});
  assert.deepEqual((await get()).body.data,receipt);
  for(const width of ['58','80']){const html=await f.api('/receipts/'+id+'/print?paper_mm='+width,'GET',undefined,f.cashier);assert.equal(html.status,200);assert.match(html.headers.get('content-type'),/text\/html/);assert.match(html.body,new RegExp(width+'mm'));assert.match(html.body,/75000.00/);assert.match(html.body,/&lt;script&gt;/);assert.match(html.body,/&lt;img/);assert.ok(!html.body.includes('<script'));assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);assert.match(html.headers.get('cache-control'),/no-store/);}
  const print=await f.api('/receipts/'+id+'/print','GET',undefined,f.admin);assert.match(print.body,new RegExp((row.paper_mm==='value_58'?'58':'80')+'mm'));
  for(const suffix of ['?paper_mm=90','?paper_mm=058','?unknown=x','?paper_mm=58&paper_mm=80'])assert.equal((await f.api('/receipts/'+id+'/print'+suffix)).status,422);
  assert.equal((await f.api('/receipts/'+id+'?paper_mm=80')).status,422);
  assert.equal((await f.api('/receipts/'+id+'/reprint','POST',undefined,{})).status,401);assert.equal((await f.api('/receipts/'+id+'/reprint','POST',undefined,{cookie:f.cashier.cookie})).status,403);assert.equal((await f.api('/receipts/'+id+'/reprint','POST',undefined,f.other)).status,404);assert.equal((await f.api('/receipts/'+id+'/reprint','POST',{unexpected:true},f.cashier)).status,422);
  const reprint=await f.api('/receipts/'+id+'/reprint','POST',undefined,f.cashier);assert.equal(reprint.status,200);assert.match(reprint.body,/75000.00/);assert.equal(await db.receipts.count({where:{payment_id:row.payment_id}}),1);
  const path='/admin/receipts/'+id+'/events';assert.equal((await f.api(path,'GET',undefined,{})).status,401);assert.equal((await f.api(path,'GET',undefined,f.cashier)).status,403);
  const events=(await f.api(path)).body;assert.equal(events.meta.total,4);assert.deepEqual(events.data.map(e=>e.action),['print','print','print','reprint']);assert.equal(events.data[0].acted_by_user_id,String(f.cashierA.id));assert.equal(events.data[2].acted_by_user_id,String(f.adminA.id));assert.equal(events.data[3].acted_by_user_id,String(f.cashierA.id));
  const page=(await f.api(path+'?limit=1&page=2&sort_by=created_at&sort_order=desc')).body;assert.equal(page.meta.total,4);assert.equal(page.data[0].id,events.data[2].id);assert.equal((await f.api(path+'?unknown=x')).status,422);
  await db.receipt_events.deleteMany({where:{receipt_id:row.id}});await db.receipts.delete({where:{id:row.id}});const missing=await f.api('/orders/'+order.id+'/receipt','GET',undefined,f.cashier);assert.equal(missing.status,500);assert.equal(missing.body.error.code,'RECEIPT_INTEGRITY');assert.equal(await db.receipts.count({where:{payment_id:row.payment_id}}),0);
 }finally{await db.cafe_settings.update({where:{id:1},data:{cafe_name:settings.cafe_name,receipt_paper_mm:settings.receipt_paper_mm}});await f.cleanup();}
}));
