import { AppError } from '../utils/errors.js';
import { validPassword } from '../utils/password.js';
import { parseId } from '../utils/ids.js';
import { parsePage } from '../utils/pagination.js';
const invalid = () => { throw new AppError(422, 'INVALID_INPUT', 'Invalid employee input'); };
export function usersInput(kind) {
  return (req, res, next) => {
    const query = req.query;
    if (kind === 'list') {
      if (Object.keys(query).some(k => !['role','is_active','search','page','limit','sort_by','sort_order'].includes(k))) invalid();
      if (query.role !== undefined && !['admin','cashier'].includes(query.role)) invalid();
      if (query.is_active !== undefined && !['true','false'].includes(query.is_active)) invalid();
      if (query.search !== undefined && (typeof query.search !== 'string' || [...query.search].length > 190)) invalid();
      req.input = { ...parsePage(query, ['username','full_name','role','created_at']), role: query.role,
        is_active: query.is_active === undefined ? undefined : query.is_active === 'true', search: query.search };
    } else {
      if (Object.keys(query).length) invalid();
      if (req.params.id !== undefined) req.entityId = parseId(req.params.id);
      const body = req.body ?? {};
      const fields = kind === 'create' ? ['full_name','username','email','password','role','is_active'] : kind === 'update' ? ['full_name','username','email','role'] : kind === 'status' ? ['is_active'] : kind === 'reset' ? ['password'] : [];
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k))) invalid();
      if (['update','status','reset'].includes(kind) && !Object.keys(body).length) invalid();
      for (const [key, max] of [['full_name',150],['username',60]]) {
        if ((kind === 'create' || body[key] !== undefined) && (typeof body[key] !== 'string' || !body[key].trim() || [...body[key]].length > max || /[\x00-\x1f\x7f]/.test(body[key]))) invalid();
      }
      if (body.email !== undefined && body.email !== null && (typeof body.email !== 'string' || body.email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) invalid();
      if (body.role !== undefined && !['admin','cashier'].includes(body.role)) invalid();
      if ((kind === 'status' || body.is_active !== undefined) && typeof body.is_active !== 'boolean') invalid();
      if ((['create','reset'].includes(kind) || body.password !== undefined) && !validPassword(body.password)) invalid();
      req.input = body;
    }
    next();
  };
}
