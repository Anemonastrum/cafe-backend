import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { reportInput,exportInput } from '../validators/reports.validator.js';
import { reportsController,exportController } from '../controllers/reports.controller.js';
export function reportsRoutes({db,config}){const r=Router();r.get('/admin/reports/export',authenticate(db,config),authorize('admin'),exportInput,exportController(db));r.get('/admin/reports/:report',authenticate(db,config),authorize('admin'),reportInput,reportsController(db));return r;}
