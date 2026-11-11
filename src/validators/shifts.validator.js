import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid=()=>{throw new AppError(422,'INVALID_SHIFT','Invalid register or shift input');};
export function shiftsInput(kind){return(req,res,next)=>{
 if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
 if(['mine','history','orders'].includes(kind)){
  const q=req.query,allowed=['page','limit','sort_by','sort_order',...(kind==='orders'?[]:['from','to','status']),...(kind==='history'?['cashier_id','cash_register_id']:[])];
  if(Object.keys(q).some(k=>!allowed.includes(k)))invalid();
  if(q.status!==undefined&&!['open','closed'].includes(q.status))invalid();
  const input={...parsePage(q,kind==='orders'?['created_at','order_number']:['opened_at','closed_at']),status:q.status};
  for(const k of ['cashier_id','cash_register_id'])if(q[k]!==undefined)input[k]=parseId(q[k]);
  for(const k of ['from','to'])if(q[k]!==undefined){
   const v=q[k];if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(v))invalid();
   const calendar=new Date(v.slice(0,19)+'Z'),value=new Date(v);
   if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,19)!==v.slice(0,19)||!Number.isFinite(value.getTime())||value.getUTCFullYear()<1000||value.getUTCFullYear()>9999)invalid();input[k]=value;
  }
  if(input.from&&input.to&&(input.to<=input.from||input.to-input.from>366*86400000))invalid();
  req.input=input;
 }else if(kind==='registers'){
  const q=req.query;if(Object.keys(q).some(k=>!['include_inactive','page','limit','sort_by','sort_order'].includes(k)))invalid();
  if(q.include_inactive!==undefined&&!['true','false'].includes(q.include_inactive))invalid();
  req.input={...parsePage(q,['name','code']),include_inactive:q.include_inactive==='true'};
 }else{
  if(Object.keys(req.query).length)invalid();
  const b=req.body??{},fields=kind==='open'?['cash_register_id']:kind==='createRegister'?['name','code']:kind==='updateRegister'?['name','code','is_active']:kind==='close'?['closing_notes']:[];
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))invalid();
  if(fields.length&&kind!=='close'&&!Object.keys(b).length)invalid();
  if(b.closing_notes!==undefined&&b.closing_notes!==null&&(typeof b.closing_notes!=='string'||[...b.closing_notes].length>4000))invalid();
  if(kind==='createRegister'&&(!('name'in b)||!('code'in b)))invalid();
  for(const [k,max] of [['name',100],['code',40]])if(b[k]!==undefined&&(typeof b[k]!=='string'||!b[k].trim()||[...b[k]].length>max))invalid();
  if(b.is_active!==undefined&&typeof b.is_active!=='boolean')invalid();
  req.input=kind==='open'?{cash_register_id:parseId(b.cash_register_id)}:b;
 }next();
};}
