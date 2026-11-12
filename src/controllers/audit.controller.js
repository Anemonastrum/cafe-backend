import { listAuditLogs,getAuditLog } from '../services/audit.service.js';
import { toWire } from '../utils/serialize.js';
export const auditController=db=>({list:async(req,res)=>res.json(toWire(await listAuditLogs(db,req.actor,req.input))),detail:async(req,res)=>res.json({data:toWire(await getAuditLog(db,req.actor,req.entityId))})});
