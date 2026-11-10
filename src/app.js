import express from 'express';
import { randomUUID } from 'node:crypto';
import { apiRoutes } from './routes/index.js';
import { errorHandler } from './middlewares/error-handler.js';
import { AppError } from './utils/errors.js';
export function createApp({ db, config, events }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-ID', req.requestId);
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/', (req, res) => res.json({ message: 'API is running' }));
  app.use('/api/v1', apiRoutes({ db, config, events }));
  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Not found')));
  app.use(errorHandler);
  return app;
}
