import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { dashboardInput } from '../validators/dashboard.validator.js';
import { dashboardController } from '../controllers/dashboard.controller.js';
export function dashboardRoutes({db,config}){const r=Router();r.get('/admin/dashboard/:view',authenticate(db,config),authorize('admin'),dashboardInput,dashboardController(db));return r;}
