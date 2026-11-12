// Read-only comparison. URLs must come from private environment, never CLI arguments.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mariadb from 'mariadb';
import { pathToFileURL } from 'node:url';
const quote=name=>'`'+name.replaceAll('`','``')+'`';
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
export function connectionOptions(value){
 const u=new URL(value),database=decodeURIComponent(u.pathname.slice(1));
 assert.ok(u.protocol==='mysql:'&&u.hostname&&u.username&&/^[A-Za-z0-9_]+$/.test(database)&&!u.search&&!u.hash,'Invalid database URL');
 return{host:u.hostname,port:Number(u.port||3306),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database,timezone:'+00:00',dateStrings:true,bigIntAsNumber:false,decimalAsNumber:false,jsonStrings:true};
}
export async function manifest(c){
 const tables=await c.query('SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
 assert.ok(tables.length,'Empty schema');const result={tables:[],migrations:[],financial:{}};
 for(const t of tables){
  assert.equal(t.ENGINE,'InnoDB');const name=t.TABLE_NAME,ddl=(await c.query('SHOW CREATE TABLE '+quote(name)))[0]['Create Table'];
  // ponytail: rehearsal fits memory; stream ordered row hashes before large production datasets.
  const rows=await c.query('SELECT * FROM '+quote(name));
  const hashes=rows.map(row=>createHash('sha256').update(json(row)).digest('hex')).sort();
  result.tables.push({name,engine:t.ENGINE,collation:t.TABLE_COLLATION,rows:rows.length,schema_sha256:createHash('sha256').update(ddl).digest('hex'),data_sha256:createHash('sha256').update(hashes.join('\n')).digest('hex')});
 }
 result.migrations=Array.from(await c.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name'));
 const checks={
  duplicate_paid:'SELECT COUNT(*) AS n FROM (SELECT order_id FROM payments WHERE status=\'paid\' GROUP BY order_id HAVING COUNT(*)>1) x',
  paid_without_receipt:"SELECT COUNT(*) AS n FROM payments p LEFT JOIN receipts r ON r.payment_id=p.id WHERE p.status='paid' AND r.id IS NULL",
  receipt_without_paid:"SELECT COUNT(*) AS n FROM receipts r LEFT JOIN payments p ON p.id=r.payment_id WHERE p.id IS NULL OR p.status<>'paid'",
  paid_order_mismatch:"SELECT COUNT(*) AS n FROM orders o LEFT JOIN payments p ON p.order_id=o.id AND p.status='paid' WHERE (o.payment_status='paid' AND p.id IS NULL) OR (p.id IS NOT NULL AND (o.payment_status<>'paid' OR o.grand_total<>p.amount))",
 };
 for(const [name,sql] of Object.entries(checks)){const n=String((await c.query(sql))[0].n);assert.equal(n,'0',name);result.financial[name]=n;}
 result.financial.totals=Array.from(await c.query("SELECT status,COUNT(*) AS transactions,COALESCE(SUM(amount),0) AS amount FROM payments GROUP BY status ORDER BY status"));
 result.constraints=Array.from(await c.query('SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME'));
 return result;
}
export async function compare(sourceUrl,targetUrl){
 const source=connectionOptions(sourceUrl),target=connectionOptions(targetUrl);
 assert.ok(source.database!==target.database,'Source and target schema names must differ');
 const a=await mariadb.createConnection(source);let b;
 try{b=await mariadb.createConnection(target);const before=await manifest(a),restored=await manifest(b),after=await manifest(a);assert.deepEqual(after,before,'Source changed during verification');assert.deepEqual(restored,before,'Restored database differs');return{tables:before.tables.length,rows:before.tables.reduce((n,t)=>n+t.rows,0),migrations:before.migrations.length,constraints:before.constraints.length,financial:before.financial,manifest_sha256:createHash('sha256').update(json(before)).digest('hex')};}finally{await b?.end();await a.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assert.equal(process.argv.length,2,'No CLI credentials');const result=await compare(process.env.RESTORE_SOURCE_URL,process.env.RESTORE_TARGET_URL);console.log(json(result));}catch{console.error('Restore verification failed; inspect private evidence and target identity');process.exitCode=1;}
}
