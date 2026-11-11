import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import * as registers from '../models/register.model.js';
import * as model from '../models/shifts.model.js';
const admin=a=>{if(a.role!=='admin')throw new AppError(403,'FORBIDDEN','Forbidden');};
const found=row=>{if(!row)throw new AppError(404,'NOT_FOUND','Not found');return row;};
const conflict=message=>{throw new AppError(409,'SHIFT_CONFLICT',message);};
export async function listRegisters(db,actor,q){const {data,total}=await registers.registerRows(db,actor,q);return{data,meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}};}
export async function createRegister(db,actor,input,context){return mutateRegister(db,actor,null,input,context);}
export async function updateRegister(db,actor,{id,patch},context){return mutateRegister(db,actor,id,patch,context);}
async function mutateRegister(db,actor,id,data,context){
 admin(actor);try{return await withWriteTx(db,async tx=>{
  const {user}=await lockedActor(tx,actor);admin(user);const before=id?found(await registers.lockRegister(tx,id)):null;
  if(id&&data.is_active===false&&await model.registerOpenShift(tx,id))conflict('Register has an open shift');
  const after=id?await registers.updateRegisterRow(tx,id,data):await registers.createRegisterRow(tx,data);
  await appendAudit(tx,{actor:user,action:id?'registers.update':'registers.create',entityType:'cash_registers',entityId:after.id,before,after,context});return after;
 });}catch(error){if(error.code==='P2002')throw new AppError(409,'REGISTER_CONFLICT','Register code already exists');throw error;}
}
export const currentShift=(db,actor)=>model.ownOpenShift(db,actor.id);
export async function openShift(db,actor,{cash_register_id},context){return withWriteTx(db,async tx=>{
 const {user}=await lockedActor(tx,actor),register=found(await registers.lockRegister(tx,cash_register_id));
 if(!register.is_active)conflict('Register is inactive');
 if(await model.ownOpenShift(tx,user.id)||await model.registerOpenShift(tx,register.id))conflict('Cashier or register already has an open shift');
 const after=await model.createShift(tx,{cashier_id:user.id,cash_register_id:register.id});
 await appendAudit(tx,{actor:user,action:'shifts.open',entityType:'cashier_shifts',entityId:after.id,after,context});return after;
});}
// Caller holds lockCafe and user/register locks before invoking this primitive.
export async function requireOpenShift(tx,actorId){
 const shift=await model.ownOpenShift(tx,actorId);if(!shift)conflict('Open shift required');
 const locked=await model.lockShift(tx,shift.id);if(locked.status!=='open')conflict('Open shift required');return locked;
}
