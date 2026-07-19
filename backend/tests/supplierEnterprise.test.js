import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSupplier, normalizePhone, normalizeNtn } from '../src/validators/supplier.js';
import { buildSupplierQuery, SUPPLIER_SORTS } from '../src/services/supplierService.js';
test('normalizes supplier identity', () => {
  assert.equal(normalizePhone('+92 300-1234567'), '923001234567');
  assert.equal(normalizeNtn('1234567-8'), '12345678');
});
test('validates supplier payload', () => {
  const x = parseSupplier({ name: 'ABC Traders', phone: '03001234567', email: 'A@B.COM', openingBalance: '100' });
  assert.equal(x.email, 'a@b.com');
  assert.equal(x.openingBalance, 100);
});
test('builds supplier filters and protects sort list', () => {
  const q = buildSupplierQuery({ village: 'Hala', minBalance: '10', tags: 'seed,priority' });
  assert.equal(q.village, 'Hala');
  assert.equal(q.currentBalance.$gte, 10);
  assert.deepEqual(q.tags.$all, ['seed', 'priority']);
  assert.equal(SUPPLIER_SORTS.has('-currentBalance'), true);
});
