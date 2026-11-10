import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
export function apiRoutes(dependencies) {
  const router = Router();
  router.use(healthRoutes(dependencies));
  router.use('/auth', authRoutes(dependencies));
  return router;
}
