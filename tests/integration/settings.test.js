import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';

test('p03-t2 acceptance: settings projections, validation, managed upload and cleanup', async () => withDatabase(async db => {
  const f = await fixture(db), storageDir = await mkdtemp(join(tmpdir(), 'cafe-logo-'));
  const config = { ...testConfig(), storageDir }, h = await startApp({ db, config });
  const before = await db.cafe_settings.findUnique({ where: { id: 1 } });
  let tax;
  try {
    const admin = await loginAs(h, f.adminA.username, f.password), cashier = await loginAs(h, f.cashierA.username, f.password);
    const api = (path, method='GET', body, session=admin) => request(h, { path, method, body, ...session, headers: { Origin: config.allowedOrigin } });
    assert.equal((await api('/settings/public','GET',undefined,{})).status,401);
    assert.equal((await api('/admin/settings','GET',undefined,cashier)).status,403);
    const safe = await api('/settings/public','GET',undefined,cashier); assert.equal(safe.status,200);
    for (const k of ['cashier_can_discount','next_order_number','default_tax_id']) assert.equal(k in safe.body.data,false);
    assert.equal((await api('/admin/settings','PATCH',{}, {cookie:admin.cookie})).status,403);
    for (const body of [{next_order_number:'1'},{currency:'USD'},{timezone:'UTC'},{receipt_paper_mm:'90'},{order_prefix:'x'.repeat(16)},{email:'bad'},{logo_url:'https://evil.example'}]) assert.equal((await api('/admin/settings','PATCH',body)).status,422);
    tax = await db.taxes.create({data:{name:`settings-${f.adminA.id}`,rate_percent:'10',is_active:false}});
    assert.equal((await api('/admin/settings','PATCH',{default_tax_id:String(tax.id)})).status,422);
    await db.taxes.update({where:{id:tax.id},data:{is_active:true}});
    const changed = await api('/admin/settings','PATCH',{default_tax_id:String(tax.id),receipt_paper_mm:'58',cafe_name:'Test café'});
    assert.equal(changed.status,200); assert.equal(changed.body.data.receipt_paper_mm,'58');
    const upload = async (buffer, mime, session=admin) => {
      const body = new FormData(); body.set('file', new Blob([buffer],{type:mime}),'../../logo.png');
      return fetch(`${h.baseUrl}/api/v1/admin/settings/logo`,{method:'POST',body,headers:{Cookie:session.cookie,Origin:config.allowedOrigin,...(session.csrf?{'X-CSRF-Token':session.csrf}:{})}});
    };
    assert.equal((await upload(Buffer.from('<svg/>'),'image/svg+xml')).status,422);
    assert.equal((await upload(Buffer.alloc(5*1024*1024+1),'image/png')).status,413);
    assert.equal((await upload(Buffer.from('fake'),'image/png')).status,422);
    assert.equal((await upload(Buffer.from('fake'),'image/png',{cookie:admin.cookie})).status,403);
    const png = await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
    const first = await upload(png,'image/png'); assert.equal(first.status,200);
    const url = (await first.json()).data.logo_url;
    assert.equal((await fetch(h.baseUrl+url)).status,200);
    assert.equal((await upload(png,'image/png')).status,200);
    assert.equal((await readdir(storageDir)).length,1);
    assert.equal((await fetch(h.baseUrl+url)).status,404);
    assert.equal((await api('/admin/settings/logo','DELETE',{})).status,204);
    assert.deepEqual(await readdir(storageDir),[]);
  } finally {
    await db.cafe_settings.update({where:{id:1},data:before});
    if(tax) await db.taxes.delete({where:{id:tax.id}});
    await h.close(); await f.cleanup(); await rm(storageDir,{recursive:true,force:true});
  }
}));
