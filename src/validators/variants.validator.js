import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
const invalid=()=>{throw new AppError(422,'INVALID_VARIANT','Invalid variant input');};
export function variantsInput(kind){return(req,res,next)=>{
 if(req.params.productId!==undefined)req.productId=parseId(req.params.productId);
 if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
 if(Object.keys(req.query).length)invalid();
 const b=req.body??{},group=kind.endsWith('Group'),create=kind.startsWith('create');
 const fields=group?['name','is_required','sort_order']:kind.endsWith('Option')?['name','price_delta','is_enabled','sort_order']:[];
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))invalid();
 if(fields.length&&!Object.keys(b).length)invalid();
 if((create||b.name!==undefined)&&(typeof b.name!=='string'||!b.name.trim()||[...b.name].length>120))invalid();
 for(const k of ['is_required','is_enabled'])if(b[k]!==undefined&&typeof b[k]!=='boolean')invalid();
 if(b.sort_order!==undefined&&(!Number.isInteger(b.sort_order)||b.sort_order< -2147483648||b.sort_order>2147483647))invalid();
 if(b.price_delta!==undefined&&(typeof b.price_delta!=='string'||! /^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(b.price_delta)))invalid();
 req.input=b;next();
};}
