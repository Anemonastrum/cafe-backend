import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { addonsInput } from '../validators/addons.validator.js';
import { addonsController } from '../controllers/addons.controller.js';
export function addonsRoutes({db,config}){
 const r=Router(),c=addonsController(db),auth=authenticate(db,config),admin=authorize('admin');
 r.get('/products/:productId/addon-groups',auth,authorize('admin','cashier'),addonsInput('list'),c.list);
 for(const [method,path,action] of [['post','/products/:productId/addon-groups','createAddonGroup'],['patch','/addon-groups/:id','updateAddonGroup'],['delete','/addon-groups/:id','deleteAddonGroup'],['post','/addon-groups/:id/options','createAddonOption'],['patch','/addon-options/:id','updateAddonOption'],['delete','/addon-options/:id','deleteAddonOption']]){
  const kind=action.replace('Addon','');r[method](path,auth,admin,csrf(config),addonsInput(method==='delete'?'empty':kind),c[action]);
 }return r;
}
