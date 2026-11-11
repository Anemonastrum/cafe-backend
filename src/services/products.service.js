import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import { saveImage,removeManagedImage } from './media.service.js';
import { validatePromotion,promoActive } from '../validators/products.validator.js';
import * as model from '../models/products.model.js';
const admin=a=>{if(a.role!=='admin')throw new AppError(403,'FORBIDDEN','Forbidden');};
export function productView(row,now=new Date()){
  const {fk_variant_group_product_back, fk_addon_group_product_back,...plain}=row;
  return {...plain,promo_active:promoActive(row,now),
    ...(fk_variant_group_product_back?{variant_groups:fk_variant_group_product_back.map(({fk_variant_option_group_back,...group})=>({...group,options:fk_variant_option_group_back}))}:{}),
    ...(fk_addon_group_product_back?{addon_groups:fk_addon_group_product_back.map(({fk_addon_option_group_back,...group})=>({...group,options:fk_addon_option_group_back}))}:{})};
}
export async function listProducts(db,actor,q){const {data,total}=await model.productRows(db,actor,q);const now=new Date();return{data:data.map(row=>productView(row,now)),meta:{page:q.page,limit:q.limit,total,total_pages:Math.ceil(total/q.limit)}};}
export async function getProduct(db,actor,id){const row=await model.productById(db,actor,id,true);if(!row)throw new AppError(404,'NOT_FOUND','Not found');return productView(row);}
async function mutate(db,actor,id,data,action,context){
  admin(actor);try{return await withWriteTx(db,async tx=>{
    const {user}=await lockedActor(tx,actor);admin(user);
    const before=id?await model.productById(tx,user,id):null;if(id&&!before)throw new AppError(404,'NOT_FOUND','Not found');
    const effective={...before,...data};validatePromotion(effective);
    if(!await model.validReferences(tx,effective))throw new AppError(422,'INVALID_REFERENCE','Category or tax does not exist');
    const after=id?await model.updateProductRow(tx,id,data):await model.createProductRow(tx,data);
    await appendAudit(tx,{actor:user,action,entityType:'products',entityId:after.id,before,after,context});return{before,after};
  });}catch(error){if(error.code==='P2002')throw new AppError(409,'PRODUCT_CONFLICT','Product SKU already exists');throw error;}
}
export async function createProduct(db,actor,input,context){return productView((await mutate(db,actor,null,input,'products.create',context)).after);}
export async function updateProduct(db,actor,{id,patch},context){return productView((await mutate(db,actor,id,patch,'products.update',context)).after);}
export const setAvailability=(db,actor,{id,is_enabled},context)=>updateProduct(db,actor,{id,patch:{is_enabled}},context);
export const setPromotion=(db,actor,{id,patch},context)=>updateProduct(db,actor,{id,patch},context);
export async function archiveProduct(db,actor,id,context){return productView((await mutate(db,actor,id,{archived_at:new Date()},'products.archive',context)).after);}
export async function restoreProduct(db,actor,id,context){return productView((await mutate(db,actor,id,{archived_at:null},'products.restore',context)).after);}
async function cleanup(url,storageDir){if(!url?.startsWith('/media/'))return;try{await removeManagedImage(url,storageDir);}catch{console.error(JSON.stringify({event:'media_cleanup_required',url}));}}
export async function replaceProductImage(db,actor,{id,file},context,storageDir){
  admin(actor);const image=file?await saveImage({buffer:file.buffer,mime:file.mimetype,storageDir}):null;let result;
  try{result=await mutate(db,actor,id,{image_url:image?.url??null},'products.image',context);}
  catch(error){if(image)await cleanup(image.url,storageDir);throw error;}
  await cleanup(result.before.image_url,storageDir);return productView(result.after);
}
