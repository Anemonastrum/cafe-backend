import { randomUUID } from 'node:crypto';
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
 return{...f,registers,admin,cashier,other,api,actor,async cleanup(){
  await db.cashier_shifts.deleteMany({where:{cash_register_id:{in:registers.map(r=>r.id)}}});
  await db.cash_registers.deleteMany({where:{id:{in:registers.map(r=>r.id)}}});await h.close();await f.cleanup();
 }};
}
