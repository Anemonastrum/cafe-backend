import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { receiptInput } from '../validators/receipts.validator.js';
import { receiptsController } from '../controllers/receipts.controller.js';
export function receiptsRoutes({db,config}){const r=Router(),auth=authenticate(db,config),roles=authorize('admin','cashier'),c=receiptsController(db);
 r.get('/orders/:orderId/receipt',auth,roles,receiptInput('order'),c.order);
 r.get('/receipts/:id',auth,roles,receiptInput('get'),c.get);
 r.get('/receipts/:id/print',auth,roles,receiptInput('print'),c.print);
 r.post('/receipts/:id/reprint',auth,roles,csrf(config),receiptInput('reprint'),c.reprint);
 r.get('/admin/receipts/:id/events',auth,authorize('admin'),receiptInput('events'),c.events);return r;
}
