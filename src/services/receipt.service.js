import * as model from '../models/receipt.model.js';
import { receiptNumber } from '../helpers/receipt.helper.js';
export async function issueReceipt(tx,{payment,order,actorId}){
 const existing=await model.receiptForPayment(tx,payment.id);if(existing)return existing;
 const settings=await model.receiptSettings(tx),owner=await model.ownerForReceipt(tx,order.cashier_id);
 return model.insertReceipt(tx,{payment_id:payment.id,receipt_number:receiptNumber(payment.payment_reference),cashier_name_snapshot:owner.full_name,cafe_name_snapshot:settings.cafe_name,cafe_address_snapshot:settings.cafe_address,cafe_phone_snapshot:settings.phone,currency_snapshot:settings.currency,paper_mm:settings.receipt_paper_mm,footer_snapshot:settings.receipt_footer,issued_by_user_id:actorId});
}

import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { orderById,orderDetail } from '../models/order.model.js';
import { toWire } from '../utils/serialize.js';
const missing=()=>{throw new AppError(404,'NOT_FOUND','Receipt not found');};
const integrity=()=>{throw new AppError(500,'RECEIPT_INTEGRITY','Paid receipt unavailable');};
const pick=(row,keys)=>Object.fromEntries(keys.split(' ').map(k=>[k,row[k]]));
function scope(actor,order){if(!order||(actor.role!=='admin'&&(actor.role!=='cashier'||order.cashier_id!==actor.id)))missing();}
export async function getReceipt(db,actor,id){
 const row=await model.receiptById(db,id);if(!row)missing();const payment=row.fk_receipts_payment,order=await orderDetail(db,payment.order_id);scope(actor,order);
 if(payment.status!=='paid'||order.payment_status!=='paid'||!row.cashier_name_snapshot)integrity();
 return toWire({...pick(row,'id payment_id receipt_number cashier_name_snapshot cafe_name_snapshot cafe_address_snapshot cafe_phone_snapshot currency_snapshot paper_mm footer_snapshot pdf_url issued_at'),
  order:pick(order,'id order_number order_type notes created_at paid_at subtotal item_discount_total order_discount_total tax_total service_charge_total grand_total'),
  payment:{...pick(payment,'id payment_reference amount cash_received cash_change provider paid_at'),method:payment.cash_received===null?'qris':'cash'},
  items:order.fk_order_items_order_back.map(i=>({...pick(i,'id product_name sku_snapshot category_name quantity base_unit_price variant_unit_total addon_unit_total line_subtotal discount_total tax_total line_total special_instructions'),variants:i.fk_item_variant_item_back.map(v=>pick(v,'group_name option_name price_delta')),addons:i.fk_item_addon_item_back.map(a=>pick(a,'group_name option_name quantity unit_price line_total'))})),
  discounts:order.fk_order_discount_order_back.map(d=>pick(d,'name calculation configured_value amount')),
  taxes:order.fk_order_tax_order_back.map(t=>({...pick(t,'name is_inclusive taxable_amount tax_amount'),rate_percent:t.rate_percent.toFixed(4)})),
  charges:order.fk_order_charge_order_back.map(c=>pick(c,'name calculation configured_value amount'))});
}
export async function findOrderReceipt(db,actor,orderId){const order=await orderById(db,orderId);scope(actor,order);if(order.payment_status!=='paid')missing();const payment=await model.paidPaymentForOrder(db,orderId);if(!payment)integrity();const receipt=await model.receiptForPayment(db,payment.id);if(!receipt)integrity();return getReceipt(db,actor,receipt.id);}
export async function recordReceiptEvent(db,actor,id,action){return withWriteTx(db,async tx=>{const {user}=await lockedActor(tx,actor);const receipt=await getReceipt(tx,{...actor,role:user.role},id);await model.insertReceiptEvent(tx,{receipt_id:id,action,acted_by_user_id:user.id});return receipt;});}
export const recordReprint=(db,actor,id)=>recordReceiptEvent(db,actor,id,'reprint');
export async function listReceiptEvents(db,actor,id,q){if(actor.role!=='admin')throw new AppError(403,'FORBIDDEN','Admin required');await getReceipt(db,actor,id);const rows=await model.receiptEventRows(db,id,q);return toWire({data:rows.data,meta:{page:q.page,limit:q.limit,total:rows.total,total_pages:Math.ceil(rows.total/q.limit)}});}
