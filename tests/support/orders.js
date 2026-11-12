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
  const payments=await db.payments.findMany({where:{order_id}}),payment_id={in:payments.map(p=>p.id)};
  const receipts=await db.receipts.findMany({where:{payment_id}});await db.receipt_events.deleteMany({where:{receipt_id:{in:receipts.map(r=>r.id)}}});await db.receipts.deleteMany({where:{payment_id}});await db.payment_events.deleteMany({where:{payment_id}});await db.payments.deleteMany({where:{order_id}});
  const items=await db.order_items.findMany({where:{order_id}}),order_item_id={in:items.map(i=>i.id)};
  await db.order_item_variants.deleteMany({where:{order_item_id}});await db.order_item_addons.deleteMany({where:{order_item_id}});
  await db.order_items.deleteMany({where:{order_id}});
  for(const table of ['order_discounts','order_taxes','order_service_charges','order_status_history'])await db[table].deleteMany({where:{order_id}});
  await db.orders.deleteMany({where:{id:order_id}});
  const variantGroups=await db.product_variant_groups.findMany({where:{product_id:product.id}}),addonGroups=await db.product_addon_groups.findMany({where:{product_id:product.id}});
  await db.product_variant_options.deleteMany({where:{group_id:{in:variantGroups.map(g=>g.id)}}});await db.product_addon_options.deleteMany({where:{group_id:{in:addonGroups.map(g=>g.id)}}});
  await db.product_variant_groups.deleteMany({where:{product_id:product.id}});await db.product_addon_groups.deleteMany({where:{product_id:product.id}});
  await db.products.delete({where:{id:product.id}});await db.categories.delete({where:{id:category.id}});
  await db.cafe_settings.update({where:{id:1},data:{next_order_number:settings.next_order_number}});await f.cleanup();
 }};
}
