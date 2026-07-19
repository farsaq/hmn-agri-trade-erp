import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWarehouse,
  parseUnit,
  normalizeName,
  normalizeSymbol,
  WAREHOUSE_SORTS,
  UNIT_SORTS,
} from '../src/validators/warehouseUnit.js';
test('normalizes warehouse and unit identity', () => {
  assert.equal(normalizeName(' Main   Store '), 'main store');
  assert.equal(normalizeSymbol(' KG '), 'kg');
});
test('validates warehouse enterprise fields', () => {
  const x = parseWarehouse({
    name: 'Main Warehouse',
    code: 'MAIN-01',
    type: 'main',
    capacity: '50000',
    capacityUnit: 'kg',
  });
  assert.equal(x.normalizedName, 'main warehouse');
  assert.equal(x.capacity, 50000);
});
test('validates base and derived units', () => {
  assert.equal(
    parseUnit({ name: 'Kilogram', symbol: 'kg', category: 'weight', isBase: true, ratioToBase: 1 }).ratioToBase,
    1,
  );
  assert.throws(
    () => parseUnit({ name: 'Bag', symbol: 'bag', category: 'packaging', isBase: false, ratioToBase: 50 }),
    (e) => e.code === 'UNIT_VALIDATION_ERROR',
  );
});
test('sort whitelists reject arbitrary expressions', () => {
  assert.ok(WAREHOUSE_SORTS.has('capacity'));
  assert.ok(UNIT_SORTS.has('ratioToBase'));
  assert.equal(WAREHOUSE_SORTS.has('$where'), false);
});

test('unit update validation rejects invalid base ratio', () => {
  assert.throws(
    () => parseUnit({ isBase: true, ratioToBase: 2 }, { partial: true }),
    (e) => e.code === 'UNIT_VALIDATION_ERROR',
  );
});
