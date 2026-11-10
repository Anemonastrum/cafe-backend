import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import { ruleModel,listRuleRows } from '../models/pricing-rules.model.js';
import { validateEffectiveRule } from '../validators/pricing-rules.validator.js';
const admin=a=>{if(a.role!=='admin')throw new AppError(403,'FORBIDDEN','Forbidden');};
export async function listRules(db,actor,kind,q) {
  admin(actor);const {data,total}=await listRuleRows(db,kind,q);
  return {data,meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}};
}
async function mutate(db,actor,kind,id,patch,context) {
  admin(actor);
  try{return await withWriteTx(db,async tx=>{
    const {user}=await lockedActor(tx,actor);admin(user);
    const model=ruleModel(tx,kind),before=id?await model.findUnique({where:{id}}):null;
    if(id&&!before)throw new AppError(404,'NOT_FOUND','Not found');
    const defaults=kind==='taxes'?{rate_percent:'0',is_inclusive:false,is_active:true}:{calculation:'percent',value:'0',is_active:true,...(kind==='service-charges'?{is_auto_applied:true}:{})};
    const effective={...(before??defaults),...patch};validateEffectiveRule(kind,effective);
    const after=id?await model.update({where:{id},data:patch}):await model.create({data:{...defaults,...patch}});
    const snapshot = row => row && kind === 'taxes' ? { ...row, rate_percent: row.rate_percent.toFixed(4) } : row;
    await appendAudit(tx,{actor:user,action:`${kind}.${id?'update':'create'}`,entityType:kind,entityId:after.id,before:snapshot(before),after:snapshot(after),context});return after;
  });}catch(error){if(error.code==='P2002')throw new AppError(409,'RULE_CONFLICT','Pricing rule already exists');throw error;}
}
export const createRule=(db,actor,kind,input,context)=>mutate(db,actor,kind,null,input,context);
export const updateRule=(db,actor,kind,{id,patch},context)=>mutate(db,actor,kind,id,patch,context);
