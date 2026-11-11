import * as shifts from '../services/shifts.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export const shiftsController=db=>({
 registers:async(req,res)=>res.json(toWire(await shifts.listRegisters(db,req.actor,req.input))),
 createRegister:async(req,res)=>res.status(201).json({data:toWire(await shifts.createRegister(db,req.actor,req.input,requestContext(req)))}),
 updateRegister:async(req,res)=>res.json({data:toWire(await shifts.updateRegister(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
 current:async(req,res)=>res.json({data:toWire(await shifts.currentShift(db,req.actor))}),
 open:async(req,res)=>res.status(201).json({data:toWire(await shifts.openShift(db,req.actor,req.input,requestContext(req)))}),
});
