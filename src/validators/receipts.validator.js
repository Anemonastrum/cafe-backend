import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid=()=>{throw new AppError(422,'INVALID_RECEIPT','Invalid receipt input');};
export const receiptInput=kind=>(req,res,next)=>{
 req.entityId=parseId(req.params.id??req.params.orderId);const q=req.query;
 const fields=kind==='events'?['page','limit','sort_by','sort_order']:['print','reprint','pdf'].includes(kind)?['paper_mm']:[];
 if(Object.keys(q).some(k=>!fields.includes(k)))invalid();
 if(q.paper_mm!==undefined&&!['58','80'].includes(q.paper_mm))invalid();
 if(kind==='reprint'&&req.body!==undefined&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))invalid();
 req.input=kind==='events'?parsePage(q,['created_at']):{paper_mm:q.paper_mm};next();
};
