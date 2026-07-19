import { Counter, Product } from '../models/index.js';
export const n = (v) => Number(v || 0);
export async function nextSequence(key, prefix, { session } = {}) {
  const row = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { $setOnInsert: { seq: 0 }, new: true, upsert: true, session },
  );
  return `${prefix}-${new Date().getFullYear()}-${String(row.seq).padStart(6, '0')}`;
}
export function resolveUnit(product, unit, quantity) {
  const q = n(quantity);
  const target = String(unit || product.baseUnit || product.unit || '').toLowerCase();
  const base = String(product.baseUnit || product.unit || '').toLowerCase();
  if (target === base) return q;
  const c = (product.unitConversions || []).find(
    (x) => String(x.symbol).toLowerCase() === target || String(x.name).toLowerCase() === target,
  );
  if (!c)
    throw Object.assign(new Error(`Invalid unit ${unit} for ${product.name}`), {
      statusCode: 422,
      code: 'PRODUCT_UNIT_INVALID',
    });
  return q * n(c.ratioToBase);
}
export async function hydrateLines(items, { session } = {}) {
  const out = [];
  for (const raw of items) {
    const product = await Product.findById(raw.product).session(session || null);
    if (!product || product.isDeleted || !product.active)
      throw Object.assign(new Error('Product not available'), { statusCode: 422, code: 'PRODUCT_NOT_AVAILABLE' });
    const baseQuantity = resolveUnit(product, raw.unit, raw.quantity);
    out.push({
      ...raw,
      name: product.name,
      unit: raw.unit || product.saleUnit || product.baseUnit,
      baseQuantity,
      amount: n(raw.quantity) * n(raw.rate),
      productDoc: product,
    });
  }
  return out;
}
export function totals(data, items) {
  const subtotal = items.reduce((a, x) => a + n(x.amount), 0),
    discount = n(data.discount),
    freight = n(data.transport) + n(data.expenses),
    taxable = Math.max(0, subtotal - discount + freight),
    tax = (taxable * n(data.taxRate)) / 100,
    total = taxable + tax;
  return {
    subtotal,
    discount,
    transport: n(data.transport),
    expenses: n(data.expenses),
    tax,
    total,
    grandTotal: total,
    payment: n(data.payment),
    remaining: Math.max(0, total - n(data.payment)),
  };
}
