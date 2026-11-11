import * as categories from '../services/categories.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export const categoriesController=db=>({
  list:async(req,res)=>res.json(toWire(await categories.listCategories(db,req.actor,req.input))),
  get:async(req,res)=>res.json({data:toWire(await categories.getCategory(db,req.actor,req.entityId))}),
  create:async(req,res)=>res.status(201).json({data:toWire(await categories.createCategory(db,req.actor,req.input,requestContext(req)))}),
  update:async(req,res)=>res.json({data:toWire(await categories.updateCategory(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
  status:async(req,res)=>res.json({data:toWire(await categories.setCategoryStatus(db,req.actor,{id:req.entityId,...req.input},requestContext(req)))}),
});
