import { toWire } from './serialize.js';
const pending=new WeakMap();
export function queueSignal(tx,events,name,payload,scope){if(!events?.publish)return;const list=pending.get(tx)??[];list.push({events,name,payload,scope});pending.set(tx,list);}
export async function publishSignals(tx){for(const {events,name,payload,scope} of pending.get(tx)??[])try{await events.publish(name,payload,scope);}catch{console.error(JSON.stringify({event:'realtime_delivery_failed',name}));}pending.delete(tx);}
export function auditSignal(tx,{events,action,entityType,entityId,before,after}){
 if(!events?.publish)return;let name,payload,scope;
 if(entityType==='orders'){
  const id=String(entityId);scope={kind:'order',id};
  if(action==='orders.create'){name='order:created';payload={order_id:id,order_number:after.order_number,status:'pending',created_at:new Date()};}
  else if(action==='orders.status'||action==='orders.cancel'){name='order:status_changed';payload={order_id:id,from_status:before.status,to_status:after.status,timestamp:new Date()};}
  else if(action==='orders.hold'||action==='orders.resume'){name='order:held_changed';payload={order_id:id,is_held:after.is_held};}
  else{
   const fields=action.startsWith('orders.item.')?['items']:action.startsWith('orders.discount.')?['discounts']:[];
   const old=toWire(before??{}),current=toWire(after??{});
   for(const key of ['notes','order_type','subtotal','item_discount_total','order_discount_total','tax_total','service_charge_total','grand_total'])if(key in old&&key in current&&old[key]!==current[key])fields.push(key);
   name='order:updated';payload={order_id:id,fields};
  }
 }else if(entityType==='payments'){
  name='payment:updated';payload={order_id:String(after.order_id),payment_id:String(entityId),status:action==='payments.paid'?'paid':action==='payments.pending'?'pending':'failed'};scope={kind:'order',id:payload.order_id};
 }else if(entityType==='cashier_shifts'){
  name='shift:updated';payload={shift_id:String(entityId),status:after.status,opened_at:after.opened_at,closed_at:after.closed_at};scope={kind:'shift',id:String(entityId)};
 }else if(entityType==='products'&&before&&(before.is_enabled!==after.is_enabled||before.archived_at!==after.archived_at)){
  name='product:availability_changed';payload={product_id:String(entityId),is_enabled:after.is_enabled&&!after.archived_at};scope={kind:'pos'};
 }else if(entityType==='cafe_settings'){
  const safe=new Set(['cafe_name','cafe_address','phone','email','logo_url','currency','timezone','receipt_footer','receipt_paper_mm']);
  name='settings:updated';payload={fields:Object.keys(after).filter(k=>safe.has(k)&&before[k]!==after[k])};scope={kind:'settings'};
 }
 if(name)queueSignal(tx,events,name,payload,scope);
}
