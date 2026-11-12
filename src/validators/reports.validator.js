import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
import { parseRange } from '../utils/date-range.js';
import { AppError } from '../utils/errors.js';
const invalid=()=>{throw new AppError(422,'INVALID_REPORT','Invalid report input');};
export const employeeReportInput=kind=>(req,res,next)=>{const q=req.query,fields=['from','to','timezone',...(kind==='summary'?[]:['page','limit','sort_by','sort_order','status',...(kind==='orders'?['payment_status']:[])])];if(Object.keys(q).some(k=>!fields.includes(k)))invalid();
 if(q.status!==undefined&&!(kind==='orders'?['pending','preparing','ready','completed','cancelled']:['open','closed']).includes(q.status))invalid();if(q.payment_status!==undefined&&!['pending','paid'].includes(q.payment_status))invalid();
 req.entityId=parseId(req.params.id);req.input={range:parseRange(q),...(kind==='summary'?{}:parsePage(q,kind==='orders'?['created_at','order_number']:['opened_at','closed_at'])),status:q.status,payment_status:q.payment_status};next();};

export const reportInput=(req,res,next)=>{const report=req.params.report;if(!['sales','payments','products','categories','employees','orders','cancellations'].includes(report))throw new AppError(404,'NOT_FOUND','Report not found');const q=req.query,fields=['from','to','timezone',...(report==='sales'?['group_by']:['page','limit'])];if(Object.keys(q).some(k=>!fields.includes(k)))invalid();if(q.group_by!==undefined&&!['day','week','month'].includes(q.group_by))invalid();req.input={report,range:parseRange(q),group_by:q.group_by??'day',page:parsePage(q,[])};next();};
