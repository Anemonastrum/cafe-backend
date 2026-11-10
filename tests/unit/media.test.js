import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replaceLogo } from '../../src/services/settings.service.js';
import { saveImage, removeManagedImage } from '../../src/services/media.service.js';

test('managed images verify format, reencode and refuse unsafe paths', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'cafe-media-'));
  try {
    for (const [format, mime] of [['png','image/png'],['jpeg','image/jpeg'],['webp','image/webp']]) {
      const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })[format]().toBuffer();
      const file = await saveImage({ buffer, mime, storageDir });
      assert.match(file.url, /^\/media\/[a-f0-9-]{36}\.webp$/);
      assert.equal((await sharp(file.path).metadata()).format, 'webp');
      await removeManagedImage(file.url, storageDir);
    }
    await assert.rejects(saveImage({ buffer: Buffer.from('<svg/>'), mime: 'image/png', storageDir }), { status: 422 });
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
    await assert.rejects(saveImage({ buffer: png, mime: 'image/jpeg', storageDir }), { status: 422 });
    await assert.rejects(saveImage({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mime: 'image/png', storageDir }), { status: 413 });
    const huge = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: 'red' } }).png().toBuffer();
    await assert.rejects(saveImage({ buffer: huge, mime: 'image/png', storageDir }), { status: 422 });
    for (const url of ['/media/../secret', '/media/%2e%2e/secret', 'https://evil.example/file', '/etc/passwd']) await assert.rejects(removeManagedImage(url, storageDir));
    const failure = new Error('database unavailable');
    await assert.rejects(replaceLogo({ $transaction: async () => { throw failure; } }, { role: 'admin' }, { buffer: png, mimetype: 'image/png' }, {}, storageDir), error => error === failure);
    assert.deepEqual(await readdir(storageDir), []);
  } finally { await rm(storageDir, { recursive: true, force: true }); }
});
