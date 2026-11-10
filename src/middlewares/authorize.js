import { AppError } from '../utils/errors.js';
export const authorize = (...roles) => (req, res, next) => {
  if (!req.actor || !roles.includes(req.actor.role)) throw new AppError(403, 'FORBIDDEN', 'Forbidden');
  next();
};
