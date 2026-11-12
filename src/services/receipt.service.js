import * as model from '../models/receipt.model.js';
import { receiptNumber } from '../helpers/receipt.helper.js';
export async function issueReceipt(tx,{payment,order,actorId}){
 const existing=await model.receiptForPayment(tx,payment.id);if(existing)return existing;
 const settings=await model.receiptSettings(tx),owner=await model.ownerForReceipt(tx,order.cashier_id);
 return model.insertReceipt(tx,{payment_id:payment.id,receipt_number:receiptNumber(payment.payment_reference),cashier_name_snapshot:owner.full_name,cafe_name_snapshot:settings.cafe_name,cafe_address_snapshot:settings.cafe_address,cafe_phone_snapshot:settings.phone,currency_snapshot:settings.currency,paper_mm:settings.receipt_paper_mm,footer_snapshot:settings.receipt_footer,issued_by_user_id:actorId});
}
