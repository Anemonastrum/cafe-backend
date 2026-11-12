import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
test('every proxy CSP permits receipt inline print styles without opening scripts',()=>{
 const config=readFileSync(new URL('../../ops/reverse-proxy.conf.example',import.meta.url),'utf8');
 const policies=[...config.matchAll(/add_header Content-Security-Policy "([^"]+)"/g)].map(m=>m[1]);assert.ok(policies.length);
 for(const policy of policies){const directives=Object.fromEntries(policy.split(';').map(s=>s.trim().split(/\s+/)).filter(([k])=>k).map(([k,...v])=>[k,v]));assert.ok((directives['style-src']??directives['default-src']).includes("'unsafe-inline'"));assert.deepEqual(directives['script-src']??directives['default-src'],["'none'"]);}
});
