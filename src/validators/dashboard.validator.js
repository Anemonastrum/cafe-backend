import { parsePage } from '../utils/pagination.js';
import { parseRange } from '../utils/date-range.js';
import { AppError } from '../utils/errors.js';
import { auditQuery } from './audit.validator.js';
export const dashboardInput=(req,res,next)=>{const view=req.params.view,q=req.query;if(!['summary','sales-trend','top-products','payment-breakdown','recent-orders','employee-activity'].includes(view))throw new AppError(404,'NOT_FOUND','Dashboard view not found');
 if(view==='employee-activity'){req.input={view,query:auditQuery(q)};return next();}
 const fields=['from','to','timezone',...(view==='sales-trend'?['period']:[]),...(['top-products','recent-orders','payment-breakdown'].includes(view)?['page','limit']:[]),...(view==='top-products'?['rank_by']:[])];
 if(Object.keys(q).some(k=>!fields.includes(k))||q.period!==undefined&&!['day','week','month'].includes(q.period)||q.rank_by!==undefined&&!['quantity','revenue'].includes(q.rank_by))throw new AppError(422,'INVALID_DASHBOARD','Invalid dashboard query');
 req.input={view,query:{range:parseRange(q),group_by:q.period??'day',rank_by:q.rank_by??'quantity',...parsePage(q,[])}};next();};
