import { AppError } from '../utils/errors.js';
import { Decimal,money } from '../utils/money.js';
import { lockCafe } from '../models/lock.model.js';
import { lockShift,shiftById } from '../models/shifts.model.js';
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
export async function captureQuote(tx,actor,input,now=new Date(),chargeRules=null){
 const settings=await model.settingsForPricing(tx),captured=[],lines=[];
 for(const [index,item] of input.items.entries()){
  const row=await model.productForPricing(tx,item.product_id);if(!row)invalid();
  const product=productView(row,now),selections=validateSelections(product,{variant_option_ids:item.variant_option_ids.map(String),addons:item.addons.map(a=>({...a,addon_option_id:String(a.addon_option_id)}))});
  let tax=await model.taxForPricing(tx,row.tax_id);if(!tax?.is_active)tax=await model.taxForPricing(tx,settings.default_tax_id);if(!tax?.is_active)tax=null;
  const rule=tax?{id:tax.id,name:tax.name,rate:tax.rate_percent,inclusive:tax.is_inclusive}:null;
  const promoReduction=product.promo_active?new Decimal(row.base_price).minus(row.promo_price):new Decimal(0);
  lines.push({key:String(index).padStart(3,'0'),quantity:item.quantity,base:row.base_price,variantTotal:selections.variant_unit_total,addonTotal:selections.addon_unit_total,promoReduction,tax:rule});
  captured.push({item,product:row,selections,tax:rule,promoReduction});
 }
 if(input.discounts.length&&actor.role!=='admin'&&!settings.cashier_can_discount)throw new AppError(403,'DISCOUNT_FORBIDDEN','Cashier discount permission required');
 const discounts=[];
 for(const {discount_id} of input.discounts){const row=await model.discountForPricing(tx,discount_id);if(!row?.is_active||(row.starts_at&&row.starts_at>now)||(row.ends_at&&row.ends_at<=now))invalid();discounts.push({key:String(row.id),id:row.id,name:row.name,calculation:row.calculation,value:row.value});}
 const charges=(chargeRules??await model.autoCharges(tx)).map(row=>({key:String(row.id),id:row.id,name:row.name,calculation:row.calculation,value:row.value}));
 return{captured,pricing:calculateQuote({lines,discounts,charges})};
}
export function quoteView(pricing){return{subtotal:pricing.subtotal,item_discount_total:pricing.itemDiscountTotal,order_discount_total:pricing.orderDiscountTotal,tax_total:pricing.taxTotal,service_charge_total:pricing.serviceChargeTotal,grand_total:pricing.grandTotal,lines:pricing.lines.map(line=>({...line,tax:line.tax?{...line.tax,rate:new Decimal(line.tax.rate).toFixed(4)}:null})),taxes:pricing.taxes.map(t=>({...t,rate:t.rate.toFixed(4)})),discounts:pricing.discounts,charges:pricing.charges};}
async function storeCapture(tx,orderId,capture,line,itemId){
 const {item,product,selections,tax,promoReduction}=capture;
 const data={product_id:product.id,product_name:product.name,sku_snapshot:product.sku,category_name:product.fk_products_category.name,quantity:item.quantity,base_unit_price:product.base_price,variant_unit_total:selections.variant_unit_total,addon_unit_total:selections.addon_unit_total,line_subtotal:line.subtotal,discount_total:line.promoDiscount,tax_total:line.taxAmount,line_total:line.lineTotal,special_instructions:item.special_instructions,pricing_snapshot:toWire({version:1,tax:tax?{...tax,rate:new Decimal(tax.rate).toFixed(4)}:null,promo_reduction:promoReduction,order_discount:line.orderDiscount})};
 if(itemId)await model.clearItemSelections(tx,itemId);
 const stored=itemId?await model.updateItem(tx,itemId,data):await model.insertItem(tx,{...data,order_id:orderId});
 if(selections.variants.length)await model.insertVariants(tx,selections.variants.map(v=>({...v,order_item_id:stored.id})));
 if(selections.addons.length)await model.insertAddons(tx,selections.addons.map(a=>({...a,order_item_id:stored.id,line_total:a.unit_price.times(a.quantity).times(item.quantity)})));
 return stored;
}
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
  for(const [index,capture] of captured.entries())await storeCapture(tx,order.id,capture,pricing.lines[index]);
  for(const d of pricing.discounts)await model.insertDiscount(tx,{order_id:order.id,discount_id:d.id,name:d.name,calculation:d.calculation,configured_value:d.value,amount:d.amount,applied_by_user_id:user.id});
  for(const t of pricing.taxes)await model.insertTax(tx,{order_id:order.id,tax_id:t.id,name:t.name,rate_percent:t.rate,is_inclusive:t.inclusive,taxable_amount:t.taxableAmount,tax_amount:t.taxAmount});
  for(const c of pricing.charges)await model.insertCharge(tx,{order_id:order.id,service_charge_id:c.id,name:c.name,calculation:c.calculation,configured_value:c.value,amount:c.amount});
  await model.insertInitialHistory(tx,{order_id:order.id,to_status:'pending',changed_by_user_id:user.id});
  await appendAudit(tx,{actor:user,action:'orders.create',entityType:'orders',entityId:order.id,after:{order_number:number,grand_total:pricing.grandTotal},context});
  return{order:await getOrder(tx,user,order.id),replay:false};
 });
}
const conflict=()=>{throw new AppError(409,'ORDER_CONFLICT','Order state does not permit this action');};
export async function assertEditable(tx,order){if(order.payment_status==='paid'||['cancelled','completed'].includes(order.status)||await model.pendingAttempt(tx,order.id))conflict();}
async function mutation(db,actor,id,context,action,fn,{paidPreparation=false,reprice=true}={}){
 return withWriteTx(db,async tx=>{
  await lockCafe(tx);const hint=scoped(actor,await model.orderById(tx,id));
  const {user}=await lockedActor(tx,actor,[hint.cashier_id]);
  const shiftHint=hint.shift_id?await shiftById(tx,hint.shift_id):null;
  if(shiftHint)await lockRegister(tx,shiftHint.cash_register_id);
  const shift=shiftHint?await lockShift(tx,shiftHint.id):null;
  const order=await lockOrderForActor(tx,user,id);
  if(!(paidPreparation&&order.payment_status==='paid')&&(!shift||shift.status!=='open'))conflict();
  if(!paidPreparation)await assertEditable(tx,order);
  const changed=await fn(tx,user,order);
  if(changed!==false){
   if(reprice)await repriceOrder(tx,id);
   await appendAudit(tx,{actor:user,action,entityType:'orders',entityId:id,before:{status:order.status,grand_total:order.grand_total,is_held:order.is_held},after:await model.orderById(tx,id),context});
  }
  return getOrder(tx,user,id);
 });
}
function snapshotLine(item){
 const s=item.pricing_snapshot;
 if(!s||s.version!==1||typeof s.promo_reduction!=='string'||typeof s.order_discount!=='string'||(s.tax!==null&&(!s.tax||typeof s.tax.id!=='string'||typeof s.tax.name!=='string'||typeof s.tax.rate!=='string'||typeof s.tax.inclusive!=='boolean')))throw new AppError(409,'INVALID_SNAPSHOT','Captured pricing snapshot required');
 return{key:String(item.id).padStart(20,'0'),quantity:item.quantity,base:item.base_unit_price,variantTotal:item.variant_unit_total,addonTotal:item.addon_unit_total,promoReduction:money(s.promo_reduction),tax:s.tax?{...s.tax,id:BigInt(s.tax.id),rate:new Decimal(s.tax.rate)}:null};
}
async function repriceOrder(tx,id){
 const row=await model.orderDetail(tx,id),items=row.fk_order_items_order_back;
 const pricing=calculateQuote({lines:items.map(snapshotLine),discounts:row.fk_order_discount_order_back.map(d=>({key:String(d.id),id:d.id,name:d.name,calculation:d.calculation,value:d.configured_value})),charges:row.fk_order_charge_order_back.map(c=>({key:String(c.id),id:c.id,name:c.name,calculation:c.calculation,value:c.configured_value}))});
 for(const [index,item] of items.entries()){
  const line=pricing.lines[index];await model.updateItem(tx,item.id,{line_subtotal:line.subtotal,discount_total:line.promoDiscount,tax_total:line.taxAmount,line_total:line.lineTotal,pricing_snapshot:{...item.pricing_snapshot,order_discount:line.orderDiscount.toFixed(2)}});
  for(const addon of item.fk_item_addon_item_back)await model.updateItemAddon(tx,addon.id,{line_total:new Decimal(addon.unit_price).times(addon.quantity).times(item.quantity)});
 }
 for(const d of pricing.discounts)await model.updateDiscount(tx,d.id,{amount:d.amount});
 for(const c of pricing.charges)await model.updateCharge(tx,c.id,{amount:c.amount});
 await model.clearTaxes(tx,id);
 for(const t of pricing.taxes)await model.insertTax(tx,{order_id:id,tax_id:t.id,name:t.name,rate_percent:t.rate,is_inclusive:t.inclusive,taxable_amount:t.taxableAmount,tax_amount:t.taxAmount});
 const {lines,taxes,discounts,charges,...totals}=quoteView(pricing);await model.updateOrder(tx,id,totals);
}
function itemInOrder(row,itemId){const item=row.fk_order_items_order_back.find(i=>i.id===itemId);if(!item)throw new AppError(404,'NOT_FOUND','Not found');return item;}
export const editOrder=(db,actor,{id,patch},context)=>mutation(db,actor,id,context,'orders.edit',(tx)=>model.updateOrder(tx,id,patch));
export const setHeld=(db,actor,{id,is_held},context)=>mutation(db,actor,id,context,is_held?'orders.hold':'orders.resume',async tx=>{const row=await model.orderById(tx,id);if(row.is_held===is_held)return false;await model.updateOrder(tx,id,{is_held});},{reprice:false});
export const addItem=(db,actor,{id,item},context)=>mutation(db,actor,id,context,'orders.item.add',async(tx,user)=>{
 const row=await model.orderDetail(tx,id);if(row.fk_order_items_order_back.length>=100)throw new AppError(422,'INVALID_LINES','Maximum 100 order lines');
 const {captured,pricing}=await captureQuote(tx,user,{items:[item],discounts:[]},new Date(),[]);await storeCapture(tx,id,captured[0],pricing.lines[0]);
});
export const editItem=(db,actor,{id,itemId,patch},context)=>mutation(db,actor,id,context,'orders.item.edit',async(tx,user)=>{
 const row=await model.orderDetail(tx,id),item=itemInOrder(row,itemId);
 if('variant_option_ids' in patch||'addons' in patch){
  const input={product_id:item.product_id,quantity:item.quantity,variant_option_ids:item.fk_item_variant_item_back.map(v=>v.variant_option_id),addons:item.fk_item_addon_item_back.map(a=>({addon_option_id:a.addon_option_id,quantity:a.quantity})),special_instructions:item.special_instructions,...patch};
  const {captured,pricing}=await captureQuote(tx,user,{items:[input],discounts:[]},new Date(),[]);await storeCapture(tx,id,captured[0],pricing.lines[0],itemId);
 }else await model.updateItem(tx,itemId,patch);
});
export const removeItem=(db,actor,{id,itemId},context)=>mutation(db,actor,id,context,'orders.item.remove',async tx=>{itemInOrder(await model.orderDetail(tx,id),itemId);await model.deleteItem(tx,itemId);});
async function discountPermission(tx,user){const settings=await model.settingsForPricing(tx);if(user.role!=='admin'&&!settings.cashier_can_discount)throw new AppError(403,'DISCOUNT_FORBIDDEN','Cashier discount permission required');}
export const applyDiscount=(db,actor,{id,discount},context)=>mutation(db,actor,id,context,'orders.discount.add',async(tx,user)=>{
 await discountPermission(tx,user);const row=await model.orderDetail(tx,id);if(row.fk_order_discount_order_back.length>=100)throw new AppError(422,'INVALID_DISCOUNT','Maximum 100 discounts');
 let rule=discount,discount_id=null;
 if(discount.discount_id){
  discount_id=discount.discount_id;rule=await model.discountForPricing(tx,discount_id);const now=new Date();if(!rule?.is_active||(rule.starts_at&&rule.starts_at>now)||(rule.ends_at&&rule.ends_at<=now))invalid();
  if(row.fk_order_discount_order_back.some(d=>d.discount_id===discount_id))conflict();
 }
 await model.insertDiscount(tx,{order_id:id,discount_id,name:rule.name,calculation:rule.calculation,configured_value:rule.value,amount:0,applied_by_user_id:user.id,approved_by_user_id:user.role==='admin'?user.id:null});
});
export const removeDiscount=(db,actor,{id,discountId},context)=>mutation(db,actor,id,context,'orders.discount.remove',async(tx,user)=>{
 await discountPermission(tx,user);const row=await model.orderDetail(tx,id);if(!row.fk_order_discount_order_back.some(d=>d.id===discountId))throw new AppError(404,'NOT_FOUND','Not found');await model.deleteDiscount(tx,discountId);
});
export const changeStatus=(db,actor,{id,status},context)=>mutation(db,actor,id,context,'orders.status',async(tx,user,order)=>{
 if(order.status==='cancelled')conflict();
 if(order.status===status)return false;
 const states=['pending','preparing','ready','completed'];
 if(states.indexOf(status)!==states.indexOf(order.status)+1||order.is_held||(status==='completed'&&order.payment_status!=='paid'))conflict();
 await model.updateOrder(tx,id,{status,...(status==='completed'?{completed_at:new Date()}:{})});
 await model.insertInitialHistory(tx,{order_id:id,from_status:order.status,to_status:status,changed_by_user_id:user.id});
},{paidPreparation:true,reprice:false});
export const cancelOrder=(db,actor,{id,reason},context)=>mutation(db,actor,id,context,'orders.cancel',async(tx,user,order)=>{
 if(order.status==='cancelled')return false;
 await assertEditable(tx,order);const settings=await model.settingsForPricing(tx);
 if(user.role!=='admin'&&!settings.cashier_can_cancel)throw new AppError(403,'CANCEL_FORBIDDEN','Cashier cancellation permission required');
 await model.updateOrder(tx,id,{status:'cancelled',cancelled_at:new Date(),cancel_reason:reason,cancelled_by_user_id:user.id,cancel_approved_by_user_id:user.role==='admin'?user.id:null});
 await model.insertInitialHistory(tx,{order_id:id,from_status:order.status,to_status:'cancelled',changed_by_user_id:user.id,notes:reason});
},{paidPreparation:true,reprice:false});
export async function listOrderHistory(db,actor,id){scoped(actor,await model.orderById(db,id));return model.historyRows(db,id);}
