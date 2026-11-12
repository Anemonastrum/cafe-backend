import { createDatabase } from '../src/configs/database.js';
import { login,logout,sessionDigest } from '../src/services/auth.service.js';
import { failManualPayment } from '../src/services/payment.service.js';
import { parseId } from '../src/utils/ids.js';
let db,actor;
try{
 if(process.argv.length!==2||process.stdin.isTTY)throw new Error();
 process.stdin.setEncoding('utf8');let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>8192)throw new Error();}
 const b=JSON.parse(input);if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['username','password','id','reason','expected_status'].includes(k))||typeof b.username!=='string'||!b.username.trim()||[...b.username].length>60||typeof b.password!=='string'||Buffer.byteLength(b.password)>512||b.expected_status!=='pending'||typeof b.reason!=='string'||!b.reason.trim()||[...b.reason].length>500)throw new Error();
 const id=parseId(b.id);db=createDatabase({databaseUrl:process.env.DATABASE_URL});await db.$connect();
 const authenticated=await login(db,{username:b.username,password:b.password},{}),tokenHash=sessionDigest(authenticated.secret),session=await db.auth_sessions.findUnique({where:{token_hash:tokenHash}});
 actor={...authenticated.user,sessionId:session.id,tokenHash};if(actor.role!=='admin')throw new Error();
 await failManualPayment(db,actor,{id,reason:b.reason,expected_status:b.expected_status},{});console.log('Manual pending payment marked failed');
}catch{console.error('Recovery refused or failed. Use private JSON stdin, active admin credentials, pending manual QRIS ID and reason.');process.exitCode=1;}
finally{if(db){if(actor)await logout(db,actor,{}).catch(()=>{process.exitCode=1;});await db.$disconnect().catch(()=>{process.exitCode=1;});}}
