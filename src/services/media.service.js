import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { AppError } from '../utils/errors.js';
const types = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
export async function saveImage({ buffer, mime, storageDir = 'storage' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024) throw new AppError(413, 'IMAGE_TOO_LARGE', 'Image exceeds 5 MiB');
  let output;
  try {
    if (!types[mime]) throw new Error();
    const image = sharp(buffer, { limitInputPixels: 20000000, animated: false });
    const meta = await image.metadata();
    if (meta.format !== types[mime] || (meta.pages ?? 1) > 1) throw new Error();
    output = await image.rotate().webp().toBuffer();
  } catch { throw new AppError(422, 'INVALID_IMAGE', 'Expected a valid PNG, JPEG or WebP image'); }
  const name = `${randomUUID()}.webp`, path = join(resolve(storageDir), name);
  await mkdir(resolve(storageDir), { recursive: true, mode: 0o700 });
  try { await writeFile(path, output, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') await unlink(path).catch(() => {}); throw error; }
  return { url: `/media/${name}`, path };
}
export async function removeManagedImage(url, storageDir = 'storage') {
  if (typeof url !== 'string' || !/^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(url)) throw new Error('Not a managed image URL');
  try { await unlink(join(resolve(storageDir), url.slice('/media/'.length))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
