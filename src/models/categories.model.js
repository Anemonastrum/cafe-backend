export const sellableProduct={is_enabled:true,archived_at:null};
export function categoryWhere(actor,query={}) {
  return {...(actor.role==='admin'&&query.include_inactive?{}:{is_active:true}),
    ...(actor.role==='cashier'?{fk_products_category_back:{some:sellableProduct}}:{}),
    ...(query.search?{name:{contains:query.search}}:{})};
}
export async function categoryRows(db,actor,q){
  const where=categoryWhere(actor,q);
  return db.$transaction(async tx=>({data:await tx.categories.findMany({where,orderBy:q.orderBy,skip:q.skip,take:q.limit}),total:await tx.categories.count({where})}),{isolationLevel:'RepeatableRead'});
}
export const categoryById=(db,actor,id)=>db.categories.findFirst({where:{id,...(actor.role==='cashier'?categoryWhere(actor):{})}});
export const createCategoryRow=(tx,data)=>tx.categories.create({data});
export const updateCategoryRow=(tx,id,data)=>tx.categories.update({where:{id},data});
