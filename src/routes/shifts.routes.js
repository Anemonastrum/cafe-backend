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
 r.post('/cashier-shifts/open',auth,roles,csrf(config),shiftsInput('open'),c.open);return r;
}
