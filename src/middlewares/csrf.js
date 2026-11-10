import { timingSafeEqual } from 'node:crypto';
import { csrfFor } from '../services/auth.service.js';
import { AppError } from '../utils/errors.js';
const forbidden = () => new AppError(403, 'FORBIDDEN', 'Invalid request origin or CSRF token');
export const requireOrigin = config => (req, res, next) => {
  if (req.get('Origin') !== config.allowedOrigin) throw forbidden();
  next();
};
export const csrf = config => (req, res, next) => {
  if (req.get('Origin') !== config.allowedOrigin) throw forbidden();
  const received = req.get('X-CSRF-Token') ?? '';
  const expected = csrfFor(req.sessionSecret, config.csrfKey);
  if (!/^[A-Za-z0-9_-]{43}$/.test(received) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw forbidden();
  next();
};
export const cors = config => (req, res, next) => {
  res.vary('Origin');
  const origin = req.get('Origin');
  if (origin === config.allowedOrigin) {
    res.set('Access-Control-Allow-Origin', origin); res.set('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method !== 'OPTIONS') return next();
  if (origin !== config.allowedOrigin) throw forbidden();
  const methods = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
  const headers = ['content-type', 'x-csrf-token', 'idempotency-key'];
  if (!methods.includes(req.get('Access-Control-Request-Method')) || (req.get('Access-Control-Request-Headers') ?? '').split(',').some(h => h.trim() && !headers.includes(h.trim().toLowerCase()))) throw forbidden();
  res.set('Access-Control-Allow-Methods', methods.join(', '));
  res.set('Access-Control-Allow-Headers', headers.join(', '));
  res.status(204).end();
};
