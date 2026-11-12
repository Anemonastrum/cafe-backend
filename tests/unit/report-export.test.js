import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir } from 'node:fs/promises';
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
