import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p08-t1 acceptance: cash settlement, replay, immutable snapshots and shift attribution',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let originalSettings=await db.cafe_settings.findUnique({where:{id:1}});
 try{
  const shift=(await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier)).body.data;
  const create=async()=>{const r=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID(),items:[{product_id:String(f.product.id),quantity:3}]},f.cashier);assert.equal(r.status,201);return r.body.data;};
  const order=await create(),key=randomUUID(),path='/orders/'+order.id+'/payments/cash';
  const call=(route,body,k,session=f.cashier)=>request(f.h,{path:route,method:'POST',body,...session,headers:{Origin:f.config.allowedOrigin,...(k?{'Idempotency-Key':k}:{})}});
  const cash=(body,k=key,session=f.cashier)=>call(path,body,k,session);
  assert.equal((await cash({cash_received:'100000'},key,{})).status,401);
  assert.equal((await cash({cash_received:'100000'},key,{cookie:f.cashier.cookie})).status,403);
  assert.equal((await cash({cash_received:'100000'},key,f.other)).status,404);
  assert.equal((await cash({cash_received:'100000'},null)).status,422);
  assert.equal((await cash({cash_received:'100000',amount:'1'})).status,422);
  assert.equal((await cash({cash_received:'1'})).status,422);
  assert.equal((await cash({cash_received:'100000'},key,f.admin)).status,409); // admin own shift mandatory
  await db.products.update({where:{id:f.product.id},data:{base_price:'99999',is_enabled:false}});
  const paid=await cash({cash_received:'100000'});assert.equal(paid.status,201,JSON.stringify(paid.body));
  const p=paid.body.data;assert.equal(p.amount,order.grand_total);assert.equal(p.amount,'75000.00');assert.equal(p.cash_change,'25000.00');assert.equal(p.shift_id,shift.id);assert.equal(p.processed_by_user_id,String(f.cashierA.id));
  const receipt=await db.receipts.findUnique({where:{payment_id:BigInt(p.id)}});assert.equal(receipt.cashier_name_snapshot,f.cashierA.full_name);
  assert.equal((await cash({cash_received:'100000'})).status,200);assert.equal(await db.receipts.count({where:{payment_id:BigInt(p.id)}}),1);
  assert.equal((await cash({cash_received:'100001'})).status,409);assert.equal((await cash({cash_received:'100000'},randomUUID())).status,409);
  await db.users.update({where:{id:f.cashierA.id},data:{full_name:'Changed owner'}});await db.cafe_settings.update({where:{id:1},data:{cafe_name:'Changed cafe'}});
  assert.equal((await db.receipts.findUnique({where:{id:receipt.id}})).cashier_name_snapshot,f.cashierA.full_name);
  assert.equal((await db.receipts.findUnique({where:{id:receipt.id}})).cafe_name_snapshot,originalSettings.cafe_name);
  assert.equal((await f.api('/cashier-shifts/'+shift.id+'/summary','GET',undefined,f.cashier)).body.data.paid_sales_total,'75000.00');
  assert.equal((await f.api('/cashier-shifts/'+shift.id+'/close','POST',{},f.cashier)).status,200);
  assert.equal((await cash({cash_received:'100000'})).status,200);
  await db.products.update({where:{id:f.product.id},data:{base_price:'0',is_enabled:true}});
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const zero=await create();assert.equal((await call('/orders/'+zero.id+'/payments/cash',{cash_received:'0'},randomUUID())).status,201);
  const adminShift=(await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[1].id)})).body.data;
  const another=await create();const adminPay=await call('/orders/'+another.id+'/payments/cash',{cash_received:'0'},randomUUID(),f.admin);assert.equal(adminPay.status,201);assert.equal(adminPay.body.data.shift_id,adminShift.id);assert.equal(adminPay.body.data.processed_by_user_id,String(f.adminA.id));
  const held=await create();await f.api('/orders/'+held.id+'/hold','POST',{},f.cashier);assert.equal((await call('/orders/'+held.id+'/payments/cash',{cash_received:'0'},randomUUID())).status,409);
  await f.api('/orders/'+held.id+'/resume','POST',{},f.cashier);await db.orders.update({where:{id:BigInt(held.id)},data:{grand_total:'1'}});assert.equal((await call('/orders/'+held.id+'/payments/cash',{cash_received:'1'},randomUUID())).status,409);
 }finally{await db.cafe_settings.update({where:{id:1},data:{cafe_name:originalSettings.cafe_name}});await f.cleanup();}
}));
