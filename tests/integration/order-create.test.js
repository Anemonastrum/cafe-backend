import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
test('p07-t2 acceptance: shift-required idempotent create, captured children and scoped filters',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),{api,input,cashier,other}=f;
 try{
  assert.equal((await api('/orders','POST',input,{})).status,401);
  assert.equal((await api('/orders','POST',input,{cookie:cashier.cookie})).status,403);
  assert.equal((await api('/orders','POST',input)).status,409);
  assert.equal((await api('/orders','POST',{...input,client_request_id:'bad'},cashier)).status,422);
  const open=await api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},cashier);assert.equal(open.status,201);
  const quote=await api('/orders/quote','POST',inputWithoutKey(input),cashier);assert.equal(quote.status,200);
  const results=await Promise.all([1,2].map(()=>api('/orders','POST',input,cashier)));assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
  const order=results[0].body.data;assert.equal(order.id,results[1].body.data.id);assert.equal(order.grand_total,quote.body.data.grand_total);
  assert.equal(order.cashier_id,String(f.cashierA.id));assert.equal(order.shift_id,open.body.data.id);assert.ok(order.order_number);
  assert.equal(order.items[0].product_name,'Snapshot tea');assert.equal(order.items[0].pricing_snapshot.version,1);
  assert.equal(await db.orders.count({where:{client_request_id:input.client_request_id}}),1);
  const stored=await db.orders.findUnique({where:{id:BigInt(order.id)}});assert.match(stored.request_hash,/^[0-9a-f]{64}$/);
  assert.equal((await api('/orders','POST',{...input,notes:'changed'},cashier)).status,409);
  assert.equal((await api('/orders','POST',input,other)).status,409);
  assert.equal((await api('/orders/'+order.id,'GET',undefined,other)).status,404);
  assert.equal((await api('/orders/'+order.id,'GET',undefined,{})).status,401);
  const fetched=await api('/orders/'+order.id,'GET',undefined,cashier);assert.equal(fetched.status,200);assert.ok(!JSON.stringify(fetched.body).includes('password_hash'));
  await db.products.update({where:{id:f.product.id},data:{base_price:'999',name:'Changed',is_enabled:false}});
  assert.equal((await api('/orders','POST',input,cashier)).body.data.items[0].base_unit_price,'25000.00');
  await db.orders.update({where:{id:BigInt(order.id)},data:{status:'cancelled'}});
  assert.equal((await api('/cashier-shifts/'+open.body.data.id+'/close','POST',{},cashier)).status,200);
  assert.equal((await api('/orders','POST',input,cashier)).status,200);
  await db.products.update({where:{id:f.product.id},data:{is_enabled:true}});
  await api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[1].id)},cashier);
  const second=await api('/orders','POST',{...input,client_request_id:randomUUID()},cashier);assert.equal(second.status,201);
  assert.equal(BigInt(second.body.data.order_number.split('-').at(-1)),BigInt(order.order_number.split('-').at(-1))+1n);
  const list=await api('/orders?status=pending&payment_status=pending&order_type=dine_in&is_held=false&search='+second.body.data.order_number+'&limit=1','GET',undefined,cashier);assert.equal(list.body.meta.total,1);
  assert.equal((await api('/orders','GET',undefined,other)).body.meta.total,0);
  assert.equal((await api('/orders/active','GET',undefined,cashier)).body.data.some(o=>o.id===second.body.data.id),true);
  await db.orders.update({where:{id:BigInt(second.body.data.id)},data:{is_held:true}});
  assert.equal((await api('/orders/active','GET',undefined,cashier)).body.data.some(o=>o.id===second.body.data.id),false);
  for(const q of ['status=invalid','payment_status=x','is_held=1','from=2026-02-30T00:00:00Z','extra=1','sort_by=password'])assert.equal((await api('/orders?'+q)).status,422);
  assert.equal((await api('/orders/active?status=completed')).status,422);
  assert.equal(await db.order_status_history.count({where:{order_id:BigInt(order.id),from_status:null,to_status:'pending'}}),1);
 }finally{await f.cleanup();}
}));
function inputWithoutKey({client_request_id,...input}){return input;}
