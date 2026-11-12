import { authenticate } from '../middlewares/authenticate.js';
export async function socketActor(db,config,headers){const req={headers};await authenticate(db,config)(req,{},()=>{});return req.actor;}
export async function canReceive(db,actor,scope){
 if(['pos','settings'].includes(scope.kind))return true;
 const row=scope.kind==='order'?await db.orders.findUnique({where:{id:BigInt(scope.id)},select:{cashier_id:true}}):scope.kind==='shift'?await db.cashier_shifts.findUnique({where:{id:BigInt(scope.id)},select:{cashier_id:true}}):null;
 return !!row&&(actor.role==='admin'||row.cashier_id===actor.id);
}
