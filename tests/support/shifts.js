import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

export function observeCafeLock(db) {
 let reached;
 const atLock=new Promise(resolve=>{reached=resolve;}),pending=new Set();
 const observed={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{
  get(target,key){
   if(key!=='$queryRaw')return target[key];
   return (...args)=>{
    const query=target.$queryRaw(...args);
    if(!args[0].join('').includes('FROM cafe_settings'))return query;
    const token={};pending.add(token);
    const running=Promise.resolve(query).finally(()=>pending.delete(token));
    reached();return running;
   };
  },
 })),options)};
 return {db:observed,async assertBlocked(){
  await Promise.race([atLock,setTimeout(3000).then(()=>{throw new Error('Contender never attempted cafe lock');})]);
  await setTimeout(50);
  assert.equal(pending.size,1,'Cafe lock must remain blocked while holder gate stays closed');
 }};
}

import { fixture,testConfig } from './fixtures.js';
import { startApp,request,loginAs } from './http.js';
import { sessionDigest } from '../../src/services/auth.service.js';
export async function shiftFixture(db){
 const f=await fixture(db),config=testConfig(),h=await startApp({db,config});
 const registers=[];
 for(let i=0;i<3;i++)registers.push(await db.cash_registers.create({data:{name:'Register '+i,code:randomUUID()}}));
 const admin=await loginAs(h,f.adminA.username,f.password),cashier=await loginAs(h,f.cashierA.username,f.password),other=await loginAs(h,f.cashierB.username,f.password);
 const api=(path,method='GET',body,session=admin)=>request(h,{path,method,body,...session,headers:{Origin:config.allowedOrigin}});
 const actor=async(user,login)=>{const tokenHash=sessionDigest(login.cookie.split('=')[1]),session=await db.auth_sessions.findUnique({where:{token_hash:tokenHash}});return{id:user.id,role:user.role,sessionId:session.id,tokenHash};};
 return{...f,h,config,registers,admin,cashier,other,api,actor,async cleanup(){
  await db.cashier_shifts.deleteMany({where:{cash_register_id:{in:registers.map(r=>r.id)}}});
  await db.cash_registers.deleteMany({where:{id:{in:registers.map(r=>r.id)}}});await h.close();await f.cleanup();
 }};
}
