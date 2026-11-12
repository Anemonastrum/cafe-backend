import PDFDocument from 'pdfkit';
import { openSync } from 'fontkit';
import { fileURLToPath } from 'node:url';
import { receiptLines,paperWidth } from '../helpers/receipt.helper.js';
const fontPath=fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf',import.meta.url)),font=openSync(fontPath);
// ponytail: Noto Sans covers Latin/Greek/Cyrillic; unsupported glyphs become explicit code points. Add licensed local fonts for more scripts.
export const pdfText=value=>[...String(value).normalize('NFC')].map(c=>c==='\n'?'\n':/[\p{Cc}\p{Cf}]/u.test(c)?'':font.hasGlyphForCodePoint(c.codePointAt(0))?c:'[U+'+c.codePointAt(0).toString(16).toUpperCase()+']').join('');
export function renderReceiptPdf(receipt,{paper_mm}={}){
 const width=paperWidth(receipt,paper_mm);if(!['58','80'].includes(width)||receipt.items.length>100)throw new TypeError('Invalid receipt layout');
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:[Number(width)*72/25.4,600],margin:9,autoFirstPage:true}),chunks=[];let size=0,failed=false;
  const fail=error=>{if(!failed){failed=true;reject(error);doc.destroy();}};
  doc.on('error',fail);doc.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024)fail(new Error('Receipt PDF exceeds size bound'));else chunks.push(chunk);});doc.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});
  try{doc.font(fontPath).fontSize(8);for(const line of receiptLines(receipt)){doc.text(pdfText(line),{width:Number(width)*72/25.4-18,lineGap:2});doc.moveDown(0.3);}doc.end();}catch(error){fail(error);}
 });
}
