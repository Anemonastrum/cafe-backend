import { parseId } from '../utils/ids.js';
import { parseRange } from '../utils/date-range.js';
import { parsePage } from '../utils/pagination.js';
import { AppError } from '../utils/errors.js';
export function auditQuery(q){
 const allowed=['user_id','action','entity_type','entity_id','from','to','timezone','page','limit'];if(Object.keys(q).some(k=>!allowed.includes(k)))throw new AppError(422,'INVALID_AUDIT','Unknown audit query field');
 const filters={};if(q.user_id!==undefined)filters.user_id=parseId(q.user_id);
 for(const [key,max] of [['action',100],['entity_type',80],['entity_id',80]])if(q[key]!==undefined){if(typeof q[key]!=='string'||!q[key].length||[...q[key]].length>max)throw new AppError(422,'INVALID_AUDIT','Invalid audit filter');filters[key]=q[key];}
 return{filters,range:parseRange(q),...parsePage(q,[])};
}
export const auditInput=detail=>(req,res,next)=>{if(detail){if(Object.keys(req.query).length)throw new AppError(422,'INVALID_AUDIT','Unknown audit query field');req.entityId=parseId(req.params.id);}else req.input=auditQuery(req.query);next();};
