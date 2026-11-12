import { AppError } from '../utils/errors.js';
import { Decimal } from '../utils/money.js';
import { validateSelections } from './selection.service.js';
import { productView } from './products.service.js';
import { calculateQuote } from './pricing.service.js';
import * as model from '../models/order.model.js';
import { withWriteTx } from '../utils/transaction.js';
import { canonicalHash } from '../utils/idempotency.js';
import { toWire } from '../utils/serialize.js';
import { lockedActor } from './auth.service.js';
import { requireOpenShift } from './shifts.service.js';
import { lockRegister } from '../models/register.model.js';
import { ownOpenShift } from '../models/shifts.model.js';
import { nextOrderNumber } from '../helpers/order-number.helper.js';
import { appendAudit } from './audit.service.js';
const invalid=()=>{throw new AppError(422,'INVALID_CATALOG','Product, option or discount unavailable');};
export async function captureQuote(tx,actor,input,now=new Date()){
 const settings=await model.settingsForPricing(tx),captured=[],lines=[];
 for(const [index,item] of input.items.entries()){
  const row=await model.productForPricing(tx,item.product_id);if(!row)invalid();
  const product=productView(row,now),selections=validateSelections(product,{variant_option_ids:item.variant_option_ids,addons:item.addons});
  let tax=await model.taxForPricing(tx,row.tax_id);if(!tax?.is_active)tax=await model.taxForPricing(tx,settings.default_tax_id);if(!tax?.is_active)tax=null;
  const rule=tax?{id:tax.id,name:tax.name,rate:tax.rate_percent,inclusive:tax.is_inclusive}:null;
  const promoReduction=product.promo_active?new Decimal(row.base_price).minus(row.promo_price):new Decimal(0);
  lines.push({key:String(index).padStart(3,'0'),quantity:item.quantity,base:row.base_price,variantTotal:selections.variant_unit_total,addonTotal:selections.addon_unit_total,promoReduction,tax:rule});
  captured.push({item,product:row,selections,tax:rule,promoReduction});
 }
 if(input.discounts.length&&actor.role!=='admin'&&!settings.cashier_can_discount)throw new AppError(403,'DISCOUNT_FORBIDDEN','Cashier discount permission required');
 const discounts=[];
 for(const {discount_id} of input.discounts){const row=await model.discountForPricing(tx,discount_id);if(!row?.is_active||(row.starts_at&&row.starts_at>now)||(row.ends_at&&row.ends_at<=now))invalid();discounts.push({key:String(row.id),id:row.id,name:row.name,calculation:row.calculation,value:row.value});}
 const charges=(await model.autoCharges(tx)).map(row=>({key:String(row.id),id:row.id,name:row.name,calculation:row.calculation,value:row.value}));
 return{captured,pricing:calculateQuote({lines,discounts,charges})};
}
export function quoteView(pricing){return{subtotal:pricing.subtotal,item_discount_total:pricing.itemDiscountTotal,order_discount_total:pricing.orderDiscountTotal,tax_total:pricing.taxTotal,service_charge_total:pricing.serviceChargeTotal,grand_total:pricing.grandTotal,lines:pricing.lines,taxes:pricing.taxes.map(t=>({...t,rate:t.rate.toFixed(4)})),discounts:pricing.discounts,charges:pricing.charges};}
export async function quoteOrder(db,actor,input){return db.$transaction(async tx=>quoteView((await captureQuote(tx,actor,input)).pricing),{isolationLevel:'RepeatableRead'});}
function scoped(actor,row){if(!row||(actor.role!=='admin'&&row.cashier_id!==actor.id))throw new AppError(404,'NOT_FOUND','Not found');return row;}
function orderView(row){
 const {request_hash,fk_order_items_order_back,fk_order_discount_order_back,fk_order_tax_order_back,fk_order_charge_order_back,fk_order_history_order_back,fk_payments_order_back,...order}=row;
 return{...order,items:fk_order_items_order_back.map(({fk_item_variant_item_back,fk_item_addon_item_back,...item})=>({...item,variants:fk_item_variant_item_back,addons:fk_item_addon_item_back})),discounts:fk_order_discount_order_back,taxes:fk_order_tax_order_back.map(t=>({...t,rate_percent:t.rate_percent.toFixed(4)})),service_charges:fk_order_charge_order_back,history:fk_order_history_order_back,payments:fk_payments_order_back};
}
export async function getOrder(db,actor,id){return orderView(scoped(actor,await model.orderDetail(db,id)));}
export async function lockOrderForActor(tx,actor,id){return scoped(actor,await model.lockOrder(tx,id));}
export async function listOrders(db,actor,q){const {data,total}=await model.orderRows(db,actor,q);return{data:data.map(({request_hash,...row})=>row),meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}};}
export const listActiveOrders=(db,actor,q)=>listOrders(db,actor,{...q,active:true});
export async function createOrder(db,actor,input,context){
 const hash=canonicalHash({operation:'orders.create',actor:actor.id,input});
 return withWriteTx(db,async tx=>{
  const {user}=await lockedActor(tx,actor),existing=await model.orderByKey(tx,input.client_request_id);
  if(existing){if(existing.cashier_id!==user.id||existing.request_hash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Request key already used');return{order:await getOrder(tx,user,existing.id),replay:true};}
  const hint=await ownOpenShift(tx,user.id);if(hint)await lockRegister(tx,hint.cash_register_id);
  const shift=await requireOpenShift(tx,user.id),{captured,pricing}=await captureQuote(tx,user,input);
  const number=await nextOrderNumber(tx),totals=quoteView(pricing);
  const order=await model.insertOrder(tx,{client_request_id:input.client_request_id,request_hash:hash,order_number:number,cashier_id:user.id,shift_id:shift.id,order_type:input.order_type,notes:input.notes,subtotal:totals.subtotal,item_discount_total:totals.item_discount_total,order_discount_total:totals.order_discount_total,tax_total:totals.tax_total,service_charge_total:totals.service_charge_total,grand_total:totals.grand_total});
  for(const [index,capture] of captured.entries()){
   const {item,product,selections,tax,promoReduction}=capture,line=pricing.lines[index];
   const stored=await model.insertItem(tx,{order_id:order.id,product_id:product.id,product_name:product.name,sku_snapshot:product.sku,category_name:product.fk_products_category.name,quantity:item.quantity,base_unit_price:product.base_price,variant_unit_total:selections.variant_unit_total,addon_unit_total:selections.addon_unit_total,line_subtotal:line.subtotal,discount_total:line.promoDiscount,tax_total:line.taxAmount,line_total:line.lineTotal,special_instructions:item.special_instructions,pricing_snapshot:toWire({version:1,tax:tax?{...tax,rate:tax.rate.toFixed(4)}:null,promo_reduction:promoReduction,order_discount:line.orderDiscount})});
   if(selections.variants.length)await model.insertVariants(tx,selections.variants.map(v=>({...v,order_item_id:stored.id})));
   if(selections.addons.length)await model.insertAddons(tx,selections.addons.map(a=>({...a,order_item_id:stored.id,line_total:a.unit_price.times(a.quantity).times(item.quantity)})));
  }
  for(const d of pricing.discounts)await model.insertDiscount(tx,{order_id:order.id,discount_id:d.id,name:d.name,calculation:d.calculation,configured_value:d.value,amount:d.amount,applied_by_user_id:user.id});
  for(const t of pricing.taxes)await model.insertTax(tx,{order_id:order.id,tax_id:t.id,name:t.name,rate_percent:t.rate,is_inclusive:t.inclusive,taxable_amount:t.taxableAmount,tax_amount:t.taxAmount});
  for(const c of pricing.charges)await model.insertCharge(tx,{order_id:order.id,service_charge_id:c.id,name:c.name,calculation:c.calculation,configured_value:c.value,amount:c.amount});
  await model.insertInitialHistory(tx,{order_id:order.id,to_status:'pending',changed_by_user_id:user.id});
  await appendAudit(tx,{actor:user,action:'orders.create',entityType:'orders',entityId:order.id,after:{order_number:number,grand_total:pricing.grandTotal},context});
  return{order:await getOrder(tx,user,order.id),replay:false};
 });
}
