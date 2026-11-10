import * as auth from '../services/auth.service.js';
import { toWire } from '../utils/serialize.js';
export const requestContext = req => ({ requestId: req.requestId, ip: req.ip });
export function authController(db, config) {
  const issue = (res, result) => {
    res.cookie('cafe_session', result.secret, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/',
      expires: result.expiresAt, maxAge: Math.max(0, result.expiresAt.getTime() - Date.now()) });
    res.json({ data: toWire({ user: result.user, csrf_token: auth.csrfFor(result.secret, config.csrfKey) }) });
  };
  const clear = res => res.clearCookie('cafe_session', { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' }).status(204).end();
  return {
    logout: async (req, res) => { await auth.logout(db, req.actor, requestContext(req)); clear(res); },
    logoutAll: async (req, res) => { await auth.logoutAll(db, req.actor, requestContext(req)); clear(res); },
    password: async (req, res) => res.json({ data: toWire(await auth.changePassword(db, req.actor, req.input, requestContext(req))) }),
    login: async (req, res) => issue(res, await auth.login(db, req.input, requestContext(req))),
    refresh: async (req, res) => issue(res, await auth.rotateSession(db, req.actor, requestContext(req))),
    me: (req, res) => res.json({ data: toWire({ ...auth.safeUser(req.authUser), csrf_token: auth.csrfFor(req.sessionSecret, config.csrfKey) }) }),
  };
}
