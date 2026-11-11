import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import { productById } from '../models/products.model.js';
import * as model from '../models/variants.model.js';
const admin=a=>{if(a.role!=='admin')throw new AppError(403,'FORBIDDEN','Forbidden');};
const found=row=>{if(!row)throw new AppError(404,'NOT_FOUND','Not found');return row;};
export async function listVariantGroups(db,actor,productId){found(await productById(db,actor,productId));return model.variantGroups(db,productId,actor.role==='cashier');}
async function mutate(db,actor,input,action,context){
 admin(actor);try{return await withWriteTx(db,async tx=>{
  const {user}=await lockedActor(tx,actor);admin(user);
  const group=action.endsWith('Group'),create=action.startsWith('create'),remove=action.startsWith('delete');
  const before=create?null:found(await(group?model.variantGroup(tx,input.id):model.variantOption(tx,input.id)));
  if(create)found(await(group?productById(tx,user,input.productId):model.variantGroup(tx,input.id)));
  const data=create?{...input.patch,...(group?{product_id:input.productId}:{group_id:input.id})}:input.patch;
  const after=await model[action](tx,...(create?[data]:remove?[input.id]:[input.id,data]));
  await appendAudit(tx,{actor:user,action:'variants.'+action,entityType:group?'product_variant_groups':'product_variant_options',entityId:before?.id??after.id,before,after:remove?null:after,context});return after;
 });}catch(error){if(error.code==='P2002')throw new AppError(409,'VARIANT_CONFLICT','Name already exists');if(error.code==='P2003')throw new AppError(409,'VARIANT_REFERENCED','Variant has historical references; disable options instead');throw error;}
}
export const createVariantGroup=(db,actor,input,context)=>mutate(db,actor,input,'createGroup',context);
export const updateVariantGroup=(db,actor,input,context)=>mutate(db,actor,input,'updateGroup',context);
export const deleteVariantGroup=(db,actor,input,context)=>mutate(db,actor,input,'deleteGroup',context);
export const createVariantOption=(db,actor,input,context)=>mutate(db,actor,input,'createOption',context);
export const updateVariantOption=(db,actor,input,context)=>mutate(db,actor,input,'updateOption',context);
export const deleteVariantOption=(db,actor,input,context)=>mutate(db,actor,input,'deleteOption',context);
