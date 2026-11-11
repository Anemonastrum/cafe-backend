import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { optionFixture, mutationGuards } from '../support/options.js';
test('p05-t2 acceptance: addon CRUD, effective limits and preserved snapshots',async()=>withDatabase(async db=>{
 const f=await optionFixture(db),{api,product,hidden,cashier}=f;
 try{
  const path=`/products/${product.id}/addon-groups`;
  await mutationGuards(f,[[path,'POST'],['/addon-groups/1','PATCH'],['/addon-groups/1','DELETE'],['/addon-groups/1/options','POST'],['/addon-options/1','PATCH'],['/addon-options/1','DELETE']]);
  assert.equal((await api(path,'GET',undefined,{})).status,401);
  assert.equal((await api(`/products/${hidden.id}/addon-groups`,'GET',undefined,cashier)).status,404);
  assert.equal((await api(path+'?extra=1')).status,422);
  for(const body of [{name:''},{name:'x',min_select:11},{name:'x',max_select:65536},{name:'x',min_select:-1},{name:'x',max_select:1.1},{name:'x',is_active:true}])assert.equal((await api(path,'POST',body)).status,422);
  const created=await api(path,'POST',{name:'Extras',min_select:1,max_select:10});assert.equal(created.status,201);const g=created.body.data.id;
  assert.equal((await api(path,'POST',{name:'extras'})).status,409);
  assert.equal((await api(`/addon-groups/${g}`,'PATCH',{min_select:11})).status,422);
  assert.equal((await api(`/addon-groups/${g}`,'PATCH',{max_select:0})).status,422);
  assert.equal((await api(`/addon-groups/${g}`,'PATCH',{name:'Extras',min_select:0,max_select:65535,sort_order:2})).status,200);
  for(const price of ['-1.00',1,'1000000000000.00','1.001'])assert.equal((await api(`/addon-groups/${g}/options`,'POST',{name:'Milk',price})).status,422);
  const made=await api(`/addon-groups/${g}/options`,'POST',{name:'Milk',price:'10.50'});assert.equal(made.status,201);const o=made.body.data.id;
  assert.equal((await api(`/addon-groups/${g}/options`,'POST',{name:'milk'})).status,409);
  assert.equal((await api(`/addon-options/${o}`,'PATCH',{name:'Cream',price:'20',is_enabled:false,sort_order:1})).status,200);
  assert.equal((await api(path)).body.data[0].options.length,1);assert.equal((await api(path,'GET',undefined,cashier)).body.data[0].options.length,0);
  const ref=await db.order_item_addons.create({data:{order_item_id:f.item.id,addon_option_id:BigInt(o),group_name:'Extras',option_name:'Milk',quantity:2,unit_price:'10.50',line_total:'21.00'}});
  assert.equal((await api(`/addon-options/${o}`,'DELETE',{})).status,409);assert.equal((await api(`/addon-groups/${g}`,'DELETE',{})).status,409);
  const snapshot=await db.order_item_addons.findUnique({where:{id:ref.id}});assert.equal(snapshot.option_name,'Milk');assert.equal(snapshot.unit_price.toFixed(2),'10.50');
  await db.order_item_addons.delete({where:{id:ref.id}});
  assert.equal((await api(`/addon-options/${o}`,'DELETE',{})).status,204);
  await api(`/addon-groups/${g}/options`,'POST',{name:'Sugar'});
  assert.equal((await api(`/addon-groups/${g}`,'DELETE',{})).status,204);
  assert.equal(await db.product_addon_options.count({where:{group_id:BigInt(g)}}),0);
  assert.equal((await api('/addon-options/18446744073709551615','PATCH',{name:'x'})).status,404);
  assert.ok(await db.audit_logs.count({where:{user_id:f.adminA.id,entity_type:'product_addon_groups'}}));
 }finally{await f.cleanup();}
}));
