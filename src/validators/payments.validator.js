import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
import { money } from '../utils/money.js';
const invalid=()=>{throw new AppError(422,'INVALID_PAYMENT','Invalid payment input');};
export function paymentInput(kind){return(req,res,next)=>{
 if(req.params.orderId)req.orderId=parseId(req.params.orderId);if(req.params.id)req.entityId=parseId(req.params.id);
 if(['detail','orderList','adminList','events'].includes(kind)){
  const q=req.query,fields=kind==='detail'?[]:['page','limit','sort_by','sort_order',...(['orderList','adminList'].includes(kind)?['status']:[]),...(kind==='adminList'?['search','payment_method_id','cashier_id','from','to']:[])];
  if(Object.keys(q).some(k=>!fields.includes(k)))invalid();
  req.input=kind==='detail'?{}:parsePage(q,kind==='events'?['received_at']:['created_at','paid_at','payment_reference']);
  if(q.status!==undefined){if(!['pending','paid','failed'].includes(q.status))invalid();req.input.status=q.status;}
  for(const key of ['payment_method_id','cashier_id'])if(q[key]!==undefined)req.input[key]=parseId(q[key]);
  if(q.search!==undefined){if(typeof q.search!=='string'||[...q.search].length>120)invalid();req.input.search=q.search;}
  for(const key of ['from','to'])if(q[key]!==undefined){const v=q[key];if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(v))invalid();const calendar=new Date(v.slice(0,19)+'Z'),d=new Date(v);if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,19)!==v.slice(0,19)||!Number.isFinite(d.getTime())||d.getUTCFullYear()<1000||d.getUTCFullYear()>9999)invalid();req.input[key]=d;}
  if(req.input.from&&req.input.to&&(req.input.to<=req.input.from||req.input.to-req.input.from>366*86400000))invalid();return next();
 }
 if(Object.keys(req.query).length)invalid();const b=kind==='confirm'&&req.body===undefined?{}:req.body;
 if(kind==='confirm'){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length)invalid();req.input={};return next();}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!(kind==='qris'?['provider']:['cash_received']).includes(k)))invalid();
 const key=req.get('Idempotency-Key');if(typeof key!=='string'||! /^[A-Za-z0-9._:-]{1,120}$/.test(key))invalid();
 if(kind==='qris'){if(!['manual','midtrans'].includes(b.provider))invalid();req.input={idempotencyKey:key,provider:b.provider};}else req.input={idempotencyKey:key,cash_received:money(b.cash_received).toFixed(2)};next();
};}
