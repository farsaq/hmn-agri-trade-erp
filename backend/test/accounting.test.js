import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBalanced } from '../src/services/postingEngine.js';
import { accountCreateSchema, journalCreateSchema } from '../src/validation/accounting.js';
test('balanced journal is accepted', () =>
  assert.deepEqual(
    assertBalanced([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ]),
    { totalDebit: 100, totalCredit: 100 },
  ));
test('unbalanced journal is rejected', () =>
  assert.throws(
    () =>
      assertBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 90 },
      ]),
    /not balanced/i,
  ));
test('account validation requires valid type', () =>
  assert.equal(accountCreateSchema.safeParse({ code: '1000', name: 'Cash', type: 'asset' }).success, true));
test('journal validation requires debit-credit lines', () =>
  assert.equal(
    journalCreateSchema.safeParse({
      narration: 'Opening entry',
      lines: [
        { account: '507f1f77bcf86cd799439011', debit: 100, credit: 0 },
        { account: '507f1f77bcf86cd799439012', debit: 0, credit: 100 },
      ],
    }).success,
    true,
  ));
