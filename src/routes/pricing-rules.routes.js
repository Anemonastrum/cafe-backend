import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { ruleInput } from '../validators/pricing-rules.validator.js';
import { pricingRulesController } from '../controllers/pricing-rules.controller.js';
export function pricingRulesRoutes({db,config}) {
  const router=Router();
  for(const kind of ['taxes','service-charges','discounts']) {
    const c=pricingRulesController(db,kind),base='/admin/'+kind,auth=authenticate(db,config),role=authorize('admin');
    router.get(base,auth,role,ruleInput(kind),c.list);
    router.post(base,auth,role,csrf(config),ruleInput(kind),c.create);
    router.patch(base+'/:id',auth,role,csrf(config),ruleInput(kind),c.update);
  }
  return router;
}
