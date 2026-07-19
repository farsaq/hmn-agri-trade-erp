import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('warehouse and unit enterprise routes are registered', () => {
  const src = fs.readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  for (const route of [
    '/warehouses-deleted',
    '/warehouses/:id/restore',
    '/warehouses/:id/timeline',
    '/warehouses/:id/low-stock',
    '/warehouses/:id/report.pdf',
    '/units-deleted',
    '/units/seed-defaults',
    '/units/convert',
    '/units/conversion-audit',
    '/units/:id',
    '/units/:id/restore',
  ])
    assert.ok(src.includes(route), route);
});

test('warehouse routes enforce warehouse-level access', () => {
  const src = fs.readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  assert.ok(src.includes("requireWarehouseAccess('view')"));
  assert.ok(src.includes("requireWarehouseAccess('update')"));
  assert.ok(src.includes("requireWarehouseAccess('delete')"));
});

test('inventory operations enforce warehouse scope', () => {
  const src = fs.readFileSync(new URL('../src/routes/operations.js', import.meta.url), 'utf8');
  for (const token of ['attachWarehouseScope', 'requireWarehouseBodyAccess', 'requireWarehouseResourceAccess'])
    assert.ok(src.includes(token), token);
});
