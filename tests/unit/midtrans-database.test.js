import test from 'node:test';
import assert from 'node:assert/strict';
import { midtransDatabaseConfig } from '../support/midtrans-database.js';
import { testDatabaseConfig } from '../support/database.js';

import { inspect } from 'node:util';

test('malformed private database URLs cannot leak input through errors', () => {
  for (const url of ['mysql://fixture:synthetic-password@[broken/app_midtrans_test', 'mysql://fixture:synthetic-password@10.10.10.9/%ZZ']) {
    assert.throws(() => midtransDatabaseConfig({ MIDTRANS_TEST_DATABASE_URL: url }), error => {
      assert.equal(inspect(error).includes('synthetic-password'), false);
      assert.equal(error.input, undefined);
      assert.equal(error.cause, undefined);
      return error.message === 'Unauthorized Midtrans test database';
    });
  }
});

const target = '10.10.10.9:3306/app_midtrans_test';
const databaseUrl = 'mysql://fixture:fake@10.10.10.9:3306/app_midtrans_test';
test('explicit isolated-schema selection never falls back to historical database', () => {
  const before = { ...process.env };
  try {
    process.env.MIDTRANS_TEST_DATABASE_URL = databaseUrl;
    process.env.MIDTRANS_TEST_DATABASE_TARGET = target;
    assert.equal(testDatabaseConfig().databaseUrl, databaseUrl);
    process.env.MIDTRANS_TEST_DATABASE_URL = 'mysql://fixture:fake@10.10.10.9/app';
    assert.throws(() => testDatabaseConfig(), /Unauthorized Midtrans/);
  } finally { process.env = before; }
});
test('Midtrans fixture guard rejects different host/schema/protocol/options and missing acknowledgement', () => {
  for (const url of [databaseUrl.replace('app_midtrans_test', 'app'), databaseUrl.replace('10.10.10.9', 'localhost'), databaseUrl.replace('mysql:', 'http:'), databaseUrl + '?tls=false', databaseUrl + '#x']) {
    assert.throws(() => midtransDatabaseConfig({ MIDTRANS_TEST_DATABASE_URL: url, MIDTRANS_TEST_DATABASE_TARGET: target }));
  }
  assert.throws(() => midtransDatabaseConfig({ MIDTRANS_TEST_DATABASE_URL: databaseUrl }));
});
