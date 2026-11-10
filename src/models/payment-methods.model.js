export const listMethodRows=(db,all)=>db.payment_methods.findMany({where:all?{}:{is_enabled:true},orderBy:{id:'asc'}});
export const getMethod=(tx,id)=>tx.payment_methods.findUnique({where:{id}});
export const writeMethod=(tx,id,data)=>tx.payment_methods.update({where:{id},data});
