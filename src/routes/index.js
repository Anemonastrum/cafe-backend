import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { usersRoutes } from './users.routes.js';
import { settingsRoutes } from './settings.routes.js';
import { pricingRulesRoutes } from './pricing-rules.routes.js';
import { paymentMethodsRoutes } from './payment-methods.routes.js';
export function apiRoutes(dependencies) {
  const router = Router();
  router.use(healthRoutes(dependencies));
  router.use('/auth', authRoutes(dependencies));
  router.use('/admin/users', usersRoutes(dependencies));
  router.use(settingsRoutes(dependencies));
  router.use(pricingRulesRoutes(dependencies));
  router.use(paymentMethodsRoutes(dependencies));
  return router;
}
