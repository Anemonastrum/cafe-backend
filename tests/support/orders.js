import { randomUUID } from 'node:crypto';
import { shiftFixture } from './shifts.js';
export async function orderFixture(db){
 const f=await shiftFixture(db),settings=await db.cafe_settings.findUnique({where:{id:1}});
 const category=await db.categories.create({data:{name:randomUUID()}});
 const product=await db.products.create({data:{name:'Snapshot tea',category_id:category.id,base_price:'25000'}});
 const input={client_request_id:randomUUID(),order_type:'dine_in',items:[{product_id:String(product.id),quantity:2}]};
 const normalized={...input,notes:null,discounts:[],items:[{product_id:product.id,quantity:2,variant_option_ids:[],addons:[],special_instructions:null}]};
 return{...f,product,category,input,normalized,async cleanup(){
  const orders=await db.orders.findMany({where:{cashier_id:{in:[f.adminA.id,f.adminB.id,f.cashierA.id,f.cashierB.id]}}}),order_id={in:orders.map(o=>o.id)};
  const items=await db.order_items.findMany({where:{order_id}}),order_item_id={in:items.map(i=>i.id)};
  await db.order_item_variants.deleteMany({where:{order_item_id}});await db.order_item_addons.deleteMany({where:{order_item_id}});
  await db.order_items.deleteMany({where:{order_id}});
  for(const table of ['order_discounts','order_taxes','order_service_charges','order_status_history'])await db[table].deleteMany({where:{order_id}});
  await db.orders.deleteMany({where:{id:order_id}});await db.products.delete({where:{id:product.id}});await db.categories.delete({where:{id:category.id}});
  await db.cafe_settings.update({where:{id:1},data:{next_order_number:settings.next_order_number}});await f.cleanup();
 }};
}
