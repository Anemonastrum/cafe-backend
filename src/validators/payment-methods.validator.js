import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
export function methodInput(req,res,next){
  const invalid=()=>{throw new AppError(422,'INVALID_METHOD','Invalid payment method input');};
  if(req.method==='GET'){
    if(Object.keys(req.query).some(k=>k!=='include_disabled')||(req.query.include_disabled!==undefined&&!['true','false'].includes(req.query.include_disabled)))invalid();
    req.input={include_disabled:req.query.include_disabled==='true'};
  }else{
    if(Object.keys(req.query).length)invalid();
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(k=>!['provider','is_enabled'].includes(k)))invalid();
    if(body.is_enabled!==undefined&&typeof body.is_enabled!=='boolean')invalid();
    if(body.provider!==undefined&&body.provider!=='manual')invalid();
    req.entityId=parseId(req.params.id);req.input=body;
  }
  next();
}
