import * as variants from '../services/variants.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export function variantsController(db){
 const c={list:async(req,res)=>res.json({data:toWire(await variants.listVariantGroups(db,req.actor,req.productId))})};
 for(const action of ['createVariantGroup','updateVariantGroup','deleteVariantGroup','createVariantOption','updateVariantOption','deleteVariantOption'])c[action]=async(req,res)=>{
  const row=await variants[action](db,req.actor,{id:req.entityId,productId:req.productId,patch:req.input},requestContext(req));
  if(action.startsWith('delete'))res.status(204).end();else res.status(action.startsWith('create')?201:200).json({data:toWire(row)});
 };return c;
}
