import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { methodInput } from '../validators/payment-methods.validator.js';
import { paymentMethodsController } from '../controllers/payment-methods.controller.js';
export function paymentMethodsRoutes({db,config}){
  const router=Router(),c=paymentMethodsController(db),auth=authenticate(db,config);
  router.get('/payment-methods',auth,authorize('admin','cashier'),methodInput,c.list);
  router.get('/admin/payment-methods',auth,authorize('admin'),methodInput,c.all);
  router.patch('/admin/payment-methods/:id',auth,authorize('admin'),csrf(config),methodInput,c.update);
  return router;
}
