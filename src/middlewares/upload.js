import multer from 'multer';
import { AppError } from '../utils/errors.js';
const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }).single('file');
export function imageUpload(req, res, next) {
  parser(req, res, error => {
    if (error) return next(new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 422, 'INVALID_UPLOAD', 'Invalid image upload'));
    if (!req.file) return next(new AppError(422, 'INVALID_UPLOAD', 'Image file required'));
    next();
  });
}
