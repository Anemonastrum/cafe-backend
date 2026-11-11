import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withDatabase } from '../support/database.js';
import { fixture, testConfig } from '../support/fixtures.js';
import { startApp, request, loginAs } from '../support/http.js';

test('p04-t2 acceptance: products, promotions, visibility, image lifecycle and complete menu', async () => withDatabase(async db => {
  const f=await fixture(db),storageDir=await mkdtemp(join(tmpdir(),'cafe-product-')),config={...testConfig(),storageDir},h=await startApp({db,config});
  const category=await db.categories.create({data:{name:`products-${f.adminA.id}`}}),ids=[];
  try {
    const admin=await loginAs(h,f.adminA.username,f.password),cashier=await loginAs(h,f.cashierA.username,f.password);
    const api=(path,method='GET',body,session=admin)=>request(h,{path,method,body,...session,headers:{Origin:config.allowedOrigin}});
    const input={category_id:String(category.id),name:'Tea',base_price:'25000.00',sku:`sku-${f.adminA.id}`};
    const writes=[['/products','POST'],['/products/1','PATCH'],['/products/1/availability','PATCH'],['/products/1/promotion','PATCH'],['/products/1/archive','POST'],['/products/1/restore','POST'],['/products/1/image','POST'],['/products/1/image','DELETE']];
    for(const [path,method] of writes){
      assert.equal((await api(path,method,{},{})).status,401);assert.equal((await api(path,method,{},cashier)).status,403);
      assert.equal((await api(path,method,{}, {cookie:admin.cookie})).status,403);
    }
    for(const path of ['/products','/products/1','/pos/menu'])assert.equal((await api(path,'GET',undefined,{})).status,401);
    for(const patch of [{base_price:25000},{base_price:'-1.00'},{category_id:'18446744073709551615'},{tax_id:'18446744073709551615'},{image_url:'javascript:alert(1)'},{unknown:1}])assert.equal((await api('/products','POST',{...input,...patch})).status,422);
    const created=await api('/products','POST',input);assert.equal(created.status,201);const id=created.body.data.id;ids.push(BigInt(id));
    assert.equal(created.body.data.base_price,'25000.00');assert.equal((await api('/products','POST',input)).status,409);
    assert.equal((await api('/products/'+id,'PATCH',{name:'Green tea',description:null,sort_order:2})).status,200);
    assert.equal((await api('/products/'+id+'/promotion','PATCH',{promo_price:'30000.00'})).status,422);
    assert.equal((await api('/products/'+id+'/promotion','PATCH',{promo_price:'20000.00',promo_starts_at:'2026-01-01T00:00:00Z',promo_ends_at:'2099-01-01T00:00:00Z'})).status,200);
    assert.equal((await api('/products/'+id+'/promotion','PATCH',{promo_starts_at:'2099-01-02T00:00:00Z'})).status,422);
    assert.equal((await api('/products/'+id+'/promotion','PATCH',{promo_ends_at:'2026-02-30T00:00:00Z'})).status,422);
    assert.equal((await api('/products/'+id,'PATCH',{base_price:'19000.00'})).status,422);
    const group=await db.product_variant_groups.create({data:{product_id:BigInt(id),name:'Size'}});
    await db.product_variant_options.createMany({data:[{group_id:group.id,name:'Small',price_delta:'0'},{group_id:group.id,name:'Hidden',price_delta:'1000',is_enabled:false}]});
    const addon=await db.product_addon_groups.create({data:{product_id:BigInt(id),name:'Extras'}});
    await db.product_addon_options.createMany({data:[{group_id:addon.id,name:'Milk',price:'2000'},{group_id:addon.id,name:'Hidden',price:'1000',is_enabled:false}]});
    const detail=await api('/products/'+id,'GET',undefined,cashier);assert.equal(detail.status,200);
    assert.equal(detail.body.data.variant_groups[0].options.length,1);assert.equal(detail.body.data.addon_groups[0].options.length,1);
    assert.equal(detail.body.data.promo_active,true);
    const menu=await api('/pos/menu','GET',undefined,cashier);assert.equal(menu.status,200);
    assert.ok(menu.body.data.categories.some(c=>c.id===String(category.id)));assert.ok(menu.body.data.products.some(p=>p.id===id));
    const filtered=await api(`/products?category_id=${category.id}&search=Green&enabled=true&limit=1&sort_by=name`);
    assert.equal(filtered.body.meta.total,1);assert.equal(filtered.body.data[0].id,id);
    assert.equal((await api('/products/'+id+'/availability','PATCH',{is_enabled:false})).status,200);
    assert.equal((await api('/products/'+id,'GET',undefined,cashier)).status,404);
    assert.equal((await api('/products/'+id+'/archive','POST',{})).status,200);
    assert.equal((await api(`/products?category_id=${category.id}`)).body.data.length,0);
    assert.equal((await api(`/products?category_id=${category.id}&include_archived=true`)).body.data.length,1);
    const hidden=await api('/products?enabled=false&include_archived=true','GET',undefined,cashier);assert.ok(hidden.body.data.every(p=>p.is_enabled&&!p.archived_at));
    assert.equal((await api('/products/'+id+'/restore','POST',{})).body.data.is_enabled,false);
    assert.equal((await api('/products/'+id+'/availability','PATCH',{is_enabled:true})).status,200);
    await db.categories.update({where:{id:category.id},data:{is_active:false}});
    assert.equal((await api('/products/'+id,'GET',undefined,cashier)).status,404);
    assert.equal((await api('/pos/menu','GET',undefined,cashier)).body.data.products.some(p=>p.id===id),false);
    await db.categories.update({where:{id:category.id},data:{is_active:true}});
    assert.equal((await api('/products/'+id+'/promotion','PATCH',{promo_price:null})).body.data.promo_price,null);
    assert.equal((await api('/products/'+id,'PATCH',{base_price:'19000.00'})).status,200);
    for(const q of ['enabled=1','include_archived=1','search[x]=y','sort_by=password','category_id=0','extra=1'])assert.equal((await api('/products?'+q)).status,422);
    assert.equal((await api('/products/'+id,'DELETE',{})).status,404);
    const upload=async(buffer,mime)=>{const body=new FormData();body.set('file',new Blob([buffer],{type:mime}),'../../outside.png');return fetch(`${h.baseUrl}/api/v1/products/${id}/image`,{method:'POST',body,headers:{Cookie:admin.cookie,Origin:config.allowedOrigin,'X-CSRF-Token':admin.csrf}});};
    assert.equal((await upload(Buffer.from('<svg/>'),'image/png')).status,422);
    const png=await sharp({create:{width:2,height:2,channels:3,background:'green'}}).png().toBuffer();
    const image=await upload(png,'image/png');assert.equal(image.status,200);const url=(await image.json()).data.image_url;
    assert.equal((await fetch(h.baseUrl+url)).status,200);
    assert.equal((await api('/products/'+id+'/image','DELETE',{})).status,204);assert.deepEqual(await readdir(storageDir),[]);
    assert.ok(await db.audit_logs.count({where:{user_id:f.adminA.id,action:'products.archive'}}));
  } finally {
    const variants=await db.product_variant_groups.findMany({where:{product_id:{in:ids}}});const addons=await db.product_addon_groups.findMany({where:{product_id:{in:ids}}});
    await db.product_variant_options.deleteMany({where:{group_id:{in:variants.map(x=>x.id)}}});await db.product_addon_options.deleteMany({where:{group_id:{in:addons.map(x=>x.id)}}});
    await db.product_variant_groups.deleteMany({where:{product_id:{in:ids}}});await db.product_addon_groups.deleteMany({where:{product_id:{in:ids}}});
    await db.products.deleteMany({where:{id:{in:ids}}});await db.categories.delete({where:{id:category.id}});
    await h.close();await f.cleanup();await rm(storageDir,{recursive:true,force:true});
  }
}));
