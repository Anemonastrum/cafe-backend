import * as orders from '../services/orders.service.js';
import { requestContext } from './auth.controller.js';
import { toWire } from '../utils/serialize.js';
export const ordersController=db=>({
 quote:async(req,res)=>res.json({data:toWire(await orders.quoteOrder(db,req.actor,req.input))}),
 create:async(req,res)=>{const result=await orders.createOrder(db,req.actor,req.input,requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.order)});},
 get:async(req,res)=>res.json({data:toWire(await orders.getOrder(db,req.actor,req.entityId))}),
 list:async(req,res)=>res.json(toWire(await orders.listOrders(db,req.actor,req.input))),
 active:async(req,res)=>res.json(toWire(await orders.listActiveOrders(db,req.actor,req.input))),
});
