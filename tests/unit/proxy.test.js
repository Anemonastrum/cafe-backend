import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { loadConfig } from '../../src/configs/env.js';
const env={NODE_ENV:'production',DATABASE_URL:'mysql://user:password@localhost/test',ALLOWED_ORIGIN:'https://cafe.example',CSRF_KEY:'c'.repeat(32),READINESS_SECRET:'r'.repeat(32)};
test('deployment trusts only explicit IP/CIDR proxy hops',async()=>{
 assert.equal(loadConfig(env).trustProxy,false);
 for(const value of ['true','1','loopback','0.0.0.0/0','::/0','127.0.0.1/33','::1/129','bad','127.0.0.1,'])assert.throws(()=>loadConfig({...env,TRUST_PROXY:value}));
 const config=loadConfig({...env,TRUST_PROXY:'127.0.0.1/32,::1/128'});assert.deepEqual(config.trustProxy,['127.0.0.1/32','::1/128']);
 for(const trust of [false,config.trustProxy,['192.0.2.0/24']]){
  const app=express();app.set('trust proxy',trust);app.get('/',(req,res)=>res.json({ip:req.ip,secure:req.secure}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{const result=await (await fetch('http://127.0.0.1:'+server.address().port,{headers:{'X-Forwarded-For':'198.51.100.8','X-Forwarded-Proto':'https'}})).json();assert.deepEqual(result,trust===config.trustProxy?{ip:'198.51.100.8',secure:true}:{ip:'127.0.0.1',secure:false});}finally{await new Promise(r=>server.close(r));}
 }
});
