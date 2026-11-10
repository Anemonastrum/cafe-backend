import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ruleInput } from '../../src/validators/pricing-rules.validator.js';
const parse = value => {
  const req = { method: 'PATCH', query: {}, params: { id: '1' }, body: { starts_at: value } };
  ruleInput('discounts')(req, {}, () => {});
  return req.input.starts_at;
};
test('discount timestamps reject calendar rollover and UTC dates outside SQL range', () => {
  for (const value of ['2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','2026-04-31T00:00:00Z',
    '0000-01-01T00:00:00Z','0999-12-31T23:59:59Z','1000-01-01T00:00:00+01:00',
    '9999-12-31T23:59:59-01:00','2026-01-01T24:00:00Z']) {
    assert.throws(() => parse(value), { status: 422 }, value);
  }
  for (const [input, expected] of [
    ['2024-02-29T10:30:00+07:00','2024-02-29T03:30:00.000Z'],
    ['1000-01-01T00:00:00Z','1000-01-01T00:00:00.000Z'],
    ['9999-12-31T23:59:59.999Z','9999-12-31T23:59:59.999Z'],
  ]) assert.equal(parse(input).toISOString(), expected);
});
