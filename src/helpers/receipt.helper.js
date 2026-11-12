export const receiptNumber=paymentReference=>'RCT-'+paymentReference;

import { readFileSync } from 'node:fs';
const template=readFileSync(new URL('../templates/receipt.html',import.meta.url),'utf8');
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const paperWidth=(receipt,paper_mm)=>paper_mm??(receipt.paper_mm==='value_58'?'58':'80');
export function receiptLines(r){return[
 r.cafe_name_snapshot,r.cafe_address_snapshot,r.cafe_phone_snapshot,r.receipt_number,
 'Order: '+r.order.order_number,'Issued: '+r.issued_at,'Cashier: '+r.cashier_name_snapshot,'Currency: '+r.currency_snapshot,'Type: '+r.order.order_type,
 ...r.items.flatMap(i=>[i.product_name+' x'+i.quantity+' = '+i.line_total,'Category: '+i.category_name,'Unit: '+i.base_unit_price+'; variants: '+i.variant_unit_total+'; addons: '+i.addon_unit_total,'Subtotal: '+i.line_subtotal+'; discount: '+i.discount_total+'; tax: '+i.tax_total,...i.variants.map(v=>v.group_name+': '+v.option_name+' '+v.price_delta),...i.addons.map(a=>a.group_name+': '+a.option_name+' x'+a.quantity+' '+a.line_total),i.special_instructions]),
 'Subtotal: '+r.order.subtotal,'Item discount: '+r.order.item_discount_total,
 ...r.discounts.map(d=>'Discount '+d.name+': '+d.amount),'Order discount: '+r.order.order_discount_total,
 ...r.taxes.map(t=>'Tax '+t.name+' '+t.rate_percent+'% ('+(t.is_inclusive?'inclusive':'exclusive')+'): '+t.tax_amount),'Tax total: '+r.order.tax_total,
 ...r.charges.map(c=>'Charge '+c.name+': '+c.amount),'Service charge total: '+r.order.service_charge_total,
 'Total: '+r.order.grand_total,'Payment: '+r.payment.method+' / '+r.payment.provider,'Reference: '+r.payment.payment_reference,'Paid: '+r.payment.paid_at,'Amount: '+r.payment.amount,
 ...(r.payment.cash_received!==null?['Tender: '+r.payment.cash_received,'Change: '+r.payment.cash_change]:[]),r.order.notes,r.footer_snapshot
 ].filter(v=>v!==null&&v!==undefined&&v!=='');}
export function renderReceiptHtml(receipt,{paper_mm}={}){const width=paperWidth(receipt,paper_mm);if(!['58','80'].includes(width))throw new TypeError('Invalid paper width');return template.replaceAll('{{paper_mm}}',width).replace('{{content}}',()=>receiptLines(receipt).map(l=>'<div>'+escapeHtml(l)+'</div>').join(''));}
