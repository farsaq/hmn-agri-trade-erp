import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLowStockRows } from '../src/services/warehouseReportUtils.js';
test('low stock aggregates multiple batches before threshold comparison', () => {
  const product = { _id: 'p1', minimumStock: 50, name: 'Cotton' };
  const rows = aggregateLowStockRows([
    { product, quantity: 30, reserved: 0 },
    { product, quantity: 30, reserved: 0 },
  ]);
  assert.equal(rows.length, 0);
});
test('low stock returns aggregated product when total is below threshold', () => {
  const product = { _id: 'p1', minimumStock: 50, name: 'Cotton' };
  const rows = aggregateLowStockRows([
    { product, quantity: 20, reserved: 2 },
    { product, quantity: 20, reserved: 3 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 40);
  assert.equal(rows[0].available, 35);
});
