import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { promoActive } from '../validators/products.validator.js';
const invalid=()=>{throw new AppError(422,'INVALID_SELECTION','Invalid product selection');};
export function validateSelections(product,selection={}){
 if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(k=>!['variant_option_ids','addons'].includes(k)))invalid();
 const ids=selection.variant_option_ids??[];if(!Array.isArray(ids))invalid();
 const groups=product.variant_groups??[],variants=[],seen=new Set(),selectedGroups=new Set();let variant_unit_total=new Prisma.Decimal(0);
 for(const value of ids){
  const id=parseId(value),key=id.toString();if(seen.has(key))invalid();seen.add(key);
  const group=groups.find(g=>g.options.some(o=>o.id.toString()===key));if(!group||selectedGroups.has(group.id.toString()))invalid();
  const option=group.options.find(o=>o.id.toString()===key);if(!option.is_enabled)invalid();selectedGroups.add(group.id.toString());
  variant_unit_total=variant_unit_total.plus(option.price_delta);
  variants.push({variant_option_id:id,group_name:group.name,option_name:option.name,price_delta:new Prisma.Decimal(option.price_delta)});
 }
 if(groups.some(g=>g.is_required&&!selectedGroups.has(g.id.toString())))invalid();
 const base=(product.promo_active??promoActive(product))?product.promo_price:product.base_price;
 if(new Prisma.Decimal(base).plus(variant_unit_total).lt(0))invalid();
 const input=selection.addons??[];if(!Array.isArray(input))invalid();
 const addonGroups=product.addon_groups??[],addons=[],addonSeen=new Set(),quantities=new Map();let addon_unit_total=new Prisma.Decimal(0);
 for(const entry of input){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['addon_option_id','quantity'].includes(k))||!Number.isInteger(entry.quantity)||entry.quantity<1||entry.quantity>999)invalid();
  const id=parseId(entry.addon_option_id),key=id.toString();if(addonSeen.has(key))invalid();addonSeen.add(key);
  const group=addonGroups.find(g=>g.options.some(o=>o.id.toString()===key));if(!group)invalid();
  const option=group.options.find(o=>o.id.toString()===key);if(!option.is_enabled)invalid();
  quantities.set(group.id.toString(),(quantities.get(group.id.toString())??0)+entry.quantity);
  const unit_price=new Prisma.Decimal(option.price);addon_unit_total=addon_unit_total.plus(unit_price.times(entry.quantity));
  addons.push({addon_option_id:id,group_name:group.name,option_name:option.name,quantity:entry.quantity,unit_price});
 }
 for(const group of addonGroups){const total=quantities.get(group.id.toString())??0;if(total<group.min_select||total>group.max_select)invalid();}
 return{variants,variant_unit_total,addons,addon_unit_total};
}
