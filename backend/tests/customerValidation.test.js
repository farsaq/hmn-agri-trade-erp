import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCnic,
  normalizeCnic,
  normalizeEmail,
  normalizePhone,
  parseCustomer,
} from '../src/validators/customer.js';
import { buildCustomerQuery, CUSTOMER_SORTS } from '../src/services/customerService.js';

test('normalizes customer identity fields', () => {
  assert.equal(normalizePhone('+92 300-1234567'), '923001234567');
  assert.equal(normalizeCnic('41304-1234567-1'), '4130412345671');
  assert.equal(normalizeEmail(' Test@Example.COM '), 'test@example.com');
  assert.equal(formatCnic('4130412345671'), '41304-1234567-1');
});
test('validates and strips untrusted customer fields', () => {
  const value = parseCustomer({
    name: 'Ali Ahmed',
    phone: '0300-1234567',
    cnic: '41304-1234567-1',
    email: 'ALI@EXAMPLE.COM',
    creditLimit: '5000',
    currentBalance: 999999,
  });
  assert.equal(value.phone, '03001234567');
  assert.equal(value.cnic, '4130412345671');
  assert.equal(value.email, 'ali@example.com');
  assert.equal(value.creditLimit, 5000);
  assert.equal(value.currentBalance, undefined);
});
test('rejects invalid customer identity', () => {
  assert.throws(() => parseCustomer({ name: 'A', phone: '12' }));
  assert.throws(() => parseCustomer({ name: 'Ali', phone: '03001234567', cnic: '123' }));
  assert.throws(() => parseCustomer({ name: 'Ali', phone: '03001234567', email: 'bad' }));
});
test('builds enterprise filters and enforces sort whitelist', () => {
  const q = buildCustomerQuery({
    village: 'Hala',
    district: 'Matiari',
    minBalance: '100',
    maxBalance: '500',
    creditExceeded: 'true',
    dateFrom: '2026-01-01',
  });
  assert.equal(q.isDeleted, false);
  assert.equal(q.village, 'Hala');
  assert.deepEqual(q.currentBalance, { $gte: 100, $lte: 500 });
  assert.ok(q.$expr);
  assert.ok(CUSTOMER_SORTS.has('-currentBalance'));
  assert.equal(CUSTOMER_SORTS.has('$where'), false);
});
