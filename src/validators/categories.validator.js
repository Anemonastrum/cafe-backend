import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid=()=>{throw new AppError(422,'INVALID_CATEGORY','Invalid category input');};
export function categoriesInput(kind){return(req,res,next)=>{
  if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
  if(kind==='list'){
    const q=req.query;
    if(Object.keys(q).some(k=>!['include_inactive','search','page','limit','sort_by','sort_order'].includes(k)))invalid();
    if(q.include_inactive!==undefined&&!['true','false'].includes(q.include_inactive))invalid();
    if(q.search!==undefined&&(typeof q.search!=='string'||q.search.length>120))invalid();
    req.input={...parsePage(q,['name','sort_order','created_at']),include_inactive:q.include_inactive==='true',search:q.search};
  }else{
    if(Object.keys(req.query).length)invalid();
    const b=req.body??{},fields=kind==='status'?['is_active']:kind==='get'?[]:['name','description','sort_order'];
    if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))invalid();
    if(kind!=='get'&&!Object.keys(b).length)invalid();
    if((kind==='create'||b.name!==undefined)&&(typeof b.name!=='string'||!b.name.trim()||[...b.name].length>120))invalid();
    if(b.description!==undefined&&b.description!==null&&(typeof b.description!=='string'||[...b.description].length>4000))invalid();
    if(b.sort_order!==undefined&&(!Number.isInteger(b.sort_order)||b.sort_order< -2147483648||b.sort_order>2147483647))invalid();
    if(kind==='status'&&typeof b.is_active!=='boolean')invalid();req.input=b;
  }next();
};}
