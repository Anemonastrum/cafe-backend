import { AppError } from '../utils/errors.js';
import { Decimal } from '../utils/money.js';
import { validateSelections } from './selection.service.js';
import { productView } from './products.service.js';
import { calculateQuote } from './pricing.service.js';
import * as model from '../models/order.model.js';
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
