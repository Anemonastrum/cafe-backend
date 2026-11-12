import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { paymentInput } from '../validators/payments.validator.js';
import { paymentsController } from '../controllers/payments.controller.js';
export function paymentsRoutes({db,config}){const r=Router(),auth=authenticate(db,config),roles=authorize('admin','cashier'),c=paymentsController(db);
 r.post('/orders/:orderId/payments/cash',auth,roles,csrf(config),paymentInput('cash'),c.cash);return r;
}
