import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
export async function startApp(options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    origin: options.config.allowedOrigin,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
export async function loginAs(server, username, password) {
  const response = await request(server, { method: 'POST', path: '/auth/login', body: { username, password }, headers: { Origin: server.origin } });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: response.body.data.csrf_token };
}
export async function request(server, { method = 'GET', path, body, cookie, csrf, headers = {} }) {
  const requestHeaders = { ...headers };
  if (cookie) requestHeaders.Cookie = cookie;
  if (csrf) requestHeaders['X-CSRF-Token'] = csrf;
  if (body !== undefined) requestHeaders['Content-Type'] ??= 'application/json';
  const response = await fetch(`${server.baseUrl}/api/v1${path}`, {
    method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') ?? '';
  return { status: response.status, headers: response.headers, bytes,
    body: !bytes.length ? null : type.includes('application/json') ? JSON.parse(bytes.toString()) : bytes.toString(),
  };
}
