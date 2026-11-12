import { getReport } from '../services/reports.service.js';
import { toWire } from '../utils/serialize.js';
export const reportsController=db=>async(req,res)=>res.json(toWire(await getReport(db,req.actor,req.input)));
