import * as shifts from '../services/shifts.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export const shiftsController=db=>({
 registers:async(req,res)=>res.json(toWire(await shifts.listRegisters(db,req.actor,req.input))),
 createRegister:async(req,res)=>res.status(201).json({data:toWire(await shifts.createRegister(db,req.actor,req.input,requestContext(req)))}),
 updateRegister:async(req,res)=>res.json({data:toWire(await shifts.updateRegister(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
 close:async(req,res)=>res.json({data:toWire(await shifts.closeShift(db,req.actor,{id:req.entityId,...req.input},requestContext(req)))}),
 mine:async(req,res)=>res.json(toWire(await shifts.listShifts(db,req.actor,{...req.input,mine:true}))),
 history:async(req,res)=>res.json(toWire(await shifts.listShifts(db,req.actor,req.input))),
 detail:async(req,res)=>res.json({data:toWire(await shifts.getShift(db,req.actor,req.entityId))}),
 summary:async(req,res)=>res.json({data:toWire(await shifts.summarizeShift(db,req.actor,req.entityId))}),
 orders:async(req,res)=>res.json(toWire(await shifts.listShiftOrders(db,req.actor,{id:req.entityId,query:req.input}))),
 current:async(req,res)=>res.json({data:toWire(await shifts.currentShift(db,req.actor))}),
 open:async(req,res)=>res.status(201).json({data:toWire(await shifts.openShift(db,req.actor,req.input,requestContext(req)))}),
});
