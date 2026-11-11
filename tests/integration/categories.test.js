import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';

test('p04-t1 acceptance: categories enforce visibility, validation and audited admin mutations', async () => withDatabase(async db => {
  const f=await fixture(db),config=testConfig(),h=await startApp({db,config}),ids=[];
  try {
    const admin=await loginAs(h,f.adminA.username,f.password),cashier=await loginAs(h,f.cashierA.username,f.password);
    const api=(path,method='GET',body,session=admin)=>request(h,{path,method,body,...session,headers:{Origin:config.allowedOrigin}});
    for(const [path,method] of [['/categories','GET'],['/categories','POST'],['/categories/1','GET'],['/categories/1','PATCH'],['/categories/1/status','PATCH']]) {
      assert.equal((await api(path,method,method==='GET'?undefined:{},{})).status,401);
      if(method!=='GET') {
        assert.equal((await api(path,method,{},cashier)).status,403);
        assert.equal((await api(path,method,{}, {cookie:admin.cookie})).status,403);
      }
    }
    const name=`category-${f.adminA.id}`;
    for(const bad of [{name:''},{name:'x'.repeat(121)},{name,sort_order:2147483648},{name,description:'x'.repeat(4001)},{name,is_active:false}]) assert.equal((await api('/categories','POST',bad)).status,422);
    const created=await api('/categories','POST',{name,description:'Tea',sort_order:2}); assert.equal(created.status,201);
    const id=created.body.data.id;ids.push(BigInt(id));
    assert.equal((await api('/categories','POST',{name:name.toUpperCase()})).status,409);
    assert.equal((await api('/categories/'+id,'GET',undefined,cashier)).status,404);
    await db.products.create({data:{category_id:BigInt(id),name:'Tea',base_price:'25000'}});
    assert.equal((await api('/categories/'+id,'GET',undefined,cashier)).status,200);
    assert.equal((await api('/categories/'+id,'PATCH',{description:null,sort_order:-1})).status,200);
    assert.equal((await api('/categories/'+id+'/status','PATCH',{is_active:false})).status,200);
    assert.equal((await api('/categories/'+id,'GET',undefined,cashier)).status,404);
    const filtered=await api('/categories?include_inactive=true&search='+name+'&sort_by=name&limit=1');
    assert.equal(filtered.body.meta.total,1);assert.equal(filtered.body.data[0].id,id);
    assert.equal((await api('/categories?search='+name)).body.data.length,0);
    const safe=await api('/categories?include_inactive=true','GET',undefined,cashier);assert.equal(safe.status,200);assert.ok(safe.body.data.every(x=>x.is_active));
    for(const q of ['include_inactive=1','sort_by=secret','search[x]=y','extra=1'])assert.equal((await api('/categories?'+q)).status,422);
    assert.equal((await api('/categories/0')).status,422);
    assert.equal((await api('/categories/18446744073709551615')).status,404);
    assert.ok(await db.audit_logs.count({where:{user_id:f.adminA.id,action:'categories.status'}}));
    assert.equal(await db.products.count({where:{category_id:BigInt(id)}}),1);
  } finally {
    await db.products.deleteMany({where:{category_id:{in:ids}}});await db.categories.deleteMany({where:{id:{in:ids}}});
    await h.close();await f.cleanup();
  }
}));
