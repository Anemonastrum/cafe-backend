import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { variantsInput } from '../validators/variants.validator.js';
import { variantsController } from '../controllers/variants.controller.js';
export function variantsRoutes({db,config}){
 const r=Router(),c=variantsController(db),auth=authenticate(db,config),admin=authorize('admin');
 r.get('/products/:productId/variant-groups',auth,authorize('admin','cashier'),variantsInput('list'),c.list);
 for(const [method,path,action] of [['post','/products/:productId/variant-groups','createVariantGroup'],['patch','/variant-groups/:id','updateVariantGroup'],['delete','/variant-groups/:id','deleteVariantGroup'],['post','/variant-groups/:id/options','createVariantOption'],['patch','/variant-options/:id','updateVariantOption'],['delete','/variant-options/:id','deleteVariantOption']]){
  const kind=action.replace('Variant','');r[method](path,auth,admin,csrf(config),variantsInput(method==='delete'?'empty':kind),c[action]);
 }return r;
}
