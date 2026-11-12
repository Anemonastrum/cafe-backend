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
export function paymentView(row){const {request_hash,gateway_order_id,gateway_transaction_id,gateway_status,...safe}=row;return safe;}
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
 await model.insertEvent(tx,{payment_id:payment.id,event_type:'paid',payload:{status:'paid',actor_id:String(actorId),...(confirmingShiftId?{confirming_shift_id:String(confirmingShiftId)}:{})}});
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
