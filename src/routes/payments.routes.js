import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { paymentInput } from '../validators/payments.validator.js';
import { paymentsController } from '../controllers/payments.controller.js';
export function paymentsRoutes({db,config}){const r=Router(),auth=authenticate(db,config),roles=authorize('admin','cashier'),c=paymentsController(db);
 r.get('/payments/:id',auth,roles,paymentInput('detail'),c.get);
 r.get('/orders/:orderId/payments',auth,roles,paymentInput('orderList'),c.orderList);
 r.get('/admin/payments',auth,authorize('admin'),paymentInput('adminList'),c.adminList);
 r.get('/admin/payments/:id/events',auth,authorize('admin'),paymentInput('events'),c.events);
 r.post('/orders/:orderId/payments/qris' ,auth,roles,csrf(config),paymentInput('qris'),c.qris);
 r.post('/payments/:id/confirm-manual',auth,roles,csrf(config),paymentInput('confirm'),c.confirm);
 r.post('/orders/:orderId/payments/cash',auth,roles,csrf(config),paymentInput('cash'),c.cash);return r;
}
