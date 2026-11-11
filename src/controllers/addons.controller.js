import * as addons from '../services/addons.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export function addonsController(db){
 const c={list:async(req,res)=>res.json({data:toWire(await addons.listAddonGroups(db,req.actor,req.productId))})};
 for(const action of ['createAddonGroup','updateAddonGroup','deleteAddonGroup','createAddonOption','updateAddonOption','deleteAddonOption'])c[action]=async(req,res)=>{
  const row=await addons[action](db,req.actor,{id:req.entityId,productId:req.productId,patch:req.input},requestContext(req));
  if(action.startsWith('delete'))res.status(204).end();else res.status(action.startsWith('create')?201:200).json({data:toWire(row)});
 };return c;
}
