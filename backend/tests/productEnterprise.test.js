import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProduct,
  normalizeProductIdentity,
  buildProductQuery,
  PRODUCT_SORT_FIELDS,
} from '../src/validators/product.js';
test('normalizes product identity and units', () => {
  const x = normalizeProductIdentity(
    validateProduct({
      name: '  Urea Bag ',
      sku: ' ur-01 ',
      barcode: ' 123 45 ',
      baseUnit: 'kg',
      purchaseUnit: 'bag',
      saleUnit: 'bag',
      unitConversions: [{ name: 'Bag', symbol: 'bag', ratioToBase: 50, precision: 2 }],
      salePrice: 5000,
      minimumSalePrice: 4500,
    }),
  );
  assert.equal(x.normalizedName, 'urea bag');
  assert.equal(x.normalizedSku, 'UR-01');
  assert.equal(x.normalizedBarcode, '12345');
  assert.equal(x.unit, 'kg');
});
test('rejects invalid price policy', () =>
  assert.throws(
    () => validateProduct({ name: 'Urea', sku: 'U-1', salePrice: 100, minimumSalePrice: 120 }),
    (e) => e.code === 'PRODUCT_PRICE_INVALID',
  ));
test('builds product filters and sort whitelist', () => {
  const q = buildProductQuery({ q: 'urea', lowStock: 'true', category: 'Urea' });
  assert.equal(q.category, 'Urea');
  assert.ok(q.$expr);
  assert.ok(q.$or);
  assert.ok(PRODUCT_SORT_FIELDS.has('salePrice'));
});
