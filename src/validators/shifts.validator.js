import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid=()=>{throw new AppError(422,'INVALID_SHIFT','Invalid register or shift input');};
export function shiftsInput(kind){return(req,res,next)=>{
 if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
 if(kind==='registers'){
  const q=req.query;if(Object.keys(q).some(k=>!['include_inactive','page','limit','sort_by','sort_order'].includes(k)))invalid();
  if(q.include_inactive!==undefined&&!['true','false'].includes(q.include_inactive))invalid();
  req.input={...parsePage(q,['name','code']),include_inactive:q.include_inactive==='true'};
 }else{
  if(Object.keys(req.query).length)invalid();
  const b=req.body??{},fields=kind==='open'?['cash_register_id']:kind==='createRegister'?['name','code']:kind==='updateRegister'?['name','code','is_active']:[];
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))invalid();
  if(fields.length&&!Object.keys(b).length)invalid();
  if(kind==='createRegister'&&(!('name'in b)||!('code'in b)))invalid();
  for(const [k,max] of [['name',100],['code',40]])if(b[k]!==undefined&&(typeof b[k]!=='string'||!b[k].trim()||[...b[k]].length>max))invalid();
  if(b.is_active!==undefined&&typeof b.is_active!=='boolean')invalid();
  req.input=kind==='open'?{cash_register_id:parseId(b.cash_register_id)}:b;
 }next();
};}
