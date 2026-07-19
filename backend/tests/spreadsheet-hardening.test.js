import test from 'node:test';
import assert from 'node:assert/strict';
import { workbookBuffer, parseWorkbook } from '../src/services/integrations.js';

const rows = [
  { name: 'Cotton', quantity: 12, active: true },
  { name: 'Wheat', quantity: 8, active: false },
];

test('ExcelJS XLSX export/import round trip', async () => {
  const buffer = await workbookBuffer(rows, 'Products', 'xlsx');
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  const parsed = await parseWorkbook(buffer);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Cotton');
  assert.equal(Number(parsed[0].quantity), 12);
});

test('ExcelJS CSV export/import round trip', async () => {
  const buffer = await workbookBuffer(rows, 'Products', 'csv');
  assert.ok(Buffer.isBuffer(buffer));
  const parsed = await parseWorkbook(buffer);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].name, 'Wheat');
  assert.equal(Number(parsed[1].quantity), 8);
});
