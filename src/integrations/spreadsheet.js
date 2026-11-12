import ExcelJS from 'exceljs';
import { finished } from 'node:stream/promises';
export async function writeWorkbook(rows,columns,stream,signal){
 signal?.throwIfAborted();
 const done=finished(stream,{cleanup:true});
 const abort=()=>stream.destroy(signal.reason),zipError=error=>stream.destroy(error);
 signal?.addEventListener('abort',abort,{once:true});
 const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream,useStyles:false,useSharedStrings:false}),sheet=workbook.addWorksheet('Report');
 workbook.zip.on('error',zipError);
 const write=async()=>{
  await workbook.promise;
  sheet.addRow(columns).commit();for(const [n,row] of rows.entries()){signal?.throwIfAborted();if(stream.destroyed)throw stream.errored??new Error('Export output closed');sheet.addRow(columns.map(k=>row[k]==null?'':String(row[k]))).commit();if(n%100===0)await new Promise(resolve=>setImmediate(resolve));}
  signal?.throwIfAborted();if(stream.destroyed)throw stream.errored??new Error('Export output closed');sheet.commit();await workbook.commit();
 };
 try{await Promise.all([write(),done]);}
 catch(error){
  // ponytail: ExcelJS4 has no writer abort; stop its ZIP and worksheet stream directly.
  workbook.zip.unpipe(stream);workbook.zip.abort();workbook.zip.destroy();sheet.stream.unpipe();sheet.stream.destroy();stream.destroy();await done.catch(()=>{});throw error;
 }finally{signal?.removeEventListener('abort',abort);}
}
