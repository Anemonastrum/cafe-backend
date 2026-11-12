import PDFDocument from 'pdfkit';
import { setImmediate } from 'node:timers/promises';
import { openSync } from 'fontkit';
import { fileURLToPath } from 'node:url';
import { receiptLines,paperWidth } from '../helpers/receipt.helper.js';
const fontPath=fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf',import.meta.url)),font=openSync(fontPath);
// ponytail: Noto Sans covers Latin/Greek/Cyrillic; unsupported glyphs become explicit code points. Add licensed local fonts for more scripts.
export const pdfText=value=>[...String(value).normalize('NFC').replace(/\r\n?/g,'\n').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n')].map(c=>c==='\n'?'\n':/[\p{Cc}\p{Cf}]/u.test(c)?'':font.hasGlyphForCodePoint(c.codePointAt(0))?c:'[U+'+c.codePointAt(0).toString(16).toUpperCase()+']').join('');
export async function renderReceiptPdf(receipt,{paper_mm}={}){
 const width=paperWidth(receipt,paper_mm);if(!['58','80'].includes(width)||receipt.items.length>100)throw new TypeError('Invalid receipt layout');
 const lines=receiptLines(receipt).map(pdfText);if(lines.reduce((n,l)=>n+l.length,0)>64000)throw new Error('Receipt PDF layout limit');
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:[Number(width)*72/25.4,600],margin:9,autoFirstPage:true}),chunks=[];let size=0,failed=false;
  const fail=error=>{if(!failed){failed=true;reject(error);doc.destroy();}};
  doc.on('error',fail);doc.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024)fail(new Error('Receipt PDF exceeds size bound'));else chunks.push(chunk);});doc.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});
  let pages=1;doc.on('pageAdded',()=>{if(++pages>128)throw new Error('Receipt PDF layout limit');});
  (async()=>{try{doc.font(fontPath).fontSize(8);for(const line of lines){if(failed)return;doc.text(line,{width:Number(width)*72/25.4-18,lineGap:2});doc.moveDown(0.3);await setImmediate();}doc.end();}catch(error){fail(error);}})();
 });
}
