import * as payments from '../services/payment.service.js';
import { requestContext } from './auth.controller.js';
import { toWire } from '../utils/serialize.js';
export const paymentsController=db=>({
 get:async(req,res)=>res.json({data:toWire(await payments.getPayment(db,req.actor,req.entityId))}),
 orderList:async(req,res)=>res.json(toWire(await payments.listOrderPayments(db,req.actor,{orderId:req.orderId,query:req.input}))),
 adminList:async(req,res)=>res.json(toWire(await payments.listPayments(db,req.actor,req.input))),
 events:async(req,res)=>res.json(toWire(await payments.listPaymentEvents(db,req.actor,{id:req.entityId,query:req.input}))),
 qris:async(req,res)=>{const result=await payments.createQrisPayment(db,req.actor,{orderId:req.orderId,...req.input},requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.payment)});},
 confirm:async(req,res)=>res.json({data:toWire(await payments.confirmManual(db,req.actor,{id:req.entityId},requestContext(req)))}),
 cash:async(req,res)=>{const result=await payments.createCashPayment(db,req.actor,{orderId:req.orderId,...req.input},requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.payment)});}});
