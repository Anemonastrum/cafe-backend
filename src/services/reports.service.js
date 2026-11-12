import { requireAdmin,snapshot,queryReport } from './report-query.service.js';
export const getReport=(db,actor,input)=>{requireAdmin(actor);return snapshot(db,tx=>queryReport(tx,input));};
