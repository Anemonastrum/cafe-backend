export const insertAudit = (tx, data) => tx.audit_logs.create({ data });

export async function auditRows(tx,q){const where={...q.filters,created_at:{gte:q.range.from,lt:q.range.to}};return{data:await tx.audit_logs.findMany({where,orderBy:[{created_at:'desc'},{id:'desc'}],skip:q.skip,take:q.limit}),total:await tx.audit_logs.count({where})};}
export const auditById=(tx,id)=>tx.audit_logs.findUnique({where:{id}});
