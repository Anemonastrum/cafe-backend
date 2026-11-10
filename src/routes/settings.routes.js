import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { imageUpload } from '../middlewares/upload.js';
import { settingsInput } from '../validators/settings.validator.js';
import { settingsController } from '../controllers/settings.controller.js';
export function settingsRoutes({ db, config }) {
  const router = Router(), c = settingsController(db,config), auth = authenticate(db,config);
  router.get('/settings/public',auth,authorize('admin','cashier'),settingsInput,c.safe);
  router.use('/admin/settings',auth,authorize('admin'));
  router.get('/admin/settings',settingsInput,c.get);
  router.patch('/admin/settings',csrf(config),settingsInput,c.update);
  router.post('/admin/settings/logo',csrf(config),settingsInput,imageUpload,c.logo);
  router.delete('/admin/settings/logo',csrf(config),settingsInput,c.remove);
  return router;
}
