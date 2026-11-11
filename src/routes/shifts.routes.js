import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { shiftsInput } from '../validators/shifts.validator.js';
import { shiftsController } from '../controllers/shifts.controller.js';
export function shiftsRoutes({db,config}){
 const r=Router(),c=shiftsController(db),auth=authenticate(db,config),admin=authorize('admin'),roles=authorize('admin','cashier');
 r.get('/cash-registers',auth,roles,shiftsInput('registers'),c.registers);
 r.post('/admin/cash-registers',auth,admin,csrf(config),shiftsInput('createRegister'),c.createRegister);
 r.patch('/admin/cash-registers/:id',auth,admin,csrf(config),shiftsInput('updateRegister'),c.updateRegister);
 r.get('/cashier-shifts/current',auth,roles,shiftsInput('empty'),c.current);
 r.post('/cashier-shifts/open',auth,roles,csrf(config),shiftsInput('open'),c.open);
 r.get('/cashier-shifts/mine',auth,roles,shiftsInput('mine'),c.mine);
 r.post('/cashier-shifts/:id/close',auth,roles,csrf(config),shiftsInput('close'),c.close);
 r.get('/cashier-shifts/:id/summary',auth,roles,shiftsInput('empty'),c.summary);
 r.get('/cashier-shifts/:id/orders',auth,roles,shiftsInput('orders'),c.orders);
 r.get('/admin/cashier-shifts',auth,admin,shiftsInput('history'),c.history);
 r.get('/admin/cashier-shifts/:id',auth,admin,shiftsInput('empty'),c.detail);return r;
}
