import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { csrf } from '../middlewares/csrf.js';
import { usersInput } from '../validators/users.validator.js';
import { usersController } from '../controllers/users.controller.js';
export function usersRoutes({ db, config }) {
  const router = Router(), c = usersController(db);
  router.use(authenticate(db, config), authorize('admin'));
  router.get('/', usersInput('list'), c.list);
  router.get('/:id', usersInput('get'), c.get);
  router.post('/', csrf(config), usersInput('create'), c.create);
  router.patch('/:id', csrf(config), usersInput('update'), c.update);
  router.patch('/:id/status', csrf(config), usersInput('status'), c.status);
  router.post('/:id/reset-password', csrf(config), usersInput('reset'), c.reset);
  return router;
}
