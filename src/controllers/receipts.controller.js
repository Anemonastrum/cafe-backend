import * as receipts from '../services/receipt.service.js';
import { renderReceiptHtml } from '../helpers/receipt.helper.js';
const noStore=res=>res.set('Cache-Control','private, no-store');
const html=(res,receipt,options)=>noStore(res).set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'").type('html').send(renderReceiptHtml(receipt,options));
export const receiptsController=db=>({
 get:async(req,res)=>noStore(res).json({data:await receipts.getReceipt(db,req.actor,req.entityId)}),
 order:async(req,res)=>noStore(res).json({data:await receipts.findOrderReceipt(db,req.actor,req.entityId)}),
 print:async(req,res)=>html(res,await receipts.recordReceiptEvent(db,req.actor,req.entityId,'print'),req.input),
 reprint:async(req,res)=>html(res,await receipts.recordReprint(db,req.actor,req.entityId),req.input),
 events:async(req,res)=>noStore(res).json(await receipts.listReceiptEvents(db,req.actor,req.entityId,req.input)),
});
