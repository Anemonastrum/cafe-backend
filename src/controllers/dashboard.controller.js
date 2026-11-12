import { getDashboard } from '../services/dashboard.service.js';
import { toWire } from '../utils/serialize.js';
export const dashboardController=db=>async(req,res)=>res.json(toWire(await getDashboard(db,req.actor,req.input)));
