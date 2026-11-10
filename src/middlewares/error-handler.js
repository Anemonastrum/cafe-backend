import { AppError } from '../utils/errors.js';
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') error = new AppError(400, 'MALFORMED_JSON', 'Malformed JSON');
  if (error.type === 'entity.too.large') error = new AppError(413, 'BODY_TOO_LARGE', 'Request body is too large');
  const known = error instanceof AppError;
  if (!known) console.error(JSON.stringify({ event: 'request_error', request_id: req.requestId }));
  res.status(known ? error.status : 500).json({
    error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Internal server error', details: known ? error.details : null },
    request_id: req.requestId,
  });
}
