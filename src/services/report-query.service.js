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
