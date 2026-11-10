import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startApp, request } from '../support/http.js';
import { loadConfig } from '../../src/configs/env.js';
// A runner subprocess is independent of this node:test worker's IPC protocol.
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
const exec = (file, args, options) => promisify(execFile)(file, args, { ...options, env: childEnv });
const runner = resolve('scripts/test.mjs');
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'mysql://u:p@localhost/test', ALLOWED_ORIGIN: 'http://localhost:5173', CSRF_KEY: 'c'.repeat(32), READINESS_SECRET: 'r'.repeat(32) });

test('HTTP test helper reaches real mounted route and retains bytes', async t => {
  const h = await startApp({ config });
  t.after(h.close);
  const response = await request(h, { path: '/health' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'ok');
  assert.ok(response.bytes.length > 0);
  assert.equal((await request(h, { method: 'POST', path: '/absent', body: { test: 1 } })).status, 404);
});

test('native test runner fails missing suite and runs nested test files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cafe-runner-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(exec(process.execPath, [runner, 'unit'], { cwd: dir }), { code: 1 });
  await mkdir(join(dir, 'tests/unit/nested'), { recursive: true });
  await writeFile(join(dir, 'tests/unit/nested/example.test.js'), "require('node:test')('real test',()=>{require('node:assert/strict').equal(1,1)})");
  const result = await exec(process.execPath, [runner, 'unit'], { cwd: dir });
  assert.match(result.stdout, /pass 1/);
  await writeFile(join(dir, 'tests/unit/nested/example.test.js'), "require('node:test')('fails',()=>{require('node:assert/strict').equal(1,2)})");
  await assert.rejects(exec(process.execPath, [runner, 'unit'], { cwd: dir }), { code: 1 });
  await assert.rejects(exec(process.execPath, [runner, '../unit'], { cwd: dir }), { code: 1 });
});
