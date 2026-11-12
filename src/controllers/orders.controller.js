import { quoteOrder } from '../services/orders.service.js';
import { toWire } from '../utils/serialize.js';
export const ordersController=db=>({quote:async(req,res)=>res.json({data:toWire(await quoteOrder(db,req.actor,req.input))})});
