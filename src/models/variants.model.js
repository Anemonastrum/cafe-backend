const orderBy=[{sort_order:'asc'},{id:'asc'}];
export async function variantGroups(db,productId,cashier){
 const rows=await db.product_variant_groups.findMany({where:{product_id:productId},orderBy,include:{fk_variant_option_group_back:{where:cashier?{is_enabled:true}:{},orderBy}}});
 return rows.map(({fk_variant_option_group_back,...group})=>({...group,options:fk_variant_option_group_back}));
}
export const variantGroup=(tx,id)=>tx.product_variant_groups.findUnique({where:{id}});
export const variantOption=(tx,id)=>tx.product_variant_options.findUnique({where:{id}});
export const createGroup=(tx,data)=>tx.product_variant_groups.create({data});
export const updateGroup=(tx,id,data)=>tx.product_variant_groups.update({where:{id},data});
export const createOption=(tx,data)=>tx.product_variant_options.create({data});
export const updateOption=(tx,id,data)=>tx.product_variant_options.update({where:{id},data});
export async function deleteGroup(tx,id){await tx.product_variant_options.deleteMany({where:{group_id:id}});await tx.product_variant_groups.delete({where:{id}});}
export const deleteOption=(tx,id)=>tx.product_variant_options.delete({where:{id}});
