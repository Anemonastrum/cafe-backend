import { requireAdmin,snapshot,queryReport } from './report-query.service.js';
export const getReport=(db,actor,input)=>{requireAdmin(actor);return snapshot(db,tx=>queryReport(tx,input));};

import { mkdtemp,chmod,rm,stat,open } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toWire } from '../utils/serialize.js';
import { csvCell } from '../utils/csv.js';
import { writeWorkbook } from '../integrations/spreadsheet.js';
import { AppError } from '../utils/errors.js';
const columns={sales:['start','count','gross_sales','discounts','tax','service_charges','net_sales','revenue','average_order_value'],payments:['code','status','count','amount'],products:['product_id','product_name','category_name','quantity','revenue'],categories:['category_name','quantity','revenue'],employees:['owner_id','count','revenue','average_order_value'],orders:['status','count','held_count','unpaid_count'],cancellations:['order_id','cancelled_at','reason','actor','approval']};
const rowLimit=100000,byteLimit=64*1024*1024;
const tooLarge=()=>{throw new AppError(422,'EXPORT_TOO_LARGE','Export exceeds 100000 rows or 64 MiB; narrow date range');};
export async function exportReport(db,actor,{report,format,range,signal}){
 requireAdmin(actor);if(!columns[report]||!['csv','xlsx'].includes(format))throw new AppError(422,'INVALID_EXPORT','Unsupported report or format');signal?.throwIfAborted();
 const rows=await snapshot(db,async tx=>{const rows=[];let bytes=0;for(let skip=0;;skip+=1000){signal?.throwIfAborted();const result=await queryReport(tx,{report,range,group_by:'day',page:{page:skip/1000+1,limit:1000,skip}});if((result.meta.total??result.data.length)>rowLimit)tooLarge();for(const row of toWire(result.data)){bytes+=Buffer.byteLength(JSON.stringify(row));if(bytes>byteLimit||rows.length===rowLimit)tooLarge();rows.push(row);}if(report==='sales'||rows.length>=result.meta.total)break;}return rows;});
 signal?.throwIfAborted();const dir=await mkdtemp(join(tmpdir(),'cafe-export-')),path=join(dir,'report.'+format),cleanup=()=>rm(dir,{recursive:true,force:true});
 try{
  await chmod(dir,0o700);
  if(format==='csv'){
   const file=await open(path,'wx',0o600);try{let bytes=0;const write=async values=>{signal?.throwIfAborted();const line=values.map(csvCell).join(',')+'\r\n';bytes+=Buffer.byteLength(line);if(bytes>byteLimit)tooLarge();await file.writeFile(line);};await write(columns[report]);for(const row of rows)await write(columns[report].map(k=>row[k]));}finally{await file.close();}
  }else{
   const output=createWriteStream(path,{flags:'wx',mode:0o600});
   await writeWorkbook(rows,columns[report],output,signal);
  }
  signal?.throwIfAborted();if((await stat(path)).size>byteLimit)tooLarge();const stream=createReadStream(path);stream.on('close',()=>cleanup().catch(error=>console.error('Export cleanup failed',error.code)));return{stream,cleanup,filename:report+'.'+format,contentType:format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 }catch(error){await cleanup();throw error;}
}
