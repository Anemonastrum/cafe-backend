import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid = () => { throw new AppError(422,'INVALID_RULE','Invalid pricing rule'); };
export function ruleInput(kind) {
  return (req,res,next) => {
    if(req.method==='GET') {
      if(Object.keys(req.query).some(k=>!['is_active','search','page','limit','sort_by','sort_order'].includes(k))) invalid();
      const {is_active,search}=req.query;
      if(is_active!==undefined && !['true','false'].includes(is_active)) invalid();
      if(search!==undefined && (typeof search!=='string'||search.length>120)) invalid();
      req.input={...parsePage(req.query,['name','created_at']),is_active:is_active===undefined?undefined:is_active==='true',search};
    } else {
      if(Object.keys(req.query).length) invalid();
      const fields=kind==='taxes'?['name','rate_percent','is_inclusive','is_active']:kind==='service-charges'?['name','calculation','value','is_auto_applied','is_active']:['name','code','calculation','value','starts_at','ends_at','is_active'];
      const body=req.body;
      if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(k=>!fields.includes(k))) invalid();
      if(req.method==='POST' && (body.name===undefined || (kind==='discounts' && body.value===undefined))) invalid();
      if(body.name!==undefined && (typeof body.name!=='string'||!body.name.trim()||[...body.name].length>(kind==='discounts'?120:100))) invalid();
      if(body.code!==undefined && body.code!==null && (typeof body.code!=='string'||!body.code.trim()||[...body.code].length>60)) invalid();
      for(const k of ['is_active','is_inclusive','is_auto_applied']) if(body[k]!==undefined&&typeof body[k]!=='boolean') invalid();
      if(body.calculation!==undefined&&!['fixed','percent'].includes(body.calculation)) invalid();
      for(const k of ['value','rate_percent']) if(body[k]!==undefined&&(typeof body[k]!=='string'||!(k==='value'?/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/:/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/).test(body[k]))) invalid();
      const patch={...body};
      for(const k of ['starts_at','ends_at']) if(body[k]!==undefined&&body[k]!==null) {
        if(typeof body[k]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(body[k])||!Number.isFinite(Date.parse(body[k]))) invalid();
        const local = body[k].slice(0,19);
        const calendar = new Date(local + 'Z');
        if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,19) !== local) invalid();
        patch[k]=new Date(body[k]);
        if (patch[k].getUTCFullYear() < 1000 || patch[k].getUTCFullYear() > 9999) invalid();
      }
      req.input=patch;
      if(req.params.id!==undefined) req.entityId=parseId(req.params.id);
    }
    next();
  };
}
export function validateEffectiveRule(kind,row) {
  if(kind==='taxes') { if(Number(row.rate_percent)<0||Number(row.rate_percent)>100) invalid(); }
  else {
    if(Number(row.value)<0||(row.calculation==='percent'&&Number(row.value)>100)) invalid();
    if(kind==='discounts'&&row.starts_at&&row.ends_at&&row.ends_at<=row.starts_at) invalid();
  }
}
