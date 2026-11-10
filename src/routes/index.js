import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { usersRoutes } from './users.routes.js';
import { settingsRoutes } from './settings.routes.js';
export function apiRoutes(dependencies) {
  const router = Router();
  router.use(healthRoutes(dependencies));
  router.use('/auth', authRoutes(dependencies));
  router.use('/admin/users', usersRoutes(dependencies));
  router.use(settingsRoutes(dependencies));
  return router;
}
