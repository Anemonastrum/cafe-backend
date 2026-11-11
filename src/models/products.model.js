import { sellableProduct } from './categories.model.js';
export const visibleProduct={...sellableProduct,fk_products_category:{is_active:true}};
export function productWhere(actor,q={}){
  return {...(actor.role==='cashier'?visibleProduct:{...(q.include_archived?{}:{archived_at:null}),...(q.enabled===undefined?{}:{is_enabled:q.enabled})}),
    ...(q.category_id===undefined?{}:{category_id:q.category_id}),...(q.search?{OR:[{name:{contains:q.search}},{sku:{contains:q.search}}]}:{})};
}
const orderBy=[{sort_order:'asc'},{id:'asc'}];
export const optionInclude={
  fk_variant_group_product_back:{orderBy,include:{fk_variant_option_group_back:{where:{is_enabled:true},orderBy}}},
  fk_addon_group_product_back:{orderBy,include:{fk_addon_option_group_back:{where:{is_enabled:true},orderBy}}},
};
export async function productRows(db,actor,q){const where=productWhere(actor,q);return db.$transaction(async tx=>({data:await tx.products.findMany({where,orderBy:q.orderBy,skip:q.skip,take:q.limit}),total:await tx.products.count({where})}),{isolationLevel:'RepeatableRead'});}
export const productById=(db,actor,id,detail=false)=>db.products.findFirst({where:{id,...(actor.role==='cashier'?visibleProduct:{})},...(detail?{include:optionInclude}:{})});
export const createProductRow=(tx,data)=>tx.products.create({data});
export const updateProductRow=(tx,id,data)=>tx.products.update({where:{id},data});
export async function validReferences(tx,row){
  if(!await tx.categories.findUnique({where:{id:row.category_id}}))return false;
  return row.tax_id==null||Boolean(await tx.taxes.findUnique({where:{id:row.tax_id}}));
}
export async function menuRows(db){return db.$transaction(async tx=>({
  categories:await tx.categories.findMany({where:{is_active:true,fk_products_category_back:{some:sellableProduct}},orderBy}),
  products:await tx.products.findMany({where:visibleProduct,orderBy,include:optionInclude}),
}),{isolationLevel:'RepeatableRead'});}
