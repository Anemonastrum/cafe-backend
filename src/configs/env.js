import { resolve } from 'node:path';
import { isIP } from 'node:net';
export function loadConfig(env = process.env) {
  const fail = name => { throw new Error(`Invalid or missing ${name}`); };
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) fail('NODE_ENV');
  const secret = name => {
    if (typeof env[name] !== 'string' || Buffer.byteLength(env[name]) < 32
        || !env[name].trim() || /[\x00-\x1f\x7f-\x9f]/u.test(env[name])
        || (name === 'READINESS_SECRET' && (!/^[\x20-\x7e]+$/.test(env[name]) || env[name] !== env[name].trim()))) fail(name);
    return env[name];
  };
  let url;
  try {
    url = new URL(env.DATABASE_URL);
    if (url.protocol !== 'mysql:' || !url.hostname || !url.username || !url.pathname.slice(1)
        || url.pathname.slice(1).includes('/') || url.search || url.hash) fail('DATABASE_URL');
    decodeURIComponent(url.username); decodeURIComponent(url.password); decodeURIComponent(url.pathname);
  } catch { fail('DATABASE_URL'); }
  let origin;
  try {
    origin = new URL(env.ALLOWED_ORIGIN);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.ALLOWED_ORIGIN
        || origin.username || origin.password || (mode === 'production' && origin.protocol !== 'https:')) fail('ALLOWED_ORIGIN');
  } catch { fail('ALLOWED_ORIGIN'); }
  const portText = env.PORT ?? '3000';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) fail('PORT');
  if (env.ALLOW_INSECURE_COOKIE !== undefined && !['true', 'false'].includes(env.ALLOW_INSECURE_COOKIE)) fail('ALLOW_INSECURE_COOKIE');
  if (mode === 'production' && env.ALLOW_INSECURE_COOKIE === 'true') fail('ALLOW_INSECURE_COOKIE');
  let trustProxy=false;
  if(env.TRUST_PROXY!==undefined&&env.TRUST_PROXY!=='false'){
    trustProxy=env.TRUST_PROXY.split(',').map(v=>v.trim());
    for(const entry of trustProxy){const [ip,bits,...rest]=entry.split('/'),family=isIP(ip);if(!family||rest.length||(bits!==undefined&&(!/^[1-9]\d*$/.test(bits)||Number(bits)>(family===4?32:128))))fail('TRUST_PROXY');}
  }
  return {
    mode, port: Number(portText), host: env.HOST ?? '127.0.0.1', databaseUrl: env.DATABASE_URL,
    allowedOrigin: origin.origin, csrfKey: secret('CSRF_KEY'), readinessSecret: secret('READINESS_SECRET'),
    cookieSecure: env.ALLOW_INSECURE_COOKIE !== 'true', trustProxy,
    storageDir: resolve(env.STORAGE_DIR ?? 'storage'),
  };
}
