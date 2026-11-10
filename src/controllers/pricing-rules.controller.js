import * as rules from '../services/pricing-rules.service.js';
import { toWire } from '../utils/serialize.js';
import { requestContext } from './auth.controller.js';
const rowWire=row=>({...toWire(row),...(row.rate_percent===undefined?{}:{rate_percent:row.rate_percent.toFixed(4)})});
export function pricingRulesController(db,kind){return {
  list:async(req,res)=>{const result=await rules.listRules(db,req.actor,kind,req.input);res.json({...result,data:result.data.map(rowWire)});},
  create:async(req,res)=>res.status(201).json({data:rowWire(await rules.createRule(db,req.actor,kind,req.input,requestContext(req)))}),
  update:async(req,res)=>res.json({data:rowWire(await rules.updateRule(db,req.actor,kind,{id:req.entityId,patch:req.input},requestContext(req)))}),
};}
