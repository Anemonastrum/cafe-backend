import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { io } from 'socket.io-client';
import { withDatabase } from '../support/database.js';
import { orderFixture } from '../support/orders.js';
import { request } from '../support/http.js';
import { createRealtime } from '../../src/realtime/index.js';
import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('p11-t1 acceptance: eight post-commit signals obey live sessions and ownership',async()=>withDatabase(async db=>{
 const f=await orderFixture(db),events={},server=createServer(createApp({db,config:f.config,events})),rt=createRealtime(server,{db,config:f.config});Object.assign(events,rt);server.listen(0,'127.0.0.1');await once(server,'listening');const h={baseUrl:'http://127.0.0.1:'+server.address().port,origin:f.config.allowedOrigin},sockets=[];
 const connect=async(session,origin=f.config.allowedOrigin,query={})=>{const s=io(h.baseUrl,{transports:['websocket'],extraHeaders:{Cookie:session.cookie??'',Origin:origin},query,reconnection:false});sockets.push(s);await Promise.race([once(s,'connect'),once(s,'connect_error').then(([e])=>{throw e;})]);return s;};
 try{
  await assert.rejects(connect({},f.config.allowedOrigin));await assert.rejects(connect(f.admin,'https://bad.invalid'));await assert.rejects(connect(f.admin,f.config.allowedOrigin,{token:'no'}));
  const admin=await connect(f.admin),owner=await connect(f.cashier),other=await connect(f.other),received=new Map([admin,owner,other].map(s=>[s,[]]));for(const s of received.keys())s.onAny((name,payload)=>received.get(s).push({name,payload}));
  const api=(path,method='GET',body,session=f.cashier)=>request(h,{path,method,body,...session,headers:{Origin:f.config.allowedOrigin}});
  const shift=await api('/cashier-shifts/open','POST',{cash_register_id:String(f.registers[0].id)});assert.equal(shift.status,201);
  const input={...f.input,client_request_id:randomUUID()};const created=await api('/orders','POST',input);assert.equal(created.status,201);const id=created.body.data.id;
  other.emit('join',{order_id:id});other.emit('payment:updated',{order_id:id,status:'paid'});assert.equal((await db.orders.findUnique({where:{id:BigInt(id)}})).payment_status,'pending');
  assert.equal((await api('/orders/'+id,'PATCH',{notes:'changed'})).status,200);await api('/orders/'+id+'/hold','POST');await api('/orders/'+id+'/resume','POST');await api('/orders/'+id+'/status','PATCH',{status:'preparing'});
  const paid=await request(h,{path:'/orders/'+id+'/payments/cash',method:'POST',body:{cash_received:'100000'},...f.cashier,headers:{Origin:f.config.allowedOrigin,'Idempotency-Key':randomUUID()}});assert.equal(paid.status,201);
  assert.equal((await api('/cashier-shifts/'+shift.body.data.id+'/close','POST',{},f.cashier)).status,200);
  assert.equal((await api('/products/'+f.product.id+'/availability','PATCH',{is_enabled:false},f.admin)).status,200);await api('/admin/settings','PATCH',{cafe_name:'Signal cafe'},f.admin);
  await wait(100);const names=new Set(received.get(owner).map(e=>e.name));assert.deepEqual([...names].sort(),['order:created','order:held_changed','order:status_changed','order:updated','payment:updated','product:availability_changed','settings:updated','shift:updated'].sort());assert.equal(received.get(owner).find(e=>e.name==='order:created').payload.order_id,id);assert.ok(!received.get(other).some(e=>e.name.startsWith('order:')||e.name==='payment:updated'||e.name==='shift:updated'));assert.ok(received.get(admin).some(e=>e.name==='payment:updated'));assert.ok(!JSON.stringify(received.get(owner)).includes('next_order_number'));
  const replayCount=received.get(owner).filter(e=>e.name==='order:created').length;await api('/orders','POST',input);await wait(30);assert.equal(received.get(owner).filter(e=>e.name==='order:created').length,replayCount);
  const n=received.get(owner).length;assert.equal((await api('/orders','POST',{...f.input,client_request_id:randomUUID()})).status,409);await wait(50);assert.equal(received.get(owner).length,n);
  const {withWriteTx}=await import('../../src/utils/transaction.js'),{appendAudit}=await import('../../src/services/audit.service.js');
  await assert.rejects(withWriteTx(db,async tx=>{await appendAudit(tx,{actor:{id:f.cashierA.id},action:'orders.create',entityType:'orders',entityId:BigInt(id),after:{order_number:'ROLLBACK'},context:{events}});throw new Error('rollback');}),/rollback/);await wait(30);assert.ok(!received.get(owner).some(e=>e.payload.order_number==='ROLLBACK'));assert.equal(await db.audit_logs.count({where:{action:'orders.create',after_data:{path:'$.order_number',equals:'ROLLBACK'}}}),0);
  const {sessionDigest}=await import('../../src/services/auth.service.js');await db.auth_sessions.updateMany({where:{token_hash:sessionDigest(f.other.cookie.split('=')[1])},data:{expires_at:new Date(0)}});await rt.publish('settings:updated',{fields:['cafe_name']},{kind:'settings'});await wait(30);assert.equal(other.connected,false);
  await db.users.update({where:{id:f.adminA.id},data:{role:'cashier'}});received.get(admin).length=0;await rt.publish('order:updated',{order_id:id},{kind:'order',id});await wait(50);assert.equal(received.get(admin).length,0);
  await db.users.update({where:{id:f.cashierA.id},data:{is_active:false}});await rt.publish('payment:updated',{order_id:id,payment_id:paid.body.data.id,status:'paid'},{kind:'order',id});await wait(50);assert.equal(owner.connected,false);
  await db.auth_sessions.updateMany({where:{token_hash:sessionDigest(f.other.cookie.split('=')[1])},data:{expires_at:new Date(Date.now()+60000)}});const revoked=await connect(f.other);
  await api('/auth/logout','POST',{},f.other);await rt.publish('settings:updated',{fields:['cafe_name']},{kind:'settings'});await wait(50);assert.equal(revoked.connected,false);
  await rt.close();await wait(30);assert.equal(admin.connected,false);
 }finally{for(const s of sockets)s.close();await rt.close();if(server.listening)await new Promise(r=>server.close(r));await db.users.update({where:{id:f.adminA.id},data:{role:'admin'}});await db.users.update({where:{id:f.cashierA.id},data:{is_active:true}});await f.cleanup();}
}));
