import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentSchema,
  saleSchema,
  purchaseSchema,
  expenseSchema,
  expenseApprovalSchema,
} from '../src/validators/transactions.js';
import {
  assertPaymentCompatibility,
  assertTransition,
  saleTransitions,
  purchaseTransitions,
} from '../src/services/financialDomain.js';
const id = '507f1f77bcf86cd799439011';
test('draft sale rejects initial payment', () =>
  assert.equal(
    saleSchema.safeParse({
      customer: id,
      warehouse: id,
      status: 'draft',
      payment: 1,
      items: [{ product: id, quantity: 1, rate: 1 }],
    }).success,
    false,
  ));
test('non-received purchase rejects initial payment', () =>
  assert.equal(
    purchaseSchema.safeParse({
      supplier: id,
      warehouse: id,
      status: 'confirmed',
      payment: 1,
      items: [{ product: id, quantity: 1, rate: 1 }],
    }).success,
    false,
  ));
test('customer receipt cannot allocate to purchase', () =>
  assert.throws(
    () =>
      assertPaymentCompatibility({
        direction: 'receipt',
        partyType: 'customer',
        allocations: [{ documentType: 'purchase' }],
      }),
    /Customer receipts/,
  ));
test('supplier payment cannot allocate to sale', () =>
  assert.throws(
    () =>
      assertPaymentCompatibility({
        direction: 'payment',
        partyType: 'supplier',
        allocations: [{ documentType: 'sale' }],
      }),
    /Supplier payments/,
  ));
test('valid receipt allocation schema passes', () =>
  assert.equal(
    paymentSchema.safeParse({
      direction: 'receipt',
      partyType: 'customer',
      party: id,
      amount: 100,
      allocations: [{ documentType: 'sale', document: id, amount: 50 }],
    }).success,
    true,
  ));
test('sale state machine blocks paid to cancelled', () =>
  assert.throws(() => assertTransition(saleTransitions, 'paid', 'cancelled'), /not allowed/));
test('purchase state machine permits draft confirmation', () =>
  assert.doesNotThrow(() => assertTransition(purchaseTransitions, 'draft', 'confirmed')));
test('expense strips unknown fields and validates payee pair', () => {
  const r = expenseSchema.safeParse({ category: 'Fuel', amount: 100, description: 'Fuel purchase', payee: id });
  assert.equal(r.success, false);
});
test('expense rejection requires reason', () =>
  assert.equal(expenseApprovalSchema.safeParse({ status: 'rejected', level: 1 }).success, false));
