import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
import { money } from '../utils/money.js';
const invalid=()=>{throw new AppError(422,'INVALID_ORDER','Invalid order input');};
const object=(value,fields)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))invalid();};
const text=(value,max)=>{if(value!==undefined&&value!==null&&(typeof value!=='string'||[...value].length>max))invalid();return value??null;};
export function orderInput(kind){return(req,res,next)=>{
 if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
 if(['list','active','detail','history'].includes(kind)){
  const q=req.query,fields=['detail','history'].includes(kind)?[]:['page','limit','sort_by','sort_order',...(kind==='list'?['status','payment_status','order_type','is_held','from','to','search']:[])];
  if(Object.keys(q).some(k=>!fields.includes(k)))invalid();
  if(q.status!==undefined&&!['pending','preparing','ready','completed','cancelled'].includes(q.status))invalid();
  if(q.payment_status!==undefined&&!['pending','paid'].includes(q.payment_status))invalid();
  if(q.order_type!==undefined&&!['dine_in','takeaway'].includes(q.order_type))invalid();
  if(q.is_held!==undefined&&!['true','false'].includes(q.is_held))invalid();
  if(q.search!==undefined&&(typeof q.search!=='string'||[...q.search].length>180))invalid();
  const input={...parsePage(q,['created_at','order_number']),status:q.status,payment_status:q.payment_status,order_type:q.order_type,is_held:q.is_held===undefined?undefined:q.is_held==='true',search:q.search};
  if(kind==='active'&&(q.sort_by!==undefined||q.sort_order!==undefined))invalid();
  for(const k of ['from','to'])if(q[k]!==undefined){
   const v=q[k];if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(v))invalid();
   const calendar=new Date(v.slice(0,19)+'Z'),value=new Date(v);if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,19)!==v.slice(0,19)||!Number.isFinite(value.getTime())||value.getUTCFullYear()<1000||value.getUTCFullYear()>9999)invalid();input[k]=value;
  }
  if(input.from&&input.to&&(input.to<=input.from||input.to-input.from>366*86400000))invalid();req.input=input;return next();
 }
 if(Object.keys(req.query).length)invalid();const b=req.body;
 if(['edit','addItem','editItem','removeItem','hold','resume','applyDiscount','removeDiscount','status','cancel'].includes(kind)){
  if(req.params.itemId!==undefined)req.childId=parseId(req.params.itemId);
  if(req.params.discountId!==undefined)req.childId=parseId(req.params.discountId);
  const fields={edit:['order_type','notes'],addItem:['product_id','quantity','variant_option_ids','addons','special_instructions'],editItem:['quantity','variant_option_ids','addons','special_instructions'],applyDiscount:['discount_id','name','calculation','value'],status:['status'],cancel:['reason']}[kind]??[];
  object(b,fields);if(['edit','editItem'].includes(kind)&&!Object.keys(b).length)invalid();
  if(kind==='edit'){if(b.order_type!==undefined&&!['dine_in','takeaway'].includes(b.order_type))invalid();req.input={...b};if('notes' in b)req.input.notes=text(b.notes,4000);}
  else if(['addItem','editItem'].includes(kind)){
   const full=kind==='addItem'?b:{product_id:'1',quantity:1,...b};
   const fake={params:{},query:{},body:{order_type:'dine_in',items:[full]}};orderInput('quote')(fake,{},()=>{});
   req.input=kind==='addItem'?fake.input.items[0]:Object.fromEntries(Object.keys(b).map(k=>[k,fake.input.items[0][k]]));
  }else if(kind==='applyDiscount'){
   if('discount_id' in b){if(Object.keys(b).length!==1)invalid();req.input={discount_id:parseId(b.discount_id)};}
   else{if(typeof b.name!=='string'||!b.name.trim()||[...b.name].length>120||!['fixed','percent'].includes(b.calculation))invalid();const value=money(b.value);if(b.calculation==='percent'&&value.gt(100))invalid();req.input={name:b.name,calculation:b.calculation,value};}
  }else if(kind==='status'){if(!['pending','preparing','ready','completed'].includes(b.status))invalid();req.input={status:b.status};}
  else if(kind==='cancel'){if(typeof b.reason!=='string'||!b.reason.trim()||[...b.reason].length>500)invalid();req.input={reason:b.reason};}
  else req.input={};return next();
 }
 object(b,['order_type' ,'notes','items','discounts',...(kind==='create'?['client_request_id']:[])]);
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
