import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { optionFixture, mutationGuards } from '../support/options.js';
test('p05-t1 acceptance: variant CRUD, visibility and preserved history',async()=>withDatabase(async db=>{
 const f=await optionFixture(db),{api,product,hidden,cashier}=f;
 try{
  const path=`/products/${product.id}/variant-groups`;
  await mutationGuards(f,[[path,'POST'],['/variant-groups/1','PATCH'],['/variant-groups/1','DELETE'],['/variant-groups/1/options','POST'],['/variant-options/1','PATCH'],['/variant-options/1','DELETE']]);
  assert.equal((await api(path,'GET',undefined,{})).status,401);
  assert.equal((await api(`/products/${hidden.id}/variant-groups`,'GET',undefined,cashier)).status,404);
  assert.equal((await api(path+'?extra=1')).status,422);
  for(const body of [{name:''},{name:'x',is_required:1},{name:'x',sort_order:2**31},{name:'x',product_id:String(hidden.id)}])assert.equal((await api(path,'POST',body)).status,422);
  const created=await api(path,'POST',{name:'Size',is_required:true,sort_order:1});assert.equal(created.status,201);const g=created.body.data.id;
  assert.equal((await api(path,'POST',{name:'size'})).status,409);
  assert.equal((await api(`/variant-groups/${g}`,'PATCH',{is_required:false})).status,200);
  assert.equal((await api(`/variant-groups/${g}`,'PATCH',{name:'Size',is_required:true})).status,200);
  assert.equal((await api(`/variant-groups/${g}/options`,'POST',{name:'Bad',price_delta:'-1000000000000'})).status,422);
  const made=await api(`/variant-groups/${g}/options`,'POST',{name:'Small',price_delta:'-10.50'});assert.equal(made.status,201);const o=made.body.data.id;
  assert.equal((await api(`/variant-groups/${g}/options`,'POST',{name:'small'})).status,409);
  assert.equal((await api(`/variant-options/${o}`,'PATCH',{name:'Tiny',is_enabled:false,sort_order:2})).status,200);
  assert.equal((await api(path)).body.data[0].options.length,1);
  assert.equal((await api(path,'GET',undefined,cashier)).body.data[0].options.length,0);
  assert.equal((await api(`/products/${hidden.id}/variant-groups`)).status,200);
  const ref=await db.order_item_variants.create({data:{order_item_id:f.item.id,variant_option_id:BigInt(o),group_name:'Size',option_name:'Small',price_delta:'-10.50'}});
  assert.equal((await api(`/variant-options/${o}`,'DELETE',{})).status,409);
  assert.equal((await api(`/variant-groups/${g}`,'DELETE',{})).status,409);
  assert.equal((await db.order_item_variants.findUnique({where:{id:ref.id}})).option_name,'Small');
  await db.order_item_variants.delete({where:{id:ref.id}});
  assert.equal((await api(`/variant-options/${o}`,'DELETE',{})).status,204);
  await api(`/variant-groups/${g}/options`,'POST',{name:'Large'});
  assert.equal((await api(`/variant-groups/${g}`,'DELETE',{})).status,204);
  assert.equal(await db.product_variant_options.count({where:{group_id:BigInt(g)}}),0);
  assert.equal((await api('/variant-options/18446744073709551615','PATCH',{name:'x'})).status,404);
  assert.ok(await db.audit_logs.count({where:{user_id:f.adminA.id,entity_type:'product_variant_groups'}}));
 }finally{await f.cleanup();}
}));
