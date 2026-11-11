import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { categoriesInput } from '../validators/categories.validator.js';
import { categoriesController } from '../controllers/categories.controller.js';
export function categoriesRoutes({db,config}){
  const r=Router(),c=categoriesController(db);r.use(authenticate(db,config),authorize('admin','cashier'));
  r.get('/',categoriesInput('list'),c.list);r.get('/:id',categoriesInput('get'),c.get);
  r.post('/',authorize('admin'),csrf(config),categoriesInput('create'),c.create);
  r.patch('/:id',authorize('admin'),csrf(config),categoriesInput('update'),c.update);
  r.patch('/:id/status',authorize('admin'),csrf(config),categoriesInput('status'),c.status);return r;
}
