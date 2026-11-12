import * as payments from '../services/payment.service.js';
import { requestContext } from './auth.controller.js';
import { toWire } from '../utils/serialize.js';
export const paymentsController=db=>({cash:async(req,res)=>{const result=await payments.createCashPayment(db,req.actor,{orderId:req.orderId,...req.input},requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.payment)});}});
