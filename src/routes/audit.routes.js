import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { auditInput } from '../validators/audit.validator.js';
import { auditController } from '../controllers/audit.controller.js';
export function auditRoutes({db,config}){const r=Router(),c=auditController(db);r.use('/admin/audit-logs',authenticate(db,config),authorize('admin'));r.get('/admin/audit-logs',auditInput(false),c.list);r.get('/admin/audit-logs/:id',auditInput(true),c.detail);return r;}
