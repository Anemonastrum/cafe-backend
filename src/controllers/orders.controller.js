import * as orders from '../services/orders.service.js';
import { requestContext } from './auth.controller.js';
import { toWire } from '../utils/serialize.js';
export const ordersController=db=>({
 quote:async(req,res)=>res.json({data:toWire(await orders.quoteOrder(db,req.actor,req.input))}),
 create:async(req,res)=>{const result=await orders.createOrder(db,req.actor,req.input,requestContext(req));res.status(result.replay?200:201).json({data:toWire(result.order)});},
 get:async(req,res)=>res.json({data:toWire(await orders.getOrder(db,req.actor,req.entityId))}),
 list:async(req,res)=>res.json(toWire(await orders.listOrders(db,req.actor,req.input))),
 edit:async(req,res)=>res.json({data:toWire(await orders.editOrder(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
 addItem:async(req,res)=>res.status(201).json({data:toWire(await orders.addItem(db,req.actor,{id:req.entityId,item:req.input},requestContext(req)))}),
 editItem:async(req,res)=>res.json({data:toWire(await orders.editItem(db,req.actor,{id:req.entityId,itemId:req.childId,patch:req.input},requestContext(req)))}),
 removeItem:async(req,res)=>{await orders.removeItem(db,req.actor,{id:req.entityId,itemId:req.childId},requestContext(req));res.status(204).end();},
 hold:async(req,res)=>res.json({data:toWire(await orders.setHeld(db,req.actor,{id:req.entityId,is_held:true},requestContext(req)))}),
 resume:async(req,res)=>res.json({data:toWire(await orders.setHeld(db,req.actor,{id:req.entityId,is_held:false},requestContext(req)))}),
 applyDiscount:async(req,res)=>res.status(201).json({data:toWire(await orders.applyDiscount(db,req.actor,{id:req.entityId,discount:req.input},requestContext(req)))}),
 removeDiscount:async(req,res)=>{await orders.removeDiscount(db,req.actor,{id:req.entityId,discountId:req.childId},requestContext(req));res.status(204).end();},
 active:async(req,res)=>res.json(toWire(await orders.listActiveOrders(db,req.actor,req.input))),
});
