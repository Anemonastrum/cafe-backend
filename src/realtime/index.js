import { Server } from 'socket.io';
import { socketActor,canReceive } from './authorize.js';
import { toWire } from '../utils/serialize.js';
const fields={'order:created':['order_id','order_number','status','created_at'],'order:updated':['order_id','fields'],'order:status_changed':['order_id','from_status','to_status','timestamp'],'order:held_changed':['order_id','is_held'],'payment:updated':['order_id','payment_id','status'],'shift:updated':['shift_id','status','opened_at','closed_at'],'product:availability_changed':['product_id','is_enabled'],'settings:updated':['fields']};
export function createRealtime(server,{db,config}){
 const io=new Server(server,{serveClient:false,cors:{origin:config.allowedOrigin,credentials:true},allowRequest:(req,done)=>done(null,req.headers.origin===config.allowedOrigin)});
 io.use(async(socket,next)=>{try{if(socket.handshake.headers.origin!==config.allowedOrigin||Object.keys(socket.handshake.query).some(k=>!['EIO','transport','t','sid'].includes(k))||Object.keys(socket.handshake.auth??{}).length)throw new Error();socket.data.actor=await socketActor(db,config,socket.handshake.headers);next();}catch{next(new Error('Unauthenticated'));}});
 let closed=false;
 return{async publish(name,payload,scope){if(closed||!fields[name])return;const safe=toWire(Object.fromEntries(fields[name].filter(k=>payload[k]!==undefined).map(k=>[k,payload[k]])));
  for(const socket of io.sockets.sockets.values()){
   let actor;try{actor=await socketActor(db,config,socket.handshake.headers);}catch{socket.disconnect(true);continue;}
   if(await canReceive(db,actor,scope)&&socket.connected)socket.emit(name,safe);
  }
 },async close(){if(closed)return;closed=true;await new Promise(resolve=>io.close(resolve));}};
}
