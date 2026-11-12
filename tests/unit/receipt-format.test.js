import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfText } from '../../src/integrations/pdf.js';
import { escapeHtml } from '../../src/helpers/receipt.helper.js';
test('receipt formatting escapes HTML and marks unsupported PDF glyphs',()=>{
 assert.equal(escapeHtml('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');
 assert.equal(pdfText('Café Tiếng Việt\n茶 😀\u0000'),'Café Tiếng Việt\n[U+8336] [U+1F600]');
});

import { renderReceiptHtml,receiptLines } from '../../src/helpers/receipt.helper.js';
import { renderReceiptPdf } from '../../src/integrations/pdf.js';
const sample=()=>({paper_mm:'value_58',cafe_name_snapshot:"$$ $& $` $'",cashier_name_snapshot:'Tester',receipt_number:'RCT-1',order:{order_number:'ORD-1',grand_total:'75000.00',notes:"$$ $& $` $'"},payment:{method:'cash',amount:'75000.00',cash_received:'100000.00',cash_change:'25000.00'},items:[],discounts:[],taxes:[],charges:[]});
test('receipt HTML preserves replacement tokens in captured names and notes',()=>{const receipt=sample(),html=renderReceiptHtml(receipt);assert.equal((html.match(/<!doctype html>/g)||[]).length,1);for(const line of receiptLines(receipt))assert.ok(html.includes(escapeHtml(line)),line);});
test('PDF collapses excess blank lines without losing visible text',()=>{assert.equal(pdfText('before'+'\n'.repeat(4000)+'after'),'before\n\nafter');});
test('PDF aborts page explosion instead of buffering unbounded layout',async()=>{const r=sample();r.items=Array.from({length:100},()=>({product_name:'X'.repeat(4000),variants:[],addons:[],special_instructions:'W'.repeat(4000)}));await assert.rejects(renderReceiptPdf(r),/layout limit/);});

test('PDF page ceiling rejects many short lines below text ceiling',async()=>{const r=sample();r.order.notes='a\n'.repeat(30000);await assert.rejects(renderReceiptPdf(r),/layout limit/);});
test('newline-heavy 100-line receipt stays bounded and yields event loop',async()=>{const r=sample();r.items=Array.from({length:100},()=>({product_name:'Tea',variants:[],addons:[],special_instructions:'\n'.repeat(4000)}));let ticked=false;const timer=setTimeout(()=>{ticked=true;},0);try{const bytes=await renderReceiptPdf(r);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length<200000);assert.ok(ticked);}finally{clearTimeout(timer);}});
