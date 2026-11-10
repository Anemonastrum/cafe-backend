import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/errors.js';
export function healthRoutes({ db, config }) {
  const router = Router();
  router.get('/health', (req, res) => res.json({ data: { status: 'ok' } }));
  router.get('/ready', async (req, res) => {
    const supplied = Buffer.from(req.get('X-Readiness-Key') ?? '');
    const expected = Buffer.from(config.readinessSecret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new AppError(403, 'FORBIDDEN', 'Internal access required');
    }
    try { await db.$queryRaw`SELECT 1`; }
    catch { throw new AppError(503, 'NOT_READY', 'Service not ready'); }
    res.json({ data: { status: 'ready' } });
  });
  return router;
}
