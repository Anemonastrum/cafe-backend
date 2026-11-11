import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import * as model from '../models/categories.model.js';
const admin=a=>{if(a.role!=='admin')throw new AppError(403,'FORBIDDEN','Forbidden');};
export async function listCategories(db,actor,q){const {data,total}=await model.categoryRows(db,actor,q);return{data,meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}};}
export async function getCategory(db,actor,id){const row=await model.categoryById(db,actor,id);if(!row)throw new AppError(404,'NOT_FOUND','Not found');return row;}
async function mutate(db,actor,id,data,action,context){
  admin(actor);try{return await withWriteTx(db,async tx=>{
    const {user}=await lockedActor(tx,actor);admin(user);
    const before=id?await getCategory(tx,user,id):null;
    const after=id?await model.updateCategoryRow(tx,id,data):await model.createCategoryRow(tx,data);
    await appendAudit(tx,{actor:user,action,entityType:'categories',entityId:after.id,before,after,context});return after;
  });}catch(error){if(error.code==='P2002')throw new AppError(409,'CATEGORY_CONFLICT','Category already exists');throw error;}
}
export const createCategory=(db,actor,input,context)=>mutate(db,actor,null,input,'categories.create',context);
export const updateCategory=(db,actor,{id,patch},context)=>mutate(db,actor,id,patch,'categories.update',context);
export const setCategoryStatus=(db,actor,{id,is_active},context)=>mutate(db,actor,id,{is_active},'categories.status',context);
