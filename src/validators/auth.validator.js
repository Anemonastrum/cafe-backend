import { AppError } from '../utils/errors.js';
import { validPassword } from '../utils/password.js';
export function validateAuth(kind) {
  return (req, res, next) => {
    const fields = kind === 'login' ? ['username', 'password'] : kind === 'password' ? ['current_password', 'new_password'] : [];
    const body = req.body ?? {};
    const invalid = () => { throw new AppError(422, 'INVALID_INPUT', 'Invalid authentication input'); };
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k)) || Object.keys(req.query).length) invalid();
    if (kind === 'login' && (typeof body.username !== 'string' || !body.username.trim() || [...body.username].length > 60 || !validPassword(body.password, 1))) invalid();
    if (kind === 'password' && (!validPassword(body.current_password, 1) || !validPassword(body.new_password))) invalid();
    req.input = body;
    next();
  };
}
