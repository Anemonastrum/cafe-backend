import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
export function apiRoutes(dependencies) {
  const router = Router();
  router.use(healthRoutes(dependencies));
  return router;
}
