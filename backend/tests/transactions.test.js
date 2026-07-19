import test from 'node:test';
import assert from 'node:assert/strict';
import { saleSchema, purchaseSchema, paymentSchema } from '../src/validators/transactions.js';
import { resolveUnit, totals } from '../src/services/transactionService.js';
test('sale validation rejects empty items', () =>
  assert.equal(
    saleSchema.safeParse({ customer: '507f1f77bcf86cd799439011', warehouse: '507f1f77bcf86cd799439011', items: [] })
      .success,
    false,
  ));
test('purchase validation requires warehouse', () =>
  assert.equal(
    purchaseSchema.safeParse({
      supplier: '507f1f77bcf86cd799439011',
      items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, rate: 1 }],
    }).success,
    false,
  ));
test('payment schema accepts unallocated advance', () =>
  assert.equal(
    paymentSchema.safeParse({
      direction: 'receipt',
      partyType: 'customer',
      party: '507f1f77bcf86cd799439011',
      amount: 100,
      allocations: [],
    }).success,
    true,
  ));
test('product unit override converts to base quantity', () =>
  assert.equal(resolveUnit({ baseUnit: 'kg', unitConversions: [{ symbol: 'bag', ratioToBase: 50 }] }, 'bag', 2), 100));
test('financial totals calculate tax and remaining', () => {
  const x = totals({ discount: 10, transport: 5, taxRate: 10, payment: 20 }, [{ amount: 100 }]);
  assert.equal(x.total, 104.5);
  assert.equal(x.remaining, 84.5);
});
