import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { optionFixture } from '../support/options.js';
import { lockCafe } from '../../src/models/lock.model.js';
import { sessionDigest } from '../../src/services/auth.service.js';
import { deleteVariantOption } from '../../src/services/variants.service.js';
import { deleteAddonOption } from '../../src/services/addons.service.js';

test('catalog deletes wait for singleton-locked history writer and retain committed references',async()=>withDatabase(async db=>{
 const f=await optionFixture(db);
 try{
  const tokenHash=sessionDigest(f.admin.cookie.split('=')[1]),session=await db.auth_sessions.findUnique({where:{token_hash:tokenHash}});
  const actor={id:f.adminA.id,role:'admin',sessionId:session.id,tokenHash};
  for(const kind of ['variant','addon']){
   const group=await db[`product_${kind}_groups`].create({data:{product_id:f.product.id,name:'Race'}});
   const option=await db[`product_${kind}_options`].create({data:{group_id:group.id,name:'Option'}});
   let release,ready;const gate=new Promise(r=>release=r),locked=new Promise(r=>ready=r);
   const writer=db.$transaction(async tx=>{
    await lockCafe(tx);
    const data={order_item_id:f.item.id,[kind+'_option_id']:option.id,group_name:'Race',option_name:'Option',...(kind==='addon'?{quantity:1,unit_price:'0',line_total:'0'}:{price_delta:'0'})};
    await tx[`order_item_${kind==='addon'?'addons':'variants'}`].create({data});ready();await gate;
   });
   await locked;
   let settled=false;
   const deletion=(kind==='variant'?deleteVariantOption:deleteAddonOption)(db,actor,{id:option.id},{}).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
   try{await new Promise(r=>setTimeout(r,50));assert.equal(settled,false);}finally{release();await writer;}
   assert.equal((await deletion).status,409);
   assert.ok(await db[`product_${kind}_options`].findUnique({where:{id:option.id}}));
  }
 }finally{await f.cleanup();}
}));
