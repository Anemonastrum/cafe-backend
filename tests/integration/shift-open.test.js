import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDatabase } from '../support/database.js';
import { shiftFixture } from '../support/shifts.js';
test('p06-t1 acceptance: register guards, own shift and atomic opening',async()=>withDatabase(async db=>{
 const f=await shiftFixture(db),{api,cashier,admin,registers}=f;
 try{
  for(const path of ['/cash-registers','/cashier-shifts/current'])assert.equal((await api(path,'GET',undefined,{})).status,401);
  for(const [path,method] of [['/admin/cash-registers','POST'],['/admin/cash-registers/1','PATCH'],['/cashier-shifts/open','POST']]){
   assert.equal((await api(path,method,{},{})).status,401);
   assert.equal((await api(path,method,{}, {cookie:admin.cookie})).status,403);
   if(path.startsWith('/admin/'))assert.equal((await api(path,method,{},cashier)).status,403);
  }
  assert.equal((await api('/cashier-shifts/current','GET',undefined,cashier)).body.data,null);
  assert.equal((await api('/admin/cash-registers','POST',{name:'',code:'x'})).status,422);
  assert.equal((await api('/admin/cash-registers','POST',{name:'New',code:registers[0].code})).status,409);
  const created=await api('/admin/cash-registers','POST',{name:'New',code:'new-'+f.adminA.id});assert.equal(created.status,201);registers.push({id:BigInt(created.body.data.id)});
  assert.equal((await api('/admin/cash-registers/'+registers[2].id,'PATCH',{is_active:false})).status,200);
  const all=await api('/cash-registers?include_inactive=true&limit=100&sort_by=name');assert.equal(all.status,200);assert.ok(all.body.data.some(r=>r.id===String(registers[2].id)));
  const visible=await api('/cash-registers?include_inactive=true','GET',undefined,cashier);assert.ok(visible.body.data.every(r=>r.is_active));
  for(const query of ['include_inactive=1','extra=1','sort_by=password'])assert.equal((await api('/cash-registers?'+query)).status,422);
  for(const body of [{cash_register_id:String(registers[0].id),opening_cash:'1.00'},{cash_register_id:String(registers[0].id),cashier_id:String(f.adminA.id)},{cash_register_id:0}])assert.equal((await api('/cashier-shifts/open','POST',body,cashier)).status,422);
  assert.equal((await api('/cashier-shifts/open','POST',{cash_register_id:String(registers[2].id)},cashier)).status,409);
  assert.equal((await api('/cashier-shifts/open','POST',{cash_register_id:'18446744073709551615'},cashier)).status,404);
  assert.equal(await db.cashier_shifts.count({where:{cashier_id:f.cashierA.id}}),0);
  const results=await Promise.all([admin,cashier].map(session=>api('/cashier-shifts/open','POST',{cash_register_id:String(registers[0].id)},session)));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal(await db.cashier_shifts.count({where:{cash_register_id:registers[0].id,status:'open'}}),1);
  const winner=results.find(r=>r.status===201).body.data;
  assert.ok(winner.opened_at);assert.ok(!('opening_cash' in winner));
  assert.equal((await api('/admin/cash-registers/'+registers[0].id,'PATCH',{is_active:false})).status,409);
  const winningSession=results[0].status===201?admin:cashier;
  assert.equal((await api('/cashier-shifts/current','GET',undefined,winningSession)).body.data.id,winner.id);
  assert.equal((await api('/cashier-shifts/open','POST',{cash_register_id:String(registers[1].id)},winningSession)).status,409);
  assert.ok(await db.audit_logs.count({where:{user_id:{in:[f.adminA.id,f.cashierA.id]},action:'shifts.open'}}));
 }finally{await f.cleanup();}
}));
