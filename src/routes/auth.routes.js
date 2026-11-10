import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf, requireOrigin } from '../middlewares/csrf.js';
import { authLimits } from '../middlewares/rate-limit.js';
import { validateAuth } from '../validators/auth.validator.js';
export function authRoutes({ db, config }) {
  const router = Router(), controller = authController(db, config), limits = authLimits(db);
  router.use(limits.general);
  router.post('/login', requireOrigin(config), validateAuth('login'), limits.ip, limits.identify, limits.username, controller.login);
  router.use(authenticate(db, config), authorize('admin', 'cashier'));
  router.get('/me', validateAuth('empty'), controller.me);
  router.post('/refresh', csrf(config), validateAuth('empty'), controller.refresh);
  router.post('/logout', csrf(config), validateAuth('empty'), controller.logout);
  router.post('/logout-all', csrf(config), validateAuth('empty'), controller.logoutAll);
  router.patch('/me/password', csrf(config), validateAuth('password'), controller.password);
  return router;
}
