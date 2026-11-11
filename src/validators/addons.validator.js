import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
const invalid=()=>{throw new AppError(422,'INVALID_ADDON','Invalid addon input');};
export function addonsInput(kind){return(req,res,next)=>{
 if(req.params.productId!==undefined)req.productId=parseId(req.params.productId);
 if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
 if(Object.keys(req.query).length)invalid();
 const b=req.body??{},group=kind.endsWith('Group'),create=kind.startsWith('create');
 const fields=group?['name','min_select','max_select','sort_order']:kind.endsWith('Option')?['name','price','is_enabled','sort_order']:[];
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))invalid();
 if(fields.length&&!Object.keys(b).length)invalid();
 if((create||b.name!==undefined)&&(typeof b.name!=='string'||!b.name.trim()||[...b.name].length>120))invalid();
 if(b.is_enabled!==undefined&&typeof b.is_enabled!=='boolean')invalid();
 for(const k of ['min_select','max_select'])if(b[k]!==undefined&&(!Number.isInteger(b[k])||b[k]<0||b[k]>65535))invalid();
 if(b.sort_order!==undefined&&(!Number.isInteger(b.sort_order)||b.sort_order< -2147483648||b.sort_order>2147483647))invalid();
 if(b.price!==undefined&&(typeof b.price!=='string'||!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(b.price)))invalid();
 req.input=b;next();
};}
