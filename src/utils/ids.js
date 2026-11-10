import { AppError } from './errors.js';
export function parseId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n) {
    throw new AppError(422, 'INVALID_ID', 'Expected a positive unsigned 64-bit ID');
  }
  return BigInt(value);
}
