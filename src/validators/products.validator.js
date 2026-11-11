import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid=()=>{throw new AppError(422,'INVALID_PRODUCT','Invalid product input');};
function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value))invalid();
  const local=value.slice(0,19),calendar=new Date(local+'Z'),parsed=new Date(value);
  if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,19)!==local||!Number.isFinite(parsed.getTime())||parsed.getUTCFullYear()<1000||parsed.getUTCFullYear()>9999)invalid();return parsed;
}
export function productsInput(kind){return(req,res,next)=>{
  if(req.params.id!==undefined)req.entityId=parseId(req.params.id);
  if(kind==='list'){
    const q=req.query;
    if(Object.keys(q).some(k=>!['search','category_id','enabled','include_archived','page','limit','sort_by','sort_order'].includes(k)))invalid();
    for(const key of ['enabled','include_archived'])if(q[key]!==undefined&&!['true','false'].includes(q[key]))invalid();
    if(q.search!==undefined&&(typeof q.search!=='string'||[...q.search].length>180))invalid();
    req.input={...parsePage(q,['name','base_price','sort_order','created_at']),search:q.search,
      category_id:q.category_id===undefined?undefined:parseId(q.category_id),enabled:q.enabled===undefined?undefined:q.enabled==='true',include_archived:q.include_archived==='true'};
  }else{
    if(Object.keys(req.query).length)invalid();
    const b=req.body??{};
    const fields=['create','update'].includes(kind)?['category_id','name','sku','description','base_price','tax_id','image_url',...(kind==='update'?['sort_order']:[])]:kind==='availability'?['is_enabled']:kind==='promotion'?['promo_price','promo_starts_at','promo_ends_at']:[];
    if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))invalid();
    if(['create','update','availability','promotion'].includes(kind)&&!Object.keys(b).length)invalid();
    if(kind==='create'&&['category_id','name','base_price'].some(k=>b[k]===undefined))invalid();
    const patch={...b};
    for(const [key,max,nullable] of [['name',180,false],['sku',64,true],['description',4000,true]])if(b[key]!==undefined&&!(nullable&&b[key]===null)&&(typeof b[key]!=='string'||(key!=='description'&&!b[key].trim())||[...b[key]].length>max))invalid();
    for(const key of ['category_id','tax_id'])if(b[key]!==undefined)patch[key]=key==='tax_id'&&b[key]===null?null:parseId(b[key]);
    for(const key of ['base_price','promo_price'])if(b[key]!==undefined&&!(key==='promo_price'&&b[key]===null)){
      if(typeof b[key]!=='string'||!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(b[key]))invalid();
    }
    for(const key of ['promo_starts_at','promo_ends_at'])if(b[key]!==undefined&&b[key]!==null)patch[key]=date(b[key]);
    if(kind==='availability'&&typeof b.is_enabled!=='boolean')invalid();
    if(b.sort_order!==undefined&&(!Number.isInteger(b.sort_order)||b.sort_order< -2147483648||b.sort_order>2147483647))invalid();
    if(b.image_url!==undefined&&b.image_url!==null){
      try{const url=new URL(b.image_url);if(typeof b.image_url!=='string'||b.image_url.length>1024||!['http:','https:'].includes(url.protocol)||url.username||url.password)invalid();}catch{invalid();}
    }
    if(b.promo_price===null){patch.promo_starts_at=null;patch.promo_ends_at=null;}
    req.input=patch;
  }next();
};}
export function validatePromotion(row){
  if(row.promo_price!=null&&new Prisma.Decimal(row.promo_price).gt(row.base_price))invalid();
  if(row.promo_starts_at&&row.promo_ends_at&&row.promo_ends_at<=row.promo_starts_at)invalid();
  if(row.promo_price==null&&(row.promo_starts_at||row.promo_ends_at))invalid();
}
export const promoActive=(row,now=new Date())=>row.promo_price!=null&&(!row.promo_starts_at||row.promo_starts_at<=now)&&(!row.promo_ends_at||row.promo_ends_at>now);
