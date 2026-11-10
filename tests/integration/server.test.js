import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { testDatabaseConfig } from '../support/database.js';

test('real process connects database, serves readiness and exits on SIGTERM', { timeout: 15000 }, async t => {
  const portProbe = createServer().listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: testDatabaseConfig().databaseUrl,
    PORT: String(port), HOST: '127.0.0.1', ALLOWED_ORIGIN: 'http://localhost:5173',
    CSRF_KEY: 'c'.repeat(32), READINESS_SECRET: 'r'.repeat(32) };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const exited = once(child, 'exit');
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
    child.stdout.on('data', data => { output += data; if (output.includes('Server listening')) { clearTimeout(timer); resolve(); } });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited before readiness')); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ready`, { headers: { 'X-Readiness-Key': env.READINESS_SECRET } });
  assert.equal(response.status, 200);
  child.kill('SIGTERM');
  const [code, signal] = await exited;
  assert.equal(code, 0); assert.equal(signal, null);
});
