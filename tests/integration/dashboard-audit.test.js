import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p10-t3 acceptance: dashboards reuse financial projections and audit readers redact recursively',async()=>withDatabase(async db=>{
 const f=await orderFixture(db);let audit;
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  const create=async quantity=>{const r=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID(),items:[{product_id:String(f.product.id),quantity}]},f.cashier);assert.equal(r.status,201);return r.body.data;};
  const order=await create(3),pending=await create(1);const pay=await request(f.h,{path:'/orders/'+order.id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(pay.status,201);
  audit=await db.audit_logs.create({data:{user_id:f.cashierA.id,action:'test.audit',entity_type:'orders',entity_id:'18446744073709551615',before_data:{name:'Safe',password_hash:'hidden-credential',details:{status:'pending',api_key:'hidden-credential',items:[{name:'Tea',token:'hidden-credential',unknown:'hidden-credential'}]}},after_data:{status:'paid',authorization:'hidden-credential'}}});
  const range='?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z',paths=['summary','sales-trend','top-products','payment-breakdown','recent-orders','employee-activity'].map(v=>'/admin/dashboard/'+v).concat(['/admin/audit-logs','/admin/audit-logs/'+audit.id]);
  for(const path of paths){assert.equal((await f.api(path,'GET',undefined,{})).status,401);assert.equal((await f.api(path,'GET',undefined,f.cashier)).status,403);assert.equal((await f.api(path)).status,200,path);assert.equal((await f.api(path+'?unknown=x')).status,422);}
  const summary=(await f.api('/admin/dashboard/summary')).body.data,sales=(await f.api('/admin/reports/sales')).body.meta.totals;
  assert.equal(summary.today_revenue,'75000.00');assert.equal(summary.today_revenue,sales.revenue);assert.equal(summary.paid_transaction_count,sales.count);assert.equal(summary.average_order_value,sales.average_order_value);assert.equal(summary.active_orders,await db.orders.count({where:{status:{in:['pending','preparing','ready']}}}));assert.equal(summary.pending_orders,await db.orders.count({where:{status:'pending'}}));assert.equal(summary.open_shifts,await db.cashier_shifts.count({where:{status:'open'}}));
  for(const period of ['day','week','month']){const trend=(await f.api('/admin/dashboard/sales-trend?period='+period)).body;const report=(await f.api('/admin/reports/sales?group_by='+period)).body;assert.deepEqual(trend,report);}
  const top=(await f.api('/admin/dashboard/top-products?rank_by=quantity&limit=1')).body;assert.equal(top.data[0].product_name,'Snapshot tea');assert.equal(top.data[0].quantity,3);assert.equal(top.data[0].revenue,'75000.00');
  const breakdown=(await f.api('/admin/dashboard/payment-breakdown')).body.data;assert.equal(breakdown.find(r=>r.code==='cash').amount,'75000.00');assert.ok(breakdown.every(r=>r.status==='paid'));
  const recent=(await f.api('/admin/dashboard/recent-orders?limit=1')).body;assert.equal(recent.data[0].id,pending.id);assert.equal(recent.data[0].payment_status,'pending');assert.ok(!JSON.stringify(recent).includes('request_hash'));
  const filter='?user_id='+f.cashierA.id+'&action=test.audit&entity_type=orders&entity_id=18446744073709551615&limit=1';const logs=(await f.api('/admin/audit-logs'+filter)).body;assert.equal(logs.meta.total,1);assert.equal(logs.data[0].entity_id,'18446744073709551615');const detail=(await f.api('/admin/audit-logs/'+audit.id)).body.data;assert.deepEqual(detail,logs.data[0]);assert.ok(!JSON.stringify(detail).includes('hidden-credential'));assert.equal(detail.before_data.details.items[0].name,'Tea');
  const activity=(await f.api('/admin/dashboard/employee-activity'+filter)).body;assert.deepEqual(activity,logs);
  assert.equal((await f.api('/admin/audit-logs/18446744073709551615')).status,404);assert.equal((await f.api('/admin/audit-logs?user_id=no')).status,422);assert.equal((await f.api('/admin/audit-logs?from=2026-02-30T00:00:00Z')).status,422);assert.equal((await f.api('/admin/dashboard/sales-trend?period=year')).status,422);assert.equal((await f.api('/admin/dashboard/top-products?rank_by=name')).status,422);
  const emptySummary=(await f.api('/admin/dashboard/summary'+range)).body.data;assert.equal(emptySummary.today_revenue,'0.00');assert.equal(emptySummary.average_order_value,'0.00');for(const view of ['top-products','payment-breakdown','recent-orders','employee-activity'])assert.deepEqual((await f.api('/admin/dashboard/'+view+range)).body.data,[]);
 }finally{if(audit)await db.audit_logs.delete({where:{id:audit.id}});await f.cleanup();}
}));
