import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { orderInput } from '../validators/orders.validator.js';
import { ordersController } from '../controllers/orders.controller.js';
export function ordersRoutes({db,config}){const r=Router(),c=ordersController(db);r.post('/orders/quote',authenticate(db,config),authorize('admin','cashier'),csrf(config),orderInput('quote'),c.quote);return r;}
