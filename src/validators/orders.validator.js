import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
const invalid=()=>{throw new AppError(422,'INVALID_ORDER','Invalid order input');};
const object=(value,fields)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))invalid();};
const text=(value,max)=>{if(value!==undefined&&value!==null&&(typeof value!=='string'||[...value].length>max))invalid();return value??null;};
export function orderInput(kind){return(req,res,next)=>{
 if(Object.keys(req.query).length)invalid();const b=req.body;
 object(b,['order_type','notes','items','discounts',...(kind==='create'?['client_request_id']:[])]);
 if(!['dine_in','takeaway'].includes(b.order_type))invalid();
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)invalid();
 const items=b.items.map(item=>{
  object(item,['product_id','quantity','variant_option_ids','addons','special_instructions']);
  if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999)invalid();
  const ids=item.variant_option_ids??[],addons=item.addons??[];if(!Array.isArray(ids)||!Array.isArray(addons)||ids.length>100||addons.length>100)invalid();
  const variant_option_ids=ids.map(parseId).sort((a,b)=>a<b?-1:a>b?1:0);if(new Set(variant_option_ids.map(String)).size!==ids.length)invalid();
  const normalized=addons.map(a=>{object(a,['addon_option_id','quantity']);if(!Number.isInteger(a.quantity)||a.quantity<1||a.quantity>999)invalid();return{addon_option_id:parseId(a.addon_option_id),quantity:a.quantity};}).sort((a,b)=>a.addon_option_id<b.addon_option_id?-1:1);
  if(new Set(normalized.map(a=>String(a.addon_option_id))).size!==addons.length)invalid();
  return{product_id:parseId(item.product_id),quantity:item.quantity,variant_option_ids,addons:normalized,special_instructions:text(item.special_instructions,4000)};
 });
 const discounts=b.discounts??[];if(!Array.isArray(discounts)||discounts.length>100)invalid();
 const normalized=discounts.map(d=>{object(d,['discount_id']);return{discount_id:parseId(d.discount_id)};});
 if(new Set(normalized.map(d=>String(d.discount_id))).size!==discounts.length)invalid();
 req.input={order_type:b.order_type,notes:text(b.notes,4000),items,discounts:normalized};
 if(kind==='create'){if(typeof b.client_request_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.client_request_id))invalid();req.input.client_request_id=b.client_request_id.toLowerCase();}
 next();
};}
