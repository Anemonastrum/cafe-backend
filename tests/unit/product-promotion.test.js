import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promoActive } from '../../src/validators/products.validator.js';
test('promotion starts inclusive and ends exclusive without treating zero price as absent', () => {
  const row = { promo_price: '0.00', promo_starts_at: new Date('2026-01-01T00:00:00Z'), promo_ends_at: new Date('2026-01-02T00:00:00Z') };
  assert.equal(promoActive(row, new Date('2025-12-31T23:59:59.999Z')), false);
  assert.equal(promoActive(row, row.promo_starts_at), true);
  assert.equal(promoActive(row, new Date('2026-01-01T23:59:59.999Z')), true);
  assert.equal(promoActive(row, row.promo_ends_at), false);
  assert.equal(promoActive({ promo_price: null }), false);
});
