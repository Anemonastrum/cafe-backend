import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const migrationPath = 'prisma/migrations/20261109000000_initial/migration.sql';
assert.ok(existsSync('prisma/schema.prisma'), 'Prisma schema must exist');
assert.ok(existsSync(migrationPath), 'Initial migration must exist');
const migration = readFileSync(migrationPath, 'utf8');
const baselineSchema = 'tests/fixtures/initial-schema.prisma';
const schema = readFileSync(baselineSchema, 'utf8');
const uncomment = text => text.replace(/^\s*--.*$/gm, '');
const normalize = text => text.replace(/`/g, '').replace(/\s+/g, '').toLowerCase();
const tables = text => new Map([...uncomment(text).matchAll(/CREATE TABLE\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*(?:ENGINE|DEFAULT CHARACTER SET)/g)].map(([, name, body]) => [name, body]));
const sourceTables = tables(migration);
assert.equal(sourceTables.size, 28);
assert.equal([...schema.matchAll(/^model /gm)].length, 28);
assert.equal([...migration.matchAll(/CONSTRAINT \w+ CHECK/g)].length, 20);
assert.equal([...migration.matchAll(/FOREIGN KEY/g)].length, 41);
assert.equal([...migration.matchAll(/ON UPDATE CURRENT_TIMESTAMP\(3\)/g)].length, 10);
assert.ok(!/\b(?:CREATE DATABASE|USE\s+\w+|DROP TABLE|TRUNCATE)\b/i.test(uncomment(migration)));
assert.equal([...migration.matchAll(/ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;/g)].length, 28);
assert.equal([...migration.matchAll(/^INSERT INTO /gm)].length, 3);

// ponytail: parser covers this migration's DDL, not arbitrary SQL; use DB introspection if syntax grows.
const generated = execFileSync('node_modules/.bin/prisma', ['migrate', 'diff', '--from-empty', '--to-schema', baselineSchema, '--script'], { encoding: 'utf8' });
const generatedTables = tables(generated);
assert.deepEqual([...generatedTables.keys()].sort(), [...sourceTables.keys()].sort());
const columns = body => new Map(body.split('\n').map(line => line.trim().replace(/,$/, '')).filter(line => /^`?\w+`?\s+(?:BIGINT|TINYINT|SMALLINT|INT|VARCHAR|CHAR|TEXT|DATETIME|DECIMAL|ENUM|JSON)\b/i.test(line)).map(line => {
  const [, name, rest] = line.match(/^`?(\w+)`?\s+(.*)$/);
  // MySQL aliases BOOLEAN to TINYINT(1); Prisma explicitly writes NULL DEFAULT NULL for nullable columns.
  return [name, normalize(rest.replace(/ON UPDATE CURRENT_TIMESTAMP\(3\)/i, '').replace(/DEFAULT NULL/i, '').replace(/(?<!NOT )\bNULL\b/i, '').replace(/\bINTEGER\b/gi, 'INT'))];
}));
for (const [name, body] of sourceTables) {
  const expected = columns(body);
  const actual = columns(generatedTables.get(name).replace(/\bBOOLEAN\b/g, 'TINYINT(1)').replace(/\bINTEGER\b/g, 'INT').replace(/DEFAULT true/g, 'DEFAULT 1').replace(/DEFAULT false/g, 'DEFAULT 0'));
  assert.deepEqual(actual, expected, `${name}: columns/types/defaults/nullability must match`);
  const keys = [...body.matchAll(/(?:UNIQUE KEY|KEY) (\w+)\s*\(([^)]+)\)/g)];
  for (const [, key, fields] of keys) {
    const match = generatedTables.get(name).match(new RegExp('(?:UNIQUE INDEX|INDEX) `?' + key + '`?\\s*\\(([^)]+)\\)'));
    assert.ok(match, `${name}: missing index ${key}`);
    assert.equal(normalize(match[1]), normalize(fields), `${key}: index columns`);
    assert.equal(body.includes(`UNIQUE KEY ${key} (`), generatedTables.get(name).includes(`UNIQUE INDEX \`${key}\``), `${key}: uniqueness`);
  }
  const primary = body.match(/PRIMARY KEY\s*\(([^)]+)\)/)[1];
  assert.equal(normalize(generatedTables.get(name).match(/PRIMARY KEY\s*\(([^)]+)\)/)[1]), normalize(primary));
}
for (const [, name, fields, target, refs, action] of migration.matchAll(/CONSTRAINT (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\) ON DELETE (CASCADE|RESTRICT|SET NULL)/g)) {
  const pattern = new RegExp('CONSTRAINT `?' + name + '`? FOREIGN KEY \\(([^)]+)\\) REFERENCES `?(\\w+)`?\\(([^)]+)\\) ON DELETE (CASCADE|RESTRICT|SET NULL) ON UPDATE (\\w+)');
  const match = generated.match(pattern);
  assert.ok(match, `Missing relation ${name}`);
  assert.deepEqual(match.slice(1).map(normalize), [fields, target, refs, action, 'RESTRICT'].map(normalize), name);
}
if (existsSync('notes/db.sql')) {
  const source = readFileSync('notes/db.sql', 'utf8')
    .replace(/CREATE DATABASE IF NOT EXISTS cafe_pos\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\s*USE cafe_pos;\s*/, '')
    .replaceAll(') ENGINE=InnoDB;', ') ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  assert.equal(migration, source, 'Migration must preserve source SQL except database selection and explicit table charset');
}
console.log('Schema parity passed: 28 tables, 41 foreign keys, 20 CHECK constraints; SQL-only guarantees and seed data retained.');
