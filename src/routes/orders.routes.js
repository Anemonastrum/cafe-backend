import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { orderInput } from '../validators/orders.validator.js';
import { ordersController } from '../controllers/orders.controller.js';
export function ordersRoutes({db,config}){
 const r=Router(),c=ordersController(db),auth=authenticate(db,config),roles=authorize('admin','cashier');
 r.post('/orders/quote',auth,roles,csrf(config),orderInput('quote'),c.quote);
 r.post('/orders',auth,roles,csrf(config),orderInput('create'),c.create);
 r.get('/orders',auth,roles,orderInput('list'),c.list);
 r.get('/orders/active',auth,roles,orderInput('active'),c.active);
 for(const [method,path,kind] of [['patch','/orders/:id','edit'],['post','/orders/:id/items','addItem'],['patch','/orders/:id/items/:itemId','editItem'],['delete','/orders/:id/items/:itemId','removeItem'],['post','/orders/:id/hold','hold'],['post','/orders/:id/resume','resume'],['post','/orders/:id/discounts','applyDiscount'],['delete','/orders/:id/discounts/:discountId','removeDiscount']])r[method](path,auth,roles,csrf(config),orderInput(kind),c[kind]);
 r.get('/orders/:id',auth,roles,orderInput('detail'),c.get);return r;
}
