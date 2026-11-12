import assert from 'node:assert/strict';
import mariadb from 'mariadb';
import { test,mock } from 'node:test';
import { connectionOptions,compare,manifest } from '../../ops/verify-restore.mjs';
test('restore verifier rejects same target and unsafe URL before connecting',async()=>{
 for(const url of ['http://u:p@host/db','mysql://u:p@host/','mysql://u:p@host/db?x=1','mysql://u:p@host/a%2Fb'])assert.throws(()=>connectionOptions(url));
 assert.equal(connectionOptions('mysql://user:p%40ss@host/app2').password,'p@ss');
 assert.equal(connectionOptions('mysql://u:p@host/app').jsonStrings,true);
 await assert.rejects(compare('mysql://u:p@host/app','mysql://u:p@host/app'),/must differ/);
});
test('restore manifest hashes exact rows and DDL; detects financial corruption',async()=>{
 let amount='10.00',duplicate=0,ddl='CREATE TABLE payments(id bigint, amount decimal(14,2))';
 const db={query:async sql=>{
  if(sql.startsWith('SELECT TABLE_NAME,ENGINE'))return[{TABLE_NAME:'payments',ENGINE:'InnoDB',TABLE_COLLATION:'utf8mb4_unicode_ci'}];
  if(sql.startsWith('SHOW CREATE'))return[{'Create Table':ddl}];
  if(sql.startsWith('SELECT *'))return[{id:9007199254740993n,amount}];
  if(sql.includes('HAVING COUNT(*)>1'))return[{n:duplicate}];
  if(sql.includes(' AS n '))return[{n:0n}];
  return[];
 }};
 const first=await manifest(db);amount='11.00';const second=await manifest(db);assert.notEqual(first.tables[0].data_sha256,second.tables[0].data_sha256);assert.equal(first.tables[0].schema_sha256,second.tables[0].schema_sha256);
 ddl+=' COMMENT=\'changed\'';const third=await manifest(db);assert.notEqual(second.tables[0].schema_sha256,third.tables[0].schema_sha256);
 duplicate=1;await assert.rejects(manifest(db),/duplicate_paid/);
});
test('restore comparison catches JSON precision loss, target mismatch and source changes',async()=>{
 const source='mysql://u:p@localhost/app',target='mysql://u:p@localhost/app2';
 await assert.rejects(compare(source,'mysql://u:p@127.0.0.1/app'),/schema names must differ/);
 let targetJson='{"id":9007199254740993}',sourceJson='{"id":9007199254740993}',changeSource=false,connections=0,closed=0;
 const hook=mock.method(mariadb,'createConnection',async options=>{connections++;let scans=0;return{end:async()=>{closed++;},query:async sql=>{
  if(sql.startsWith('SELECT TABLE_NAME,ENGINE'))return[{TABLE_NAME:'receipts',ENGINE:'InnoDB',TABLE_COLLATION:'utf8mb4_unicode_ci'}];
  if(sql.startsWith('SHOW CREATE'))return[{'Create Table':'CREATE TABLE receipts(snapshot json)'}];
  if(sql.startsWith('SELECT *')){scans++;const raw=options.database==='app2'?targetJson:changeSource&&scans>1?'{"changed":true}':sourceJson;return[{snapshot:options.jsonStrings?raw:JSON.parse(raw)}];}
  if(sql.includes(' AS n '))return[{n:0}];return[];
 }}});
 try{assert.equal((await compare(source,target)).rows,1);targetJson='{"id":9007199254740992}';await assert.rejects(compare(source,target),/Restored database differs/);targetJson=sourceJson;changeSource=true;await assert.rejects(compare(source,target),/Source changed/);assert.equal(closed,connections);}finally{hook.mock.restore();}
});
