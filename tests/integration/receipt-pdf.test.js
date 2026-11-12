import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import PDFDocument from 'pdfkit';
import { PDFParse } from 'pdf-parse';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
test('p09-t2 acceptance: parsed PDF snapshot totals, pagination, scope and export failure',async t=>withDatabase(async db=>{
 const f=await orderFixture(db);
 try{
  await f.api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)},f.cashier);
  await db.products.update({where:{id:f.product.id},data:{name:'Café <tea>\nsecond line'}});
  const created=await f.api('/orders','POST',{...f.input,client_request_id:randomUUID(),items:[{product_id:String(f.product.id),quantity:3}]},f.cashier);assert.equal(created.status,201);
  const pay=await request(f.h,{path:'/orders/'+created.body.data.id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(pay.status,201);
  const receipt=await db.receipts.findUnique({where:{payment_id:BigInt(pay.body.data.id)}}),path='/receipts/'+receipt.id+'/pdf',count=()=>db.receipt_events.count({where:{receipt_id:receipt.id,action:'pdf_export'}});
  for(const session of [{},f.other])assert.equal((await f.api(path,'GET',undefined,session)).status,session===f.other?404:401);
  assert.equal((await f.api(path+'?paper_mm=100','GET',undefined,f.cashier)).status,422);assert.equal((await f.api(path+'?url=https://evil.test')).status,422);assert.equal(await count(),0);
  for(const [width,session] of [['58',f.cashier],['80',f.admin]]){
   const before=await count(),r=await f.api(path+'?paper_mm='+width,'GET',undefined,session);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.headers.get('content-type'),'application/pdf');assert.equal(r.bytes.subarray(0,5).toString(),'%PDF-');assert.match(r.headers.get('content-disposition'),new RegExp('attachment; filename="receipt-'+receipt.id+'\\.pdf"'));assert.match(r.headers.get('cache-control'),/private, no-store/);
   const parser=new PDFParse({data:new Uint8Array(r.bytes)});try{const text=await parser.getText(),info=await parser.getInfo({parsePageInfo:true});assert.match(text.text,/75000.00/);assert.match(text.text,/25000.00/);assert.match(text.text,/Café <tea>/);assert.match(text.text,/second line/);assert.ok(Math.abs(info.pages[0].width-Number(width)*72/25.4)<0.1);}finally{await parser.destroy();}assert.equal(await count(),before+1);
  }
  // Controlled generator failure, mounted HTTP remains real; no success event may be recorded.
  const before=await count(),mock=t.mock.method(PDFDocument.prototype,'end',()=>{throw new Error('synthetic PDF failure');});
  try{assert.equal((await f.api(path,'GET',undefined,f.cashier)).status,500);assert.equal(await count(),before);}finally{mock.mock.restore();}
  assert.equal((await db.receipts.findUnique({where:{id:receipt.id}})).pdf_url,null);
  const source=(await db.order_items.findFirst({where:{order_id:BigInt(created.body.data.id)}}));const {id,created_at,...data}=source;
  for(let i=1;i<100;i++)await db.order_items.create({data:{...data,special_instructions:'wrapping note '.repeat(20)}});
  const long=await f.api(path+'?paper_mm=58','GET',undefined,f.cashier);assert.equal(long.status,200);const parser=new PDFParse({data:new Uint8Array(long.bytes)});try{const result=await parser.getText();assert.ok(result.total>1);assert.match(result.text,/75000.00/);}finally{await parser.destroy();}
  const beforeLimit=await count();await db.order_items.updateMany({where:{order_id:BigInt(created.body.data.id)},data:{special_instructions:'W'.repeat(4000)}});assert.equal((await f.api(path,'GET',undefined,f.cashier)).status,500);assert.equal(await count(),beforeLimit);
  await db.users.update({where:{id:f.cashierA.id},data:{is_active:false}});assert.equal((await f.api(path,'GET',undefined,f.cashier)).status,401);
 }finally{await f.cleanup();}
}));
