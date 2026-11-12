import * as model from '../models/report.model.js';
import { AppError } from '../utils/errors.js';
import { Decimal,roundMoney } from '../utils/money.js';
export const requireAdmin=actor=>{if(actor.role!=='admin')throw new AppError(403,'FORBIDDEN','Admin required');};
export const snapshot=(db,fn)=>db.$transaction(fn,{isolationLevel:'RepeatableRead',timeout:10000});
const exists=async(tx,id)=>{if(!await model.employeeExists(tx,id))throw new AppError(404,'NOT_FOUND','Employee not found');};
export const paged=(data,total,q)=>({data,meta:{page:q.page,limit:q.limit,total:Number(total),total_pages:Math.ceil(Number(total)/q.limit)}});
async function history(db,actor,{id,query},kind){requireAdmin(actor);return snapshot(db,async tx=>{await exists(tx,id);const rows=await model.employeeRows(tx,id,query,kind);return paged(rows.data.map(({request_hash,...row})=>row),rows.total,query);});}
export const employeeOrders=(db,actor,input)=>history(db,actor,input,'orders');
export const employeeShifts=(db,actor,input)=>history(db,actor,input,'shifts');
export async function employeeSalesSummary(db,actor,{id,query}){requireAdmin(actor);return snapshot(db,async tx=>{await exists(tx,id);const row=await model.ownerSales(tx,id,query.range),count=Number(row.transaction_count);return{owner_id:id,transaction_count:count,paid_sales_total:new Decimal(row.paid_sales_total),average_order_value:count?roundMoney(new Decimal(row.paid_sales_total).div(count)):new Decimal(0)};});}

import { bucketStart,nextBucket } from '../utils/date-range.js';
const metricKeys=['gross_sales','discounts','tax','service_charges','net_sales','revenue'];
const zeroMetrics=()=>Object.fromEntries(metricKeys.map(k=>[k,new Decimal(0)]));
export async function queryReport(tx,input){
 const rows=await model.reportRows(tx,input);
 if(input.report==='sales'){
  const buckets=new Map(rows.data.map(r=>[r.bucket,r])),data=[],totals={count:0,...zeroMetrics()};
  for(let start=bucketStart(input.range.from,input.group_by);start<input.range.to;start=nextBucket(start,input.group_by)){
   const key=new Date(start.getTime()+7*3600000).toISOString().slice(0,10),row=buckets.get(key),count=Number(row?.count??0),metrics=Object.fromEntries(metricKeys.map(k=>[k,new Decimal(row?.[k]??0)]));
   totals.count+=count;for(const k of metricKeys)totals[k]=totals[k].plus(metrics[k]);data.push({start,count,...metrics,average_order_value:count?roundMoney(metrics.revenue.div(count)):new Decimal(0)});
  }
  totals.average_order_value=totals.count?roundMoney(totals.revenue.div(totals.count)):new Decimal(0);return{data,meta:{range:input.range,group_by:input.group_by,totals}};
 }
 const data=rows.data.map(row=>{const out={...row};for(const key of ['count','quantity','held_count','unpaid_count'])if(key in out)out[key]=Number(out[key]);if(input.report==='employees')out.average_order_value=out.count?roundMoney(new Decimal(out.revenue).div(out.count)):new Decimal(0);return out;});return paged(data,rows.total,input.page);
}
