import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
test('p07-t3 acceptance: captured edits, permission retention, holds and financial freeze',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),{api,cashier,other}=f,settings=await db.cafe_settings.findUnique({where:{id:1}});let id;
 try{
  await db.cafe_settings.update({where:{id:1},data:{cashier_can_discount:true}});
  await db.products.update({where:{id:f.product.id},data:{promo_price:'20000',promo_starts_at:new Date(Date.now()-60000),promo_ends_at:new Date(Date.now()+60000)}});
  const shift=(await api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},cashier)).body.data;
  const created=await api('/orders','POST',f.input,cashier);assert.equal(created.status,201);id=BigInt(created.body.data.id);
  const path='/orders/'+id,item=created.body.data.items[0],itemPath=path+'/items/'+item.id;
  const configured=await db.discounts.create({data:{name:randomUUID(),calculation:'fixed',value:'99999'}});
  try{
   const discount=await api(path+'/discounts','POST',{discount_id:String(configured.id)},cashier);assert.equal(discount.status,201);
   const applied=discount.body.data.discounts[0];assert.equal(applied.applied_by_user_id,String(f.cashierA.id));assert.equal(applied.amount,'40000.00');
   for(const [route,method,body] of [[path,'PATCH',{notes:'edited'}],[path+'/items','POST',f.input.items[0]],[itemPath,'PATCH',{quantity:1}],[itemPath,'DELETE',{}],[path+'/hold','POST',{}],[path+'/resume','POST',{}],[path+'/discounts','POST',{name:'Manual',calculation:'percent',value:'10'}],[path+'/discounts/'+applied.id,'DELETE',{}]]){
    assert.equal((await api(route,method,body,{})).status,401,route);
    assert.equal((await api(route,method,body,{cookie:cashier.cookie})).status,403,route);
    assert.equal((await api(route,method,body,other)).status,404,route);
   }
   await db.cafe_settings.update({where:{id:1},data:{cashier_can_discount:false}});
   await db.discounts.update({where:{id:configured.id},data:{is_active:false,value:'1'}});
   await db.products.update({where:{id:f.product.id},data:{base_price:'99999',is_enabled:false,promo_ends_at:new Date(Date.now()-1)}});
   const edited=await api(itemPath,'PATCH',{quantity:1,special_instructions:'warm'},cashier);assert.equal(edited.status,200);
   assert.equal(edited.body.data.items[0].base_unit_price,'25000.00');assert.equal(edited.body.data.items[0].discount_total,'5000.00');assert.equal(edited.body.data.discounts[0].amount,'20000.00');
   assert.equal((await db.order_items.findUnique({where:{id:BigInt(item.id)}})).base_unit_price.toFixed(2),'25000.00');
   assert.equal((await api(path+'/discounts','POST',{name:'x',calculation:'fixed',value:'1'},cashier)).status,403);
   assert.equal((await api(path+'/discounts/'+applied.id,'DELETE',{},cashier)).status,403);
   assert.equal((await api(path,'PATCH',{notes:'saved',order_type:'takeaway'},cashier)).body.data.items[0].base_unit_price,'25000.00');
   for(const [route,method,body] of [[path,'PATCH',{grand_total:'1'}],[itemPath,'PATCH',{base_unit_price:'1'}],[path+'/discounts','POST',{discount_id:String(configured.id),name:'mixed'}],[path+'/discounts','POST',{name:'x',calculation:'percent',value:'101'}],[path+'/discounts','POST',{name:'x',calculation:'fixed',value:'1',approved_by_user_id:String(f.adminA.id)}]])assert.equal((await api(route,method,body)).status,422);
   assert.equal((await api(path+'/hold','POST',{},cashier)).body.data.is_held,true);
   assert.equal((await api(path+'/resume','POST',{},cashier)).body.data.is_held,false);
   if(String(configured.id)!==applied.id)assert.equal((await api(path+'/discounts/'+configured.id,'DELETE',{})).status,404); // rule ID is not applied-row ID
   assert.equal((await api(path+'/discounts/'+applied.id,'DELETE',{})).status,204);
   const manual=await api(path+'/discounts','POST',{name:'Approved',calculation:'percent',value:'10'});assert.equal(manual.status,201);
   assert.equal(manual.body.data.discounts[0].approved_by_user_id,String(f.adminA.id));
   await db.products.update({where:{id:f.product.id},data:{is_enabled:true,promo_price:null}});
   const added=await api(path+'/items','POST',{product_id:String(f.product.id),quantity:1},cashier);assert.equal(added.status,201);
   assert.equal(added.body.data.items[1].base_unit_price,'99999.00');
   const second=await api('/orders','POST',{...f.input,client_request_id:randomUUID()},cashier);assert.equal(second.status,201);
   assert.equal((await api(path+'/items/'+second.body.data.items[0].id,'DELETE',{},cashier)).status,404);
   const replacement=await api(itemPath,'PATCH',{variant_option_ids:[]},cashier);assert.equal(replacement.status,200);assert.equal(replacement.body.data.items[0].base_unit_price,'99999.00');
   const method=await db.payment_methods.findFirst({where:{code:'cash'}});
   const payment=await db.payments.create({data:{order_id:id,shift_id:BigInt(shift.id),payment_method_id:method.id,payment_reference:randomUUID(),idempotency_key:randomUUID(),amount:'1',processed_by_user_id:f.cashierA.id}});
   for(const [route,method,body] of [[path,'PATCH',{notes:'frozen'}],[itemPath,'PATCH',{quantity:2}],[path+'/items','POST',f.input.items[0]],[itemPath,'DELETE',{}],[path+'/hold','POST',{}],[path+'/resume','POST',{}],[path+'/discounts','POST',{name:'x',calculation:'fixed',value:'1'}],[path+'/discounts/'+manual.body.data.discounts[0].id,'DELETE',{}]])assert.equal((await api(route,method,body)).status,409);
   await db.payments.delete({where:{id:payment.id}});
   await db.orders.update({where:{id},data:{payment_status:'paid'}});assert.equal((await api(itemPath,'PATCH',{quantity:2})).status,409);
   await db.orders.update({where:{id},data:{payment_status:'pending',status:'cancelled'}});assert.equal((await api(path+'/resume','POST',{})).status,409);
   await db.orders.update({where:{id},data:{status:'pending'}});
   for(const line of (await api(path)).body.data.items)assert.equal((await api(path+'/items/'+line.id,'DELETE',{},cashier)).status,204);
   assert.equal((await api(path)).body.data.items.length,0);
   assert.equal((await api(path)).body.data.subtotal,'0.00');
   await db.cashier_shifts.update({where:{id:BigInt(shift.id)},data:{status:'closed',closed_at:new Date()}});
   assert.equal((await api(path,'PATCH',{notes:'closed'},cashier)).status,409);
  }finally{await db.order_discounts.deleteMany({where:{discount_id:configured.id}});await db.discounts.delete({where:{id:configured.id}});}
 }finally{
  if(id)await db.payments.deleteMany({where:{order_id:id}});
  await db.cafe_settings.update({where:{id:1},data:{cashier_can_discount:settings.cashier_can_discount}});await f.cleanup();
 }
}));

test('selection replacement uses current rules; quantity retains captured options, tax and charge',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let tax,charge,vg,ag;
 try{
  tax=await db.taxes.create({data:{name:randomUUID(),rate_percent:'7.1250',is_inclusive:false}});
  charge=await db.service_charges.create({data:{name:randomUUID(),calculation:'percent',value:'10',is_auto_applied:true}});
  vg=await db.product_variant_groups.create({data:{product_id:f.product.id,name:'Size'}});
  const v=await db.product_variant_options.create({data:{group_id:vg.id,name:'Large',price_delta:'1000'}});
  ag=await db.product_addon_groups.create({data:{product_id:f.product.id,name:'Extras'}});
  const a=await db.product_addon_options.create({data:{group_id:ag.id,name:'Milk',price:'500'}});
  await db.products.update({where:{id:f.product.id},data:{tax_id:tax.id}});
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const input={...f.input,items:[{product_id:String(f.product.id),quantity:1,variant_option_ids:[String(v.id)],addons:[{addon_option_id:String(a.id),quantity:2}]}]};
  const response=await f.api('/orders','POST',input,f.cashier);assert.equal(response.status,201,JSON.stringify(response.body));const order=response.body.data,path='/orders/'+order.id+'/items/'+order.items[0].id;
  await db.product_variant_options.update({where:{id:v.id},data:{price_delta:'2000',is_enabled:false}});
  await db.product_addon_options.update({where:{id:a.id},data:{price:'900',is_enabled:false}});
  await db.taxes.update({where:{id:tax.id},data:{rate_percent:'20',is_active:false}});
  await db.service_charges.update({where:{id:charge.id},data:{value:'90',is_active:false}});
  const changed=await f.api(path,'PATCH',{quantity:3},f.cashier);assert.equal(changed.status,200);
  const item=changed.body.data.items[0];assert.equal(item.variant_unit_total,'1000.00');assert.equal(item.addon_unit_total,'1000.00');assert.equal(item.addons[0].line_total,'3000.00');
  assert.equal(item.pricing_snapshot.tax.rate,'7.1250');assert.equal(changed.body.data.taxes.find(t=>t.tax_id===String(tax.id)).rate_percent,'7.1250');
  assert.equal(changed.body.data.service_charges.find(c=>c.service_charge_id===String(charge.id)).configured_value,'10.00');
  assert.equal((await f.api(path,'PATCH',{variant_option_ids:[String(v.id)]},f.cashier)).status,422);
  assert.equal((await f.api(path,'PATCH',{quantity:0},f.cashier)).status,422);
  assert.equal((await f.api(path,'PATCH',{addons:[{addon_option_id:String(a.id),quantity:1},{addon_option_id:String(a.id),quantity:1}]},f.cashier)).status,422);
 }finally{
  await f.cleanup();
  if(tax)await db.taxes.delete({where:{id:tax.id}});if(charge)await db.service_charges.delete({where:{id:charge.id}});
 }
}));
