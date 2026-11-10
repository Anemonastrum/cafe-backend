import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from './errors.js';
const derive = promisify(scrypt);
let active = 0;
const queue = [];
async function key(password, salt) {
  if (active >= 2) {
    if (queue.length >= 8) throw new AppError(429, 'AUTH_BUSY', 'Try again later');
    await new Promise(resolve => queue.push(resolve));
  } else active++;
  try { return await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }); }
  finally { if (queue.length) queue.shift()(); else active--; }
}
export function validPassword(password, minimum = 12) {
  return typeof password === 'string' && [...password].length >= minimum
    && [...password].length <= 128 && Buffer.byteLength(password) <= 512;
}
export async function hashPassword(password) {
  if (!validPassword(password)) throw new AppError(422, 'INVALID_PASSWORD', 'Password must contain 12 to 128 characters');
  const salt = randomBytes(16);
  return `scrypt$v1$131072$8$1$${salt.toString('hex')}$${(await key(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (!validPassword(password, 1) || typeof encoded !== 'string') return false;
  const match = /^scrypt\$v1\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await key(password, Buffer.from(match[1], 'hex')), Buffer.from(match[2], 'hex'));
}
