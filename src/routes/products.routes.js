import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { imageUpload } from '../middlewares/upload.js';
import { productsInput } from '../validators/products.validator.js';
import { productsController } from '../controllers/products.controller.js';
export function productsRoutes({db,config}){
  const r=Router(),c=productsController(db,config),auth=authenticate(db,config),roles=authorize('admin','cashier'),admin=authorize('admin');
  r.get('/pos/menu',auth,roles,productsInput('empty'),c.menu);
  r.use('/products',auth,roles);
  r.get('/products',productsInput('list'),c.list);r.get('/products/:id',productsInput('get'),c.get);
  r.post('/products',admin,csrf(config),productsInput('create'),c.create);
  r.patch('/products/:id',admin,csrf(config),productsInput('update'),c.update);
  for(const action of ['availability','promotion'])r.patch('/products/:id/'+action,admin,csrf(config),productsInput(action),c[action]);
  for(const action of ['archive','restore'])r.post('/products/:id/'+action,admin,csrf(config),productsInput('empty'),c[action]);
  r.post('/products/:id/image',admin,csrf(config),productsInput('empty'),imageUpload,c.image);
  r.delete('/products/:id/image',admin,csrf(config),productsInput('empty'),c.removeImage);return r;
}
