import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import * as registers from '../models/register.model.js';
import * as model from '../models/shifts.model.js';
import { lockCafe } from '../models/lock.model.js';
import { Prisma } from '@prisma/client';
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
function scope(actor,row){found(row);if(actor.role!=='admin'&&row.cashier_id!==actor.id)throw new AppError(404,'NOT_FOUND','Not found');return row;}
export async function closeShift(db,actor,{id,closing_notes},context){return withWriteTx(db,async tx=>{
 await lockCafe(tx);const hint=found(await model.shiftById(tx,id));
 const {user}=await lockedActor(tx,actor,[hint.cashier_id]);
 await registers.lockRegister(tx,hint.cash_register_id);const before=scope(user,await model.lockShift(tx,id));
 if(before.status==='closed')return before;
 if(await model.hasUnresolvedWork(tx,id))conflict('Shift has unpaid orders or pending payments');
 const after=await model.closeShiftRow(tx,id,{status:'closed',closed_at:new Date(),closed_by_user_id:user.id,closing_notes:closing_notes??null});
 await appendAudit(tx,{actor:user,action:'shifts.close',entityType:'cashier_shifts',entityId:id,before,after,context});return after;
});}
const paged=({data,total},q)=>({data,meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}});
export async function listShifts(db,actor,q){return paged(await model.shiftRows(db,actor,q),q);}
export async function getShift(db,actor,id){const row=scope(actor,await model.shiftDetail(db,id));const {fk_shifts_cashier,fk_shifts_register,...plain}=row;return{...plain,cashier:fk_shifts_cashier,register:fk_shifts_register};}
export async function listShiftOrders(db,actor,{id,query}){return db.$transaction(async tx=>{
 scope(actor,await model.shiftById(tx,id));return paged(await model.shiftOrderRows(tx,id,query),query);
},{isolationLevel:'RepeatableRead'});}
export async function summarizeShift(db,actor,id){return db.$transaction(async tx=>{
 const shift=scope(actor,await model.shiftById(tx,id)),method_breakdown=await model.shiftSales(tx,id);
 return{shift_id:id,opened_at:shift.opened_at,closed_at:shift.closed_at,duration_seconds:Math.max(0,Math.floor(((shift.closed_at??new Date())-shift.opened_at)/1000)),transaction_count:method_breakdown.reduce((n,g)=>n+g.transaction_count,0),paid_sales_total:method_breakdown.reduce((n,g)=>n.plus(g.amount),new Prisma.Decimal(0)),method_breakdown};
},{isolationLevel:'RepeatableRead'});}

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
