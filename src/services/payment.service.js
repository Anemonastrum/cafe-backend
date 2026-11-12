import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { Decimal,money } from '../utils/money.js';
import { canonicalHash } from '../utils/idempotency.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { lockCafe } from '../models/lock.model.js';
import { lockRegister } from '../models/register.model.js';
import { ownOpenShift,shiftById,lockShift } from '../models/shifts.model.js';
import { lockOrderForActor,snapshotLine } from './orders.service.js';
import { calculateQuote } from './pricing.service.js';
import * as orders from '../models/order.model.js';
import * as model from '../models/payments.model.js';
import { issueReceipt } from './receipt.service.js';
import { appendAudit } from './audit.service.js';
const conflict=()=>{throw new AppError(409,'PAYMENT_CONFLICT','Payment state does not permit this action');};
const notFound=()=>{throw new AppError(404,'NOT_FOUND','Not found');};
export function paymentView(row){const fields=['id','order_id','shift_id','payment_method_id','payment_reference','amount','cash_received','cash_change','status','provider','processed_by_user_id','paid_at','failed_at','created_at','updated_at'];return Object.fromEntries(fields.map(k=>[k,row[k]]));}
export function safeEventPayload(payload){const safe={};if(!payload||typeof payload!=='object'||Array.isArray(payload))return safe;for(const k of ['status','actor_id','confirming_shift_id','reason'])if(typeof payload[k]==='string'&&payload[k].length<=(k==='reason'?500:80))safe[k]=payload[k];return safe;}
async function event(tx,{payment_id,event_type,payload}){return model.insertEvent(tx,{payment_id,event_type,payload:safeEventPayload(payload)});}
export async function paymentLocks(tx,actor,orderId,extraShiftIds=[]){
 await lockCafe(tx);const hint=await orders.orderById(tx,orderId);if(!hint||(actor.role!=='admin'&&hint.cashier_id!==actor.id))notFound();
 const {user}=await lockedActor(tx,actor,[hint.cashier_id]),own=await ownOpenShift(tx,user.id);
 const ids=[...new Set([hint.shift_id,own?.id,...extraShiftIds].filter(Boolean))].sort((a,b)=>a<b?-1:1),hints=[];
 for(const id of ids){const shift=await shiftById(tx,id);if(shift)hints.push(shift);}
 for(const id of [...new Set(hints.map(s=>s.cash_register_id))].sort((a,b)=>a<b?-1:1))await lockRegister(tx,id);
 const shifts=[];for(const id of ids){const s=await lockShift(tx,id);if(s)shifts.push(s);}
 const order=await lockOrderForActor(tx,user,orderId);
 return{user,order,own,shifts,requireOpen(){if(!own||!order.shift_id||!shifts.some(s=>s.id===own.id&&s.status==='open')||!shifts.some(s=>s.id===order.shift_id&&s.status==='open')||extraShiftIds.some(id=>!shifts.some(s=>s.id===id&&s.status==='open')))conflict();}};
}
export async function verifyCheckout(tx,order,{allowPendingId=null}={}){
 if(order.payment_status==='paid'||['cancelled','completed'].includes(order.status)||order.is_held||await model.paidAttempt(tx,order.id))conflict();
 const pending=await orders.pendingAttempt(tx,order.id);if(pending&&pending.id!==allowPendingId)conflict();
 const row=await orders.orderDetail(tx,order.id),items=row.fk_order_items_order_back;if(!items.length)conflict();
 let p;try{p=calculateQuote({lines:items.map(snapshotLine),discounts:row.fk_order_discount_order_back.map(d=>({key:String(d.id),name:d.name,calculation:d.calculation,value:d.configured_value})),charges:row.fk_order_charge_order_back.map(c=>({key:String(c.id),name:c.name,calculation:c.calculation,value:c.configured_value}))});}catch{conflict();}
 const totals={subtotal:p.subtotal,item_discount_total:p.itemDiscountTotal,order_discount_total:p.orderDiscountTotal,tax_total:p.taxTotal,service_charge_total:p.serviceChargeTotal,grand_total:p.grandTotal};
 for(const [key,value] of Object.entries(totals))if(!new Decimal(order[key]).eq(value))conflict();
 for(const [i,item] of items.entries()){
  const line=p.lines[i];for(const [key,value] of Object.entries({line_subtotal:line.subtotal,discount_total:line.promoDiscount,tax_total:line.taxAmount,line_total:line.lineTotal}))if(!new Decimal(item[key]).eq(value))conflict();
  if(!new Decimal(item.pricing_snapshot.order_discount).eq(line.orderDiscount))conflict();
 }
 for(const [i,d] of row.fk_order_discount_order_back.entries())if(!d.amount.eq(p.discounts[i].amount))conflict();
 for(const [i,c] of row.fk_order_charge_order_back.entries())if(!c.amount.eq(p.charges[i].amount))conflict();
 if(row.fk_order_tax_order_back.length!==p.taxes.length)conflict();
 for(const t of p.taxes)if(!row.fk_order_tax_order_back.some(s=>s.tax_id===t.id&&s.name===t.name&&s.rate_percent.eq(t.rate)&&s.is_inclusive===t.inclusive&&s.taxable_amount.eq(t.taxableAmount)&&s.tax_amount.eq(t.taxAmount)))conflict();
 return p;
}
export async function settlePayment(tx,{payment,order,actorId,context,confirmingShiftId}){
 if(payment.status==='paid')return{payment,order,receipt:await issueReceipt(tx,{payment,order,actorId})};
 if(payment.status!=='pending'||!payment.amount.eq(order.grand_total))conflict();
 const now=new Date(),paid=await model.updatePayment(tx,payment.id,{status:'paid',paid_at:now});
 const updated=await orders.updateOrder(tx,order.id,{payment_status:'paid',paid_at:now});
 const receipt=await issueReceipt(tx,{payment:paid,order:updated,actorId});
 await event(tx,{payment_id:payment.id,event_type:'paid',payload:{status:'paid',actor_id:String(actorId),...(confirmingShiftId?{confirming_shift_id:String(confirmingShiftId)}:{})}});
 await appendAudit(tx,{actor:{id:actorId},action:'payments.paid',entityType:'payments',entityId:payment.id,after:{order_id:order.id,amount:payment.amount,receipt_id:receipt.id,confirming_shift_id:confirmingShiftId??null},context});
 return{payment:paid,order:updated,receipt};
}
export async function createCashPayment(db,actor,{orderId,idempotencyKey,cash_received},context){
 const tender=money(cash_received),hash=canonicalHash({operation:'payments.cash',actor:actor.id,orderId,cash_received:tender.toFixed(2)});
 return withWriteTx(db,async tx=>{
  const locked=await paymentLocks(tx,actor,orderId),existing=await model.paymentByKey(tx,idempotencyKey);
  if(existing){if(existing.processed_by_user_id!==locked.user.id||existing.order_id!==orderId||existing.request_hash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Request key already used');return{payment:paymentView(existing),replay:true};}
  locked.requireOpen();const {order,user,own}=locked;await verifyCheckout(tx,order);
  const method=await model.methodByCode(tx,'cash');if(!method?.is_enabled||method.provider!=='manual')conflict();
  if(tender.lt(order.grand_total))throw new AppError(422,'INSUFFICIENT_TENDER','Cash received is below payment amount');
  const payment=await model.insertPayment(tx,{order_id:order.id,shift_id:own.id,payment_method_id:method.id,payment_reference:'PAY-'+randomUUID(),idempotency_key:idempotencyKey,request_hash:hash,amount:order.grand_total,cash_received:tender,cash_change:tender.minus(order.grand_total),processed_by_user_id:user.id,provider:'manual'});
  const settled=await settlePayment(tx,{payment,order,actorId:user.id,context});return{payment:paymentView(settled.payment),replay:false};
 });
}

export async function createQrisPayment(db,actor,{orderId,idempotencyKey,provider},context){
 const hash=canonicalHash({operation:'payments.qris',actor:actor.id,orderId,provider});
 return withWriteTx(db,async tx=>{
  const locked=await paymentLocks(tx,actor,orderId),existing=await model.paymentByKey(tx,idempotencyKey);
  if(existing){if(existing.processed_by_user_id!==locked.user.id||existing.order_id!==orderId||existing.request_hash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Request key already used');return{payment:paymentView(existing),replay:true};}
  locked.requireOpen();const {order,user,own}=locked;await verifyCheckout(tx,order);
  const method=await model.methodByCode(tx,'qris');if(provider!=='manual'||!method?.is_enabled||method.provider!==provider)conflict();
  const payment=await model.insertPayment(tx,{order_id:order.id,shift_id:own.id,payment_method_id:method.id,payment_reference:'PAY-'+randomUUID(),idempotency_key:idempotencyKey,request_hash:hash,amount:order.grand_total,processed_by_user_id:user.id,provider});
  await event(tx,{payment_id:payment.id,event_type:'pending',payload:{status:'pending',actor_id:String(user.id)}});
  await appendAudit(tx,{actor:user,action:'payments.pending',entityType:'payments',entityId:payment.id,after:{order_id:order.id,amount:payment.amount},context});
  return{payment:paymentView(payment),replay:false};
 });
}
async function manualLocked(tx,actor,id){
 await lockCafe(tx);const hint=await model.paymentById(tx,id);if(!hint)notFound();
 const locked=await paymentLocks(tx,actor,hint.order_id,hint.shift_id?[hint.shift_id]:[]),payment=await model.lockPayment(tx,id);
 const method=await model.methodByCode(tx,'qris');if(payment.provider!=='manual'||payment.payment_method_id!==method?.id)conflict();
 return{...locked,payment};
}
export async function confirmManual(db,actor,{id},context){
 return withWriteTx(db,async tx=>{
  const locked=await manualLocked(tx,actor,id),{payment,order,user,own}=locked;
  if(payment.status==='paid')return paymentView(payment);
  if(payment.status!=='pending')conflict();locked.requireOpen();
  await verifyCheckout(tx,order,{allowPendingId:payment.id});
  const settled=await settlePayment(tx,{payment,order,actorId:user.id,confirmingShiftId:own.id,context});return paymentView(settled.payment);
 });
}
export async function failManualPayment(db,actor,{id,reason,expected_status},context){
 if(expected_status!=='pending'||typeof reason!=='string'||!reason.trim()||[...reason].length>500)throw new AppError(422,'INVALID_RECOVERY','Pending status and nonempty reason required');
 return withWriteTx(db,async tx=>{
  const {user,payment}=await manualLocked(tx,actor,id);if(user.role!=='admin')throw new AppError(403,'FORBIDDEN','Admin required');
  if(payment.status!==expected_status)conflict();
  const failed=await model.updatePayment(tx,id,{status:'failed',failed_at:new Date()});
  await event(tx,{payment_id:id,event_type:'failed',payload:{status:'failed',actor_id:String(user.id),reason}});
  await appendAudit(tx,{actor:user,action:'payments.fail_manual',entityType:'payments',entityId:id,before:{status:payment.status},after:{order_id:payment.order_id,status:'failed',reason},context});return paymentView(failed);
 });
}

async function scopedPayment(db,actor,id){const row=await model.paymentById(db,id);if(!row)notFound();const order=await orders.orderById(db,row.order_id);if(!order||(actor.role!=='admin'&&order.cashier_id!==actor.id))notFound();return row;}
export const getPayment=async(db,actor,id)=>paymentView(await scopedPayment(db,actor,id));
const paged=(data,total,q)=>({data,meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}});
export async function listOrderPayments(db,actor,{orderId,query}){const order=await orders.orderById(db,orderId);if(!order||(actor.role!=='admin'&&order.cashier_id!==actor.id))notFound();const rows=await model.paymentRows(db,{...query,orderId});return paged(rows.data.map(paymentView),rows.total,query);}
export async function listPayments(db,actor,query){if(actor.role!=='admin')throw new AppError(403,'FORBIDDEN','Admin required');const rows=await model.paymentRows(db,query);return paged(rows.data.map(paymentView),rows.total,query);}
export async function listPaymentEvents(db,actor,{id,query}){if(actor.role!=='admin')throw new AppError(403,'FORBIDDEN','Admin required');await scopedPayment(db,actor,id);const rows=await model.eventRows(db,id,query);return paged(rows.data.map(({id,payment_id,event_type,payload,received_at})=>({id,payment_id,event_type,payload:safeEventPayload(payload),received_at})),rows.total,query);}
