import { queryReport,requireAdmin,snapshot,paged } from './report-query.service.js';
import { queryAuditLogs } from './audit.service.js';
import * as model from '../models/dashboard.model.js';
export async function getDashboard(db,actor,{view,query:q}){requireAdmin(actor);return snapshot(db,async tx=>{
 if(view==='summary'){const {meta:{totals}}=await queryReport(tx,{report:'sales',range:q.range,group_by:'day'});return{data:{today_revenue:totals.revenue,paid_transaction_count:totals.count,average_order_value:totals.average_order_value,...await model.operationalCounts(tx)}};}
 if(view==='recent-orders'){const rows=await model.recentOrders(tx,q);return paged(rows.data,rows.total,q);}
 if(view==='employee-activity')return queryAuditLogs(tx,q);
 return queryReport(tx,{report:{'sales-trend':'sales','top-products':'products','payment-breakdown':'payments'}[view],range:q.range,group_by:q.group_by,page:q,rank_by:view==='top-products'?q.rank_by:undefined,paidOnly:view==='payment-breakdown'});
 });}
