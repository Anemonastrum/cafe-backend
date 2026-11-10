import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import * as model from '../models/payment-methods.model.js';
const admin=a=>{if(a.role!=='admin')throw new AppError(403,'FORBIDDEN','Forbidden');};
export function listMethods(db,actor,query){if(query.include_disabled)admin(actor);return model.listMethodRows(db,query.include_disabled);}
export function updateMethod(db,actor,{id,patch},context){
  admin(actor);return withWriteTx(db,async tx=>{
    const {user}=await lockedActor(tx,actor);admin(user);
    const before=await model.getMethod(tx,id);if(!before)throw new AppError(404,'NOT_FOUND','Not found');
    if((patch.provider??before.provider)!=='manual')throw new AppError(422,'PROVIDER_DISABLED','Payment provider is not enabled');
    const after=await model.writeMethod(tx,id,patch);
    await appendAudit(tx,{actor:user,action:'payment_methods.update',entityType:'payment_methods',entityId:id,before,after,context});return after;
  });
}
