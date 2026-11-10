import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';

test('p03-t3 acceptance: merged rule limits, dates, filters and payment invariants', async () => withDatabase(async db => {
  const f = await fixture(db), config = testConfig(), h = await startApp({ db, config });
  const made = [], methods = await db.payment_methods.findMany();
  try {
    const admin = await loginAs(h, f.adminA.username, f.password), cashier = await loginAs(h, f.cashierA.username, f.password);
    const api = (path, method='GET', body, session=admin) => request(h,{path,method,body,...session,headers:{Origin:config.allowedOrigin}});
    for (const kind of ['taxes','service-charges','discounts']) {
      const path = '/admin/'+kind;
      for (const [url,method] of [[path,'GET'],[path,'POST'],[path+'/1','PATCH']]) {
        assert.equal((await api(url,method,method==='GET'?undefined:{},{})).status,401);
        assert.equal((await api(url,method,method==='GET'?undefined:{},cashier)).status,403);
        if(method!=='GET') assert.equal((await api(url,method,{}, {cookie:admin.cookie})).status,403);
      }
      const name = `${kind}-${f.adminA.id}`;
      const data = kind==='taxes' ? {name,rate_percent:'10.1250'} : {name,calculation:'fixed',value:'101.00'};
      const row = await api(path,'POST',data); assert.equal(row.status,201);
      const id = row.body.data.id; made.push({kind,id:BigInt(id)});
      if(kind==='taxes') {
        assert.equal(row.body.data.rate_percent,'10.1250');
        assert.equal((await api(path+'/'+id,'PATCH',{rate_percent:'10.1251'})).status,200);
        const audit = await db.audit_logs.findFirst({where:{user_id:f.adminA.id,entity_id:id,action:'taxes.update'},orderBy:{id:'desc'}});
        assert.equal(audit.before_data.rate_percent,'10.1250');
        assert.equal(audit.after_data.rate_percent,'10.1251');
        assert.equal((await api(path+'/'+id,'PATCH',{rate_percent:'100.0001'})).status,422);
        assert.equal((await api(path,'POST',{name:name+'-bad',rate_percent:10})).status,422);
      } else {
        assert.equal((await api(path+'/'+id,'PATCH',{calculation:'percent'})).status,422);
        assert.equal((await api(path,'POST',{name:name+'-bad',value:'101.00'})).status,422);
        assert.equal((await api(path+'/'+id,'PATCH',{value:'100.00',calculation:'percent'})).status,200);
      }
      if(kind==='discounts') {
        assert.equal((await api(path+'/'+id,'PATCH',{starts_at:'2026-11-10T00:00:00Z',ends_at:'2026-11-11T00:00:00Z'})).status,200);
        assert.equal((await api(path+'/'+id,'PATCH',{starts_at:'2026-11-12T00:00:00Z'})).status,422);
        assert.equal((await api(path+'/'+id,'PATCH',{ends_at:'tomorrow'})).status,422);
      }
      assert.equal((await api(path+'/'+id,'PATCH',{is_active:false})).status,200);
      const list = await api(path+'?is_active=false&search='+name+'&limit=1&sort_by=name&sort_order=desc');
      assert.equal(list.status,200); assert.equal(list.body.meta.total,1); assert.equal(list.body.data[0].id,id);
      assert.equal((await api(path+'?is_active=1')).status,422);
      assert.equal((await api(path+'/'+id,'PATCH',{unknown:true})).status,422);
    }
    const cash = methods.find(m=>m.code==='cash'), qris=methods.find(m=>m.code==='qris');
    assert.ok(cash && qris);
    assert.equal((await api('/admin/payment-methods','GET',undefined,cashier)).status,403);
    assert.equal((await api('/payment-methods','GET',undefined,{})).status,401);
    assert.equal((await api(`/admin/payment-methods/${cash.id}`,'PATCH',{provider:'midtrans'})).status,422);
    assert.equal((await api(`/admin/payment-methods/${qris.id}`,'PATCH',{provider:'midtrans'})).status,422);
    assert.equal((await api(`/admin/payment-methods/${qris.id}`,'PATCH',{is_enabled:false}, {cookie:admin.cookie})).status,403);
    assert.equal((await api(`/admin/payment-methods/${qris.id}`,'PATCH',{is_enabled:false})).status,200);
    const visible=await api('/payment-methods','GET',undefined,cashier);
    assert.ok(visible.body.data.every(m=>m.is_enabled));
    assert.equal((await api('/payment-methods?include_disabled=true','GET',undefined,cashier)).status,403);
    assert.ok((await api('/payment-methods?include_disabled=true')).body.data.some(m=>m.id===String(qris.id)));
    assert.equal((await api('/payment-methods?include_disabled=1')).status,422);
    assert.equal((await api('/admin/payment-methods')).body.data.length,methods.length);
  } finally {
    for (const {kind,id} of made) await db[{'taxes':'taxes','service-charges':'service_charges','discounts':'discounts'}[kind]].delete({where:{id}});
    for (const m of methods) await db.payment_methods.update({where:{id:m.id},data:{provider:m.provider,is_enabled:m.is_enabled}});
    await h.close(); await f.cleanup();
  }
}));
