import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRatios, groupByType, statementRowsForExport } from '../src/services/financialStatements.js';

test('groups accounts by financial statement type', () => {
  const grouped = groupByType([
    { type: 'asset', balance: 10 },
    { type: 'income', balance: 20 },
  ]);
  assert.equal(grouped.asset.length, 1);
  assert.equal(grouped.income.length, 1);
  assert.equal(grouped.expense.length, 0);
});

test('calculates financial ratios safely', () => {
  const ratios = calculateRatios({
    assets: [
      { code: '1100', subtype: 'cash', balance: 100 },
      { code: '1500', balance: 100 },
    ],
    liabilities: [{ code: '2100', subtype: 'accounts-payable', balance: 50 }],
    equity: [{ balance: 150 }],
    income: [{ balance: 200 }],
    expenses: [{ balance: 100 }],
  });
  assert.equal(ratios.currentRatio, 2);
  assert.equal(ratios.netProfit, 100);
  assert.equal(ratios.netProfitMargin, 50);
});

test('builds export rows for statements', () => {
  const rows = statementRowsForExport({ assets: [{ code: '1100', name: 'Cash', balance: 50 }] });
  assert.equal(rows[0][0], 'Assets');
  assert.equal(rows[1][0], '1100');
});

test('financial statement routes are registered', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/routes/accounting.js', import.meta.url), 'utf8'),
  );
  for (const route of ['trial-balance', 'profit-loss', 'balance-sheet', 'cash-flow', 'comparative'])
    assert.match(source, new RegExp(route));
});
