import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { money } from '../utils/money.js';
const invalid=()=>{throw new AppError(422,'INVALID_PAYMENT','Invalid payment input');};
export function paymentInput(kind){return(req,res,next)=>{
 if(req.params.orderId)req.orderId=parseId(req.params.orderId);if(req.params.id)req.entityId=parseId(req.params.id);
 if(Object.keys(req.query).length)invalid();const b=kind==='confirm'&&req.body===undefined?{}:req.body;
 if(kind==='confirm'){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length)invalid();req.input={};return next();}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!(kind==='qris'?['provider']:['cash_received']).includes(k)))invalid();
 const key=req.get('Idempotency-Key');if(typeof key!=='string'||! /^[A-Za-z0-9._:-]{1,120}$/.test(key))invalid();
 if(kind==='qris'){if(!['manual','midtrans'].includes(b.provider))invalid();req.input={idempotencyKey:key,provider:b.provider};}else req.input={idempotencyKey:key,cash_received:money(b.cash_received).toFixed(2)};next();
};}
