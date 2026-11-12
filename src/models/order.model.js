import { optionInclude,visibleProduct } from './products.model.js';
export const settingsForPricing=tx=>tx.cafe_settings.findUnique({where:{id:1}});
export const productForPricing=(tx,id)=>tx.products.findFirst({where:{id,...visibleProduct},include:{...optionInclude,fk_products_category:true}});
export const taxForPricing=(tx,id)=>id==null?null:tx.taxes.findUnique({where:{id}});
export const discountForPricing=(tx,id)=>tx.discounts.findUnique({where:{id}});
export const autoCharges=tx=>tx.service_charges.findMany({where:{is_active:true,is_auto_applied:true},orderBy:{id:'asc'}});
export const orderByKey=(tx,key)=>tx.orders.findUnique({where:{client_request_id:key}});
export const orderById=(tx,id)=>tx.orders.findUnique({where:{id}});
export async function lockOrder(tx,id){await tx.$queryRaw`SELECT id FROM orders WHERE id=${id} FOR UPDATE`;return orderById(tx,id);}
const detailInclude={
 fk_order_items_order_back:{orderBy:{id:'asc'},include:{fk_item_variant_item_back:{orderBy:{id:'asc'}},fk_item_addon_item_back:{orderBy:{id:'asc'}}}},
 fk_order_discount_order_back:{orderBy:{id:'asc'}},fk_order_tax_order_back:{orderBy:{id:'asc'}},fk_order_charge_order_back:{orderBy:{id:'asc'}},
 fk_order_history_order_back:{orderBy:{id:'asc'}},fk_payments_order_back:{orderBy:{id:'asc'},select:{id:true,payment_reference:true,amount:true,status:true,provider:true,payment_method_id:true,processed_by_user_id:true,shift_id:true,created_at:true,paid_at:true}},
};
export const orderDetail=(tx,id)=>tx.orders.findUnique({where:{id},include:detailInclude});
export function orderWhere(actor,q){return{
 ...(actor.role==='cashier'?{cashier_id:actor.id}:{}),
 ...(q.active?{status:{in:['pending','preparing','ready']},is_held:false}:{...(q.status?{status:q.status}:{}),...(q.is_held!==undefined?{is_held:q.is_held}:{})}),
 ...(q.payment_status?{payment_status:q.payment_status}:{}),...(q.order_type?{order_type:q.order_type}:{}),
 ...(q.search?{OR:[{order_number:{contains:q.search}},{notes:{contains:q.search}}]}:{}),
 ...(q.from||q.to?{created_at:{...(q.from?{gte:q.from}:{}),...(q.to?{lt:q.to}:{})}}:{}),
};}
export async function orderRows(db,actor,q){const where=orderWhere(actor,q);return db.$transaction(async tx=>({data:await tx.orders.findMany({where,skip:q.skip,take:q.limit,orderBy:q.active?[{created_at:'asc'},{id:'asc'}]:q.orderBy}),total:await tx.orders.count({where})}),{isolationLevel:'RepeatableRead'});}
export const insertOrder=(tx,data)=>tx.orders.create({data});
export const insertItem=(tx,data)=>tx.order_items.create({data});
export const insertVariants=(tx,data)=>tx.order_item_variants.createMany({data});
export const insertAddons=(tx,data)=>tx.order_item_addons.createMany({data});
export const insertDiscount=(tx,data)=>tx.order_discounts.create({data});
export const insertTax=(tx,data)=>tx.order_taxes.create({data});
export const insertCharge=(tx,data)=>tx.order_service_charges.create({data});
export const insertInitialHistory=(tx,data)=>tx.order_status_history.create({data});
