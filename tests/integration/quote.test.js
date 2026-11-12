import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { optionFixture } from '../support/options.js';
test('p07-t1 acceptance: server quote uses visible catalog, permission and snapshot without writes or shift',async()=>withDatabase(async db=>{
 const f=await optionFixture(db),{api,product,cashier}=f,discounts=[];
 try{
  const input={order_type:'dine_in',items:[{product_id:String(product.id),quantity:2}]},before=await db.orders.count();
  assert.equal((await api('/orders/quote','POST',input,{})).status,401);
  assert.equal((await api('/orders/quote','POST',input,{cookie:cashier.cookie})).status,403);
  const quote=await api('/orders/quote','POST',input,cashier);assert.equal(quote.status,200);assert.equal(quote.body.data.subtotal,'200.00');
  assert.equal(await db.orders.count(),before);assert.equal(await db.cashier_shifts.count({where:{cashier_id:f.cashierA.id,status:'open'}}),0);
  for(const patch of [{grand_total:'1'},{cashier_id:String(f.adminA.id)},{items:[]},{items:[{product_id:String(product.id),quantity:0}]},{items:[{product_id:String(product.id),quantity:1,price:'1'}]},{items:[{product_id:String(f.hidden.id),quantity:1}]},{items:[{product_id:String(product.id),quantity:1,variant_option_ids:['18446744073709551615']}]}])assert.equal((await api('/orders/quote','POST',{...input,...patch},cashier)).status,422);
  const discount=await db.discounts.create({data:{name:randomUUID(),calculation:'percent',value:'10'}});discounts.push(discount.id);
  const discounted={...input,discounts:[{discount_id:String(discount.id)}]};
  const settings=await db.cafe_settings.findUnique({where:{id:1}});
  try{await db.cafe_settings.update({where:{id:1},data:{cashier_can_discount:false}});assert.equal((await api('/orders/quote','POST',discounted,cashier)).status,403);
   await db.cafe_settings.update({where:{id:1},data:{cashier_can_discount:true}});assert.equal((await api('/orders/quote','POST',discounted,cashier)).body.data.order_discount_total,'20.00');
  }finally{await db.cafe_settings.update({where:{id:1},data:{cashier_can_discount:settings.cashier_can_discount}});}
  await db.categories.update({where:{id:f.category.id},data:{is_active:false}});
  assert.equal((await api('/orders/quote','POST',input)).status,422);
 }finally{await db.discounts.deleteMany({where:{id:{in:discounts}}});await f.cleanup();}
}));
