import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { withDatabase } from '../support/database.js';
import { startApp, request } from '../support/http.js';
import { loadConfig } from '../../src/configs/env.js';
import { toWire } from '../../src/utils/serialize.js';
import { withWriteTx } from '../../src/utils/transaction.js';
import { lockCafe } from '../../src/models/lock.model.js';

test('real adapter, completed migration, protected readiness and SQL constraints', async () => withDatabase(async db => {
  const version = await db.$queryRaw`SELECT VERSION() AS version, DATABASE() AS db`;
  assert.match(version[0].version, /MariaDB/); assert.equal(version[0].db, 'app');
  console.log(`DB engine: ${version[0].version}`);
  const tables = await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME != '_prisma_migrations'`;
  assert.equal(tables.length, 28);
  const migrations = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
  assert.ok(migrations.some(x => x.migration_name === '20261109000000_initial' && x.finished_at && !x.rolled_back_at));
  assert.equal((await db.cafe_settings.findUnique({ where: { id: 1 } })).currency, 'IDR');
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL,
    ALLOWED_ORIGIN: 'http://localhost:5173', CSRF_KEY: 'c'.repeat(32), READINESS_SECRET: 'r'.repeat(32) });
  const h = await startApp({ db, config });
  try { assert.equal((await request(h, { path: '/ready', headers: { 'X-Readiness-Key': config.readinessSecret } })).status, 200); }
  finally { await h.close(); }
  const beforeProducts = await db.products.count();
  const rollback = new Error('rollback fixture');
  await assert.rejects(withWriteTx(db, async tx => {
    const locked = await lockCafe(tx); assert.equal(locked.id, 1);
    const isolation = await tx.$queryRaw`SELECT @@tx_isolation AS isolation`;
    console.log(`Session default isolation (not per-transaction override): ${isolation[0].isolation}`);
    const cat = await tx.categories.create({ data: { name: `test-${randomUUID()}` } });
    const item = await tx.products.create({ data: { category_id: cat.id, name: 'Fixture', base_price: '25000.00' } });
    assert.equal(toWire(item).base_price, '25000.00'); assert.equal(typeof item.id, 'bigint');
    assert.ok(item.created_at instanceof Date);
    await assert.rejects(tx.products.create({ data: { category_id: cat.id, name: 'Negative', base_price: '-1.00' } }));
    await assert.rejects(tx.products.create({ data: { category_id: 18446744073709551615n, name: 'Bad FK', base_price: '1.00' } }));
    const later = await tx.$queryRaw`SELECT SLEEP(0.02)`;
    assert.ok(later);
    const updated = await tx.products.update({ where: { id: item.id }, data: { name: 'Changed' } });
    assert.ok(updated.updated_at.getTime() > item.updated_at.getTime());
    await tx.products.create({ data: { category_id: cat.id, name: 'Second null SKU', base_price: '0.00' } });
    throw rollback;
  }), e => e === rollback);
  assert.equal(await db.products.count(), beforeProducts);
}));

test('live DDL retains checks, foreign keys, native types and collation', async () => withDatabase(async db => {
  const checks = await db.$queryRaw`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK'`;
  const names = checks.map(x => x.CONSTRAINT_NAME);
  for (const name of ['chk_orders_totals','chk_products_base_price','chk_payments_cash','chk_single_cafe']) assert.ok(names.includes(name));
  assert.equal(names.filter(x => x.startsWith('chk_')).length, 20);
  const fks = await db.$queryRaw`SELECT UPDATE_RULE, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()`;
  assert.equal(fks.length, 41); assert.ok(fks.every(x => x.UPDATE_RULE === 'RESTRICT'));
  const columns = await db.$queryRaw`SELECT COLUMN_NAME,COLUMN_TYPE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products'`;
  assert.match(columns.find(x=>x.COLUMN_NAME==='id').COLUMN_TYPE,/bigint.*unsigned/i);
  assert.match(columns.find(x=>x.COLUMN_NAME==='base_price').COLUMN_TYPE,/decimal\(14,2\)/i);
  assert.match(columns.find(x=>x.COLUMN_NAME==='updated_at').EXTRA,/on update current_timestamp/i);
  const tables = await db.$queryRaw`SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME != '_prisma_migrations'`;
  assert.ok(tables.every(x=>x.ENGINE==='InnoDB' && x.TABLE_COLLATION==='utf8mb4_unicode_ci'));
}));
