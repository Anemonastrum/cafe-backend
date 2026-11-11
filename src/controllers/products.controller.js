import * as products from '../services/products.service.js';
import { getMenu } from '../services/menu.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
export const productsController=(db,config)=>({
  list:async(req,res)=>res.json(toWire(await products.listProducts(db,req.actor,req.input))),
  get:async(req,res)=>res.json({data:toWire(await products.getProduct(db,req.actor,req.entityId))}),
  create:async(req,res)=>res.status(201).json({data:toWire(await products.createProduct(db,req.actor,req.input,requestContext(req)))}),
  update:async(req,res)=>res.json({data:toWire(await products.updateProduct(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
  availability:async(req,res)=>res.json({data:toWire(await products.setAvailability(db,req.actor,{id:req.entityId,...req.input},requestContext(req)))}),
  promotion:async(req,res)=>res.json({data:toWire(await products.setPromotion(db,req.actor,{id:req.entityId,patch:req.input},requestContext(req)))}),
  archive:async(req,res)=>res.json({data:toWire(await products.archiveProduct(db,req.actor,req.entityId,requestContext(req)))}),
  restore:async(req,res)=>res.json({data:toWire(await products.restoreProduct(db,req.actor,req.entityId,requestContext(req)))}),
  image:async(req,res)=>res.json({data:toWire(await products.replaceProductImage(db,req.actor,{id:req.entityId,file:req.file},requestContext(req),config.storageDir))}),
  removeImage:async(req,res)=>{await products.replaceProductImage(db,req.actor,{id:req.entityId,file:null},requestContext(req),config.storageDir);res.status(204).end();},
  menu:async(req,res)=>res.json({data:toWire(await getMenu(db,req.actor,req.input))}),
});
