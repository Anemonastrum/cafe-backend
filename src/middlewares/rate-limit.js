import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { findUser } from '../models/auth.model.js';
import { AppError } from '../utils/errors.js';
export class BoundedStore {
  constructor(capacity = 10000) { this.capacity = capacity; this.entries = new Map(); this.localKeys = true; }
  init({ windowMs }) { this.windowMs = windowMs; }
  async increment(key) {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (entry && entry.resetTime.getTime() <= now) { this.entries.delete(key); entry = null; }
    if (!entry) {
      if (this.entries.size >= this.capacity) {
        for (const [k, v] of this.entries) if (v.resetTime.getTime() <= now) this.entries.delete(k);
        if (this.entries.size >= this.capacity) throw new AppError(429, 'RATE_LIMITED', 'Try again later');
      }
      entry = { totalHits: 0, resetTime: new Date(now + this.windowMs) }; this.entries.set(key, entry);
    }
    entry.totalHits++; return { ...entry };
  }
  async decrement(key) { const entry = this.entries.get(key); if (entry) entry.totalHits = Math.max(0, entry.totalHits - 1); }
  async resetKey(key) { this.entries.delete(key); }
}
const limited = () => new AppError(429, 'RATE_LIMITED', 'Try again later');
const limiter = options => rateLimit({ standardHeaders: 'draft-8', legacyHeaders: false, store: new BoundedStore(),
  handler: (req, res, next) => next(limited()), ...options });
export function authLimits(db) {
  return {
    general: limiter({ windowMs: 60000, limit: 30 }),
    ip: limiter({ windowMs: 900000, limit: 5, skipSuccessfulRequests: true }),
    identify: async (req, res, next) => {
      const user = await findUser(db, req.input.username);
      req.loginRateKey = user ? `user:${user.id}` : createHash('sha256').update(req.input.username.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()).digest('hex');
      next();
    },
    username: limiter({ windowMs: 900000, limit: 5, skipSuccessfulRequests: true, keyGenerator: req => req.loginRateKey }),
  };
}
