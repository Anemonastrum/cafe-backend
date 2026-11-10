import { findSession } from '../models/auth.model.js';
import { sessionDigest, unauthorized } from '../services/auth.service.js';
export function authenticate(db, config) {
  return async (req, res, next) => {
    const cookies = (req.headers.cookie ?? '').split(';').map(c => c.trim()).filter(c => c.startsWith('cafe_session='));
    const secret = cookies.length === 1 ? cookies[0].slice('cafe_session='.length) : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw unauthorized();
    const tokenHash = sessionDigest(secret);
    const session = await findSession(db, tokenHash);
    if (!session || session.revoked_at || session.expires_at <= new Date() || !session.fk_sessions_user.is_active) throw unauthorized();
    const user = session.fk_sessions_user;
    req.actor = { id: user.id, role: user.role, sessionId: session.id, tokenHash };
    req.authUser = user; req.sessionSecret = secret;
    next();
  };
}
