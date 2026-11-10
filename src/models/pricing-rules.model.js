const models={'taxes':'taxes','service-charges':'service_charges','discounts':'discounts'};
export function ruleModel(db,kind) {
  if(!Object.hasOwn(models,kind)) throw new Error('Unknown rule kind');
  return db[models[kind]];
}
export async function listRuleRows(db,kind,q) {
  const where={...(q.is_active===undefined?{}:{is_active:q.is_active}),...(q.search?{name:{contains:q.search}}:{})};
  return db.$transaction(async tx=>({data:await ruleModel(tx,kind).findMany({where,skip:q.skip,take:q.limit,orderBy:q.orderBy}),total:await ruleModel(tx,kind).count({where})}),{isolationLevel:'RepeatableRead'});
}
