import * as methods from '../services/payment-methods.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export const paymentMethodsController=db=>({
  list:async(req,res)=>res.json({data:toWire(await methods.listMethods(db,req.actor,req.input))}),
  all:async(req,res)=>res.json({data:toWire(await methods.listMethods(db,req.actor,{include_disabled:true}))}),
  update:async(req,res)=>res.json({data:toWire(await methods.updateMethod(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
});
