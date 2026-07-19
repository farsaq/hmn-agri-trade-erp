import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journalCreateSchema } from '../src/validation/accounting.js';
import { assertBalanced } from '../src/services/postingEngine.js';

test('enterprise journal schema accepts balanced foreign-currency draft', () => {
  const id = '64b000000000000000000001';
  const parsed = journalCreateSchema.parse({
    narration: 'Foreign currency adjustment',
    currency: 'USD',
    baseCurrency: 'PKR',
    exchangeRate: 278.5,
    lines: [
      { account: id, debit: 27850, credit: 0 },
      { account: '64b000000000000000000002', debit: 0, credit: 27850 },
    ],
  });
  assert.equal(parsed.exchangeRate, 278.5);
});
test('posting precision rejects an imbalanced journal', () =>
  assert.throws(
    () =>
      assertBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 99.99 },
      ]),
    /not balanced/i,
  ));
test('accounting enterprise routes include workflow and exports', () => {
  const routes = fs.readFileSync(new URL('../src/routes/accounting.js', import.meta.url), 'utf8');
  for (const endpoint of [
    '/submit',
    '/approve',
    '/reject',
    '/post',
    '/timeline',
    'statement.pdf',
    'export.xlsx',
    'fiscal-years',
    'periods',
  ])
    assert.ok(routes.includes(endpoint), endpoint);
});
test('accounting UI route is registered', () => {
  const app = fs.readFileSync(new URL('../../frontend/src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('/admin/accounting'));
});
