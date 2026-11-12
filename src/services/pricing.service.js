import { Decimal,roundMoney,boundedMoney,invalidMoney } from '../utils/money.js';
import { AppError } from '../utils/errors.js';
const sum=values=>values.reduce((a,b)=>a.plus(b),new Decimal(0));
function ruleAmount(rule,base){
 const value=boundedMoney(rule.value);if(!['percent','fixed'].includes(rule.calculation)||(rule.calculation==='percent'&&value.gt(100)))invalidMoney();
 return roundMoney(rule.calculation==='percent'?base.times(value).div(100):value);
}
function allocate(amount,bases,keys){
 const total=sum(bases);if(total.isZero())return bases.map(()=>new Decimal(0));
 const exact=bases.map(v=>amount.times(100).times(v).div(total)),cents=exact.map(v=>v.floor());
 let remaining=amount.times(100).minus(sum(cents)).toNumber();
 const order=exact.map((v,i)=>({i,remainder:v.minus(cents[i]),key:keys[i]})).sort((a,b)=>b.remainder.cmp(a.remainder)||(a.key<b.key?-1:a.key>b.key?1:a.i-b.i));
 for(let i=0;i<remaining;i++)cents[order[i].i]=cents[order[i].i].plus(1);
 return cents.map(v=>v.div(100));
}
export function calculateQuote({lines,discounts=[],charges=[]}){
 if(!Array.isArray(lines)||!lines.length||lines.length>100)throw new AppError(422,'INVALID_LINES','Expected 1 to 100 lines');
 const priced=lines.map(line=>{
  if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>999)invalidMoney();
  const base=boundedMoney(line.base),variant=new Decimal(line.variantTotal),addon=boundedMoney(line.addonTotal),promo=boundedMoney(line.promoReduction);
  if(!variant.isFinite()||variant.abs().gt('999999999999.99')||promo.gt(base)||base.minus(promo).plus(variant).lt(0))invalidMoney();
  const subtotal=boundedMoney(base.plus(variant).plus(addon).times(line.quantity)),promoDiscount=boundedMoney(promo.times(line.quantity));
  return {...line,subtotal,promoDiscount,orderDiscount:new Decimal(0),remaining:subtotal.minus(promoDiscount)};
 });
 const discountRows=discounts.map(rule=>{
  const base=sum(priced.map(l=>l.remaining)),amount=Decimal.min(base,ruleAmount(rule,base));
  const allocations=allocate(amount,priced.map(l=>l.remaining),priced.map(l=>l.key));
  priced.forEach((l,i)=>{l.orderDiscount=l.orderDiscount.plus(allocations[i]);l.remaining=l.remaining.minus(allocations[i]);});return{...rule,amount};
 });
 let exclusiveTax=new Decimal(0);const taxGroups=new Map();
 for(const line of priced){
  line.taxAmount=new Decimal(0);
  if(line.tax){
   const rate=new Decimal(line.tax.rate);if(!rate.isFinite()||rate.lt(0)||rate.gt(100))invalidMoney();
   line.taxAmount=roundMoney(line.remaining.times(rate).div(line.tax.inclusive?rate.plus(100):100));
   if(!line.tax.inclusive)exclusiveTax=exclusiveTax.plus(line.taxAmount);
   const key=JSON.stringify([String(line.tax.id),line.tax.name,rate.toFixed(4),line.tax.inclusive]);
   const group=taxGroups.get(key)??{...line.tax,taxableAmount:new Decimal(0),taxAmount:new Decimal(0)};
   group.taxableAmount=group.taxableAmount.plus(line.remaining);group.taxAmount=group.taxAmount.plus(line.taxAmount);taxGroups.set(key,group);
  }
  line.lineTotal=boundedMoney(line.remaining.plus(line.tax&&!line.tax.inclusive?line.taxAmount:0));
 }
 const chargeBase=sum(priced.map(l=>l.remaining)),chargeRows=charges.map(rule=>({...rule,amount:boundedMoney(ruleAmount(rule,chargeBase))}));
 const subtotal=boundedMoney(sum(priced.map(l=>l.subtotal))),itemDiscountTotal=boundedMoney(sum(priced.map(l=>l.promoDiscount))),orderDiscountTotal=boundedMoney(sum(discountRows.map(r=>r.amount))),taxTotal=boundedMoney(sum(priced.map(l=>l.taxAmount))),serviceChargeTotal=boundedMoney(sum(chargeRows.map(r=>r.amount)));
 return{lines:priced,discounts:discountRows,charges:chargeRows,taxes:[...taxGroups.values()],subtotal,itemDiscountTotal,orderDiscountTotal,taxTotal,serviceChargeTotal,grandTotal:boundedMoney(subtotal.minus(itemDiscountTotal).minus(orderDiscountTotal).plus(exclusiveTax).plus(serviceChargeTotal))};
}
