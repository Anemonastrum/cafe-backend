import * as payments from '../services/payment.service.js';
import { requestContext } from './auth.controller.js';
import { toWire } from '../utils/serialize.js';
export const paymentsController=db=>({
 qris:async(req,res)=>{const result=await payments.createQrisPayment(db,req.actor,{orderId:req.orderId,...req.input},requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.payment)});},
 confirm:async(req,res)=>res.json({data:toWire(await payments.confirmManual(db,req.actor,{id:req.entityId},requestContext(req)))}),
 cash:async(req,res)=>{const result=await payments.createCashPayment(db,req.actor,{orderId:req.orderId,...req.input},requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.payment)});}});
