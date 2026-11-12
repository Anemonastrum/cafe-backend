import { getReport } from '../services/reports.service.js';
import { toWire } from '../utils/serialize.js';
export const reportsController=db=>async(req,res)=>res.json(toWire(await getReport(db,req.actor,req.input)));

import { exportReport } from '../services/reports.service.js';
import { pipeline } from 'node:stream/promises';
export const exportController=db=>async(req,res)=>{
 const abort=new AbortController(),onClose=()=>{if(!res.writableFinished)abort.abort();};res.on('close',onClose);let file;
 try{file=await exportReport(db,req.actor,{...req.input,signal:abort.signal});if(abort.signal.aborted)return;res.set({'Content-Type':file.contentType,'Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store'});await pipeline(file.stream,res,{signal:abort.signal});}
 catch(error){if(!abort.signal.aborted)throw error;}
 finally{res.off('close',onClose);if(file){file.stream.destroy();await file.cleanup();}}
};
