import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test,mock } from 'node:test';
import { readdir } from 'node:fs/promises';
import fs,{ watch } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
const artifacts=async()=>(await readdir(tmpdir())).filter(n=>n.startsWith('cafe-export-')).sort();
test('p10-t4 acceptance: real CSV/XLSX agree with reports; exact IDs, safe text and private cleanup',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),before=await artifacts();let audit;
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);const order=await f.api('/orders','POST',{...f.input,items:[{product_id:String(f.product.id),quantity:3}]},f.cashier);assert.equal(order.status,201);
  const paid=await request(f.h,{path:'/orders/'+order.body.data.id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(paid.status,201);
  for(const report of ['sales','payments','products','categories','employees','orders','cancellations'])for(const format of ['csv','xlsx']){
   const response=await f.api('/admin/reports/export?report='+report+'&format='+format);assert.equal(response.status,200,JSON.stringify(response.body));assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(response.headers.get('cache-control'),'no-store');
   const json=(await f.api('/admin/reports/'+report)).body;
   if(format==='xlsx'){assert.match(response.headers.get('content-type'),/spreadsheetml/);const w=new ExcelJS.Workbook();await w.xlsx.load(response.bytes);const sheet=w.worksheets[0],headers=sheet.getRow(1).values.slice(1);assert.equal(sheet.rowCount,json.data.length+1);for(let n=0;n<json.data.length;n++)for(const [i,key] of headers.entries()){const value=sheet.getCell(n+2,i+1).value;assert.equal(value,json.data[n][key]==null?'':String(json.data[n][key]));assert.equal(sheet.getCell(n+2,i+1).type,ExcelJS.ValueType.String);}}
   else{assert.match(response.headers.get('content-type'),/text\/csv/);if(report==='sales')assert.ok(response.body.includes('"75000.00"'));}
  }
  const item=await db.order_items.findFirst({where:{order_id:BigInt(order.body.data.id)}}),payload=' =HYPERLINK("bad"), café\n茶';await db.order_items.update({where:{id:item.id},data:{product_name:payload,category_name:'@SUM(1)',line_total:'999999999999.99'}});
  const csv=await f.api('/admin/reports/export?report=products&format=csv');assert.ok(csv.body.includes(`"' =HYPERLINK(""bad""), café\n茶"`));assert.ok(csv.body.includes(`"'@SUM(1)"`));assert.ok(csv.body.includes('"999999999999.99"'));
  const workbook=await f.api('/admin/reports/export?report=products&format=xlsx');const w=new ExcelJS.Workbook();await w.xlsx.load(workbook.bytes);assert.equal(w.worksheets[0].getCell('B2').value,payload);assert.equal(w.worksheets[0].getCell('E2').value,'999999999999.99');
  await db.orders.update({where:{id:BigInt(order.body.data.id)},data:{status:'cancelled',cancelled_at:new Date(),cancel_reason:'=bad',cancelled_by_user_id:f.adminA.id}});const ids=await f.api('/admin/reports/export?report=cancellations&format=xlsx');const iw=new ExcelJS.Workbook();await iw.xlsx.load(ids.bytes);assert.equal(iw.worksheets[0].getCell('A2').value,order.body.data.id);
  for(const [query,status] of [['report=sales&format=pdf',422],['report=no&format=csv',422],['report=sales&format=csv&limit=1',422],['report=sales&format=csv&from=2020-01-01T00:00:00Z&to=2022-01-01T00:00:00Z',422]])assert.equal((await f.api('/admin/reports/export?'+query)).status,status);
  assert.equal((await f.api('/admin/reports/export?report=sales&format=csv','GET',undefined,{})).status,401);assert.equal((await f.api('/admin/reports/export?report=sales&format=csv','GET',undefined,f.cashier)).status,403);
  const create=fs.createWriteStream,m=mock.method(fs,'createWriteStream',(...args)=>{const output=create(...args);output.once('open',()=>output.destroy(Object.assign(new Error('Disk full'),{code:'ENOSPC'})));return output;});syncBuiltinESMExports();
  try{const failed=await f.api('/admin/reports/export?report=products&format=xlsx');assert.equal(failed.status,500);assert.equal(failed.headers.get('content-disposition'),null);assert.deepEqual(await artifacts(),before);}finally{m.mock.restore();syncBuiltinESMExports();}
  const abort=new AbortController();let observed=false;
  const watcher=watch(tmpdir(),(event,name)=>{if(String(name).startsWith('cafe-export-')){observed=true;abort.abort();}});
  try{await assert.rejects(fetch(f.h.baseUrl+'/api/v1/admin/reports/export?report=products&format=xlsx',{headers:{Cookie:f.admin.cookie},signal:abort.signal}));}finally{watcher.close();}
  assert.equal(observed,true);
 }finally{mock.restoreAll();await f.cleanup();}
 await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(await artifacts(),before);
}));
