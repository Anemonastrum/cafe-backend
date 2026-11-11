import { randomUUID } from 'node:crypto';
import { fixture, testConfig } from './fixtures.js';
import { startApp, request, loginAs } from './http.js';
export async function optionFixture(db) {
  const f=await fixture(db),config=testConfig(),h=await startApp({db,config});
  const category=await db.categories.create({data:{name:randomUUID()}});
  const product=await db.products.create({data:{category_id:category.id,name:'Tea',base_price:'100.00'}});
  const hidden=await db.products.create({data:{category_id:category.id,name:'Hidden',base_price:'100.00',is_enabled:false}});
  const admin=await loginAs(h,f.adminA.username,f.password),cashier=await loginAs(h,f.cashierA.username,f.password);
  const api=(path,method='GET',body,session=admin)=>request(h,{path,method,body,...session,headers:{Origin:config.allowedOrigin}});
  const order=await db.orders.create({data:{order_number:randomUUID(),client_request_id:randomUUID(),cashier_id:f.cashierA.id,order_type:'dine_in'}});
  const item=await db.order_items.create({data:{order_id:order.id,product_id:product.id,product_name:'Tea',category_name:category.name,quantity:1,base_unit_price:'100',line_subtotal:'100',line_total:'100'}});
  return {...f,product,hidden,category,item,api,admin,cashier,async cleanup(){
    await db.order_item_variants.deleteMany({where:{order_item_id:item.id}});await db.order_item_addons.deleteMany({where:{order_item_id:item.id}});
    await db.order_items.delete({where:{id:item.id}});await db.orders.delete({where:{id:order.id}});
    const product_id={in:[product.id,hidden.id]};
    const variants=await db.product_variant_groups.findMany({where:{product_id}}),addons=await db.product_addon_groups.findMany({where:{product_id}});
    await db.product_variant_options.deleteMany({where:{group_id:{in:variants.map(x=>x.id)}}});await db.product_addon_options.deleteMany({where:{group_id:{in:addons.map(x=>x.id)}}});
    await db.product_variant_groups.deleteMany({where:{product_id}});await db.product_addon_groups.deleteMany({where:{product_id}});await db.products.deleteMany({where:{id:product_id}});await db.categories.delete({where:{id:category.id}});
    await h.close();await f.cleanup();
  }};
}
export async function mutationGuards(f,writes){
  for(const [path,method] of writes){
    const assert=(await import('node:assert/strict')).default;
    assert.equal((await f.api(path,method,{},{})).status,401);
    assert.equal((await f.api(path,method,{},f.cashier)).status,403);
    assert.equal((await f.api(path,method,{}, {cookie:f.admin.cookie})).status,403);
  }
}
