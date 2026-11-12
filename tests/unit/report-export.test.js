import assert from 'node:assert/strict';
import { test,mock } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { writeWorkbook } from '../../src/integrations/spreadsheet.js';
import { readdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportReport } from '../../src/services/reports.service.js';
import ExcelJS from 'exceljs';
const actor={role:'admin'},range={from:new Date('2026-01-01'),to:new Date('2026-01-02')};
const fake=({total=1,row}={})=>({$transaction:async fn=>fn({$queryRaw:async query=>query.sql.startsWith('SELECT COUNT(*) AS total')?[{total:BigInt(total)}]:[row??{product_id:18446744073709551615n,product_name:'Tea',category_name:'Drinks',quantity:1n,revenue:'999999999999.99'}]})});
test('export guards reject excessive rows and cleanup on aborted generation; large IDs stay exact',async()=>{
 const artifacts=async()=>(await readdir(tmpdir())).filter(n=>n.startsWith('cafe-export-')).sort(),before=await artifacts();
 await assert.rejects(exportReport(fake({total:100001}),actor,{report:'products',format:'csv',range}),{code:'EXPORT_TOO_LARGE'});
 await assert.rejects(exportReport(fake({row:{product_name:'x'.repeat(64*1024*1024)}}),actor,{report:'products',format:'csv',range}),{code:'EXPORT_TOO_LARGE'});
 const file=await exportReport(fake(),actor,{report:'products',format:'xlsx',range});
 const chunks=[];for await(const chunk of file.stream)chunks.push(chunk);await file.cleanup();
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.concat(chunks));assert.equal(workbook.worksheets[0].getCell('A2').value,'18446744073709551615');assert.equal(workbook.worksheets[0].getCell('E2').value,'999999999999.99');
 const signal=new AbortController();signal.abort();await assert.rejects(exportReport(fake(),actor,{report:'products',format:'csv',range,signal:signal.signal}),{name:'AbortError'});
 assert.deepEqual(await artifacts(),before);
});

const promptly=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Export hung')),1500);})]);}finally{clearTimeout(timer);}};
test('XLSX early output ENOSPC rejects promptly and destroys output',async()=>{
 const output=new Writable({write(chunk,encoding,callback){callback(Object.assign(new Error('Disk full'),{code:'ENOSPC'}));}});
 await assert.rejects(promptly(writeWorkbook([{name:'Tea'}],['name'],output)),{code:'ENOSPC'});assert.equal(output.destroyed,true);
});
test('XLSX cancellation during pending output rejects promptly and destroys output',async()=>{
 const abort=new AbortController();const output=new Writable({write(){abort.abort();}});
 await assert.rejects(promptly(writeWorkbook([{name:'Tea'}],['name'],output,abort.signal)),{name:'AbortError'});assert.equal(output.destroyed,true);
});
test('export cleans private artifact after early disk failure',async()=>{
 const before=(await readdir(tmpdir())).filter(n=>n.startsWith('cafe-export-')).sort(),create=fs.createWriteStream;
 const m=mock.method(fs,'createWriteStream',(...args)=>{const output=create(...args);output.once('open',()=>output.destroy(Object.assign(new Error('Disk full'),{code:'ENOSPC'})));return output;});syncBuiltinESMExports();
 try{await assert.rejects(promptly(exportReport(fake(),actor,{report:'products',format:'xlsx',range})),{code:'ENOSPC'});assert.deepEqual((await readdir(tmpdir())).filter(n=>n.startsWith('cafe-export-')).sort(),before);}
 finally{m.mock.restore();syncBuiltinESMExports();for(const dir of await readdir(tmpdir()))if(dir.startsWith('cafe-export-')&&!before.includes(dir))await rm(join(tmpdir(),dir),{recursive:true,force:true});}
});
