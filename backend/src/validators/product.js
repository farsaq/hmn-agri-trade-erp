import { z } from 'zod';
const optionalText = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(300).optional());
const money = z.coerce.number().finite().min(0).optional();
const identity = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
export const normalizeProductName = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
export const normalizeSku = identity;
export const normalizeBarcode = (v) =>
  String(v ?? '')
    .replace(/[^0-9A-Za-z-]/g, '')
    .toUpperCase() || undefined;
const unitSchema = z.object({
  name: z.string().trim().min(1).max(60),
  symbol: z.string().trim().min(1).max(20),
  ratioToBase: z.coerce.number().positive(),
  precision: z.coerce.number().int().min(0).max(6).default(3),
});
const schema = z
  .object({
    name: z.string().trim().min(2).max(160),
    sku: z.string().trim().min(2).max(80),
    barcode: optionalText,
    category: z.enum(['Cotton', 'Wheat', 'DAP', 'Urea', 'Bardana', 'Seeds', 'Pesticides', 'Other']).default('Other'),
    brand: optionalText,
    grade: optionalText,
    quality: optionalText,
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    description: optionalText,
    baseUnit: z.string().trim().min(1).max(30).default('kg'),
    purchaseUnit: z.string().trim().min(1).max(30).default('kg'),
    saleUnit: z.string().trim().min(1).max(30).default('kg'),
    unitConversions: z.array(unitSchema).max(30).default([]),
    decimalPrecision: z.coerce.number().int().min(0).max(6).default(3),
    purchasePrice: money,
    salePrice: money,
    wholesalePrice: money,
    retailPrice: money,
    minimumSalePrice: money,
    maximumDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    costingMethod: z.enum(['weighted-average', 'fifo', 'lifo']).default('weighted-average'),
    tax: z.coerce.number().min(0).max(100).optional(),
    taxProfile: z
      .object({
        name: optionalText,
        rate: z.coerce.number().min(0).max(100).optional(),
        inclusive: z.coerce.boolean().optional(),
      })
      .optional(),
    priceEffectiveFrom: z.coerce.date().optional(),
    openingStock: z.coerce.number().min(0).optional(),
    minimumStock: z.coerce.number().min(0).optional(),
    reorderLevel: z.coerce.number().min(0).optional(),
    supplier: optionalText,
    warehouse: optionalText,
    expiryDate: z.coerce.date().optional(),
    active: z.coerce.boolean().optional(),
  })
  .strict();
export function validateProduct(input, { partial = false } = {}) {
  const parsed = (partial ? schema.partial() : schema).safeParse(input);
  if (!parsed.success) {
    const e = new Error('Product validation failed');
    e.statusCode = 422;
    e.code = 'PRODUCT_VALIDATION_FAILED';
    e.details = parsed.error.flatten();
    throw e;
  }
  const d = parsed.data;
  if (d.minimumSalePrice != null && d.salePrice != null && d.minimumSalePrice > d.salePrice) {
    const e = new Error('Minimum sale price cannot exceed sale price');
    e.statusCode = 422;
    e.code = 'PRODUCT_PRICE_INVALID';
    throw e;
  }
  return d;
}
export function normalizeProductIdentity(data) {
  const out = { ...data };
  if (data.name !== undefined) out.normalizedName = normalizeProductName(data.name);
  if (data.sku !== undefined) out.normalizedSku = normalizeSku(data.sku);
  if (data.barcode !== undefined) out.normalizedBarcode = normalizeBarcode(data.barcode);
  out.unit = out.baseUnit || out.unit;
  out.tags = [...new Set((out.tags || []).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  return out;
}
export const PRODUCT_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'productCode',
  'sku',
  'purchasePrice',
  'salePrice',
  'availableStock',
  'minimumStock',
  'expiryDate',
]);
export function buildProductQuery(q = {}) {
  const query = { isDeleted: q.deleted === 'true' };
  if (q.active !== undefined) query.active = q.active === 'true';
  for (const k of ['category', 'brand', 'supplier']) if (q[k]) query[k] = q[k];
  if (q.tags)
    query.tags = {
      $all: String(q.tags)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    };
  if (q.minPrice || q.maxPrice)
    query.salePrice = {
      ...(q.minPrice && { $gte: Number(q.minPrice) }),
      ...(q.maxPrice && { $lte: Number(q.maxPrice) }),
    };
  if (q.minCost || q.maxCost)
    query.purchasePrice = {
      ...(q.minCost && { $gte: Number(q.minCost) }),
      ...(q.maxCost && { $lte: Number(q.maxCost) }),
    };
  if (q.createdFrom || q.createdTo)
    query.createdAt = {
      ...(q.createdFrom && { $gte: new Date(q.createdFrom) }),
      ...(q.createdTo && { $lte: new Date(q.createdTo) }),
    };
  if (q.expired === 'true') query.expiryDate = { $lt: new Date() };
  if (q.expiringDays) {
    const now = new Date(),
      to = new Date(Date.now() + Number(q.expiringDays) * 86400000);
    query.expiryDate = { $gte: now, $lte: to };
  }
  if (q.lowStock === 'true') query.$expr = { $lte: ['$availableStock', '$minimumStock'] };
  if (q.outOfStock === 'true') query.availableStock = { $lte: 0 };
  if (q.q) {
    const rx = new RegExp(String(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { productCode: rx }, { sku: rx }, { barcode: rx }, { brand: rx }, { category: rx }];
  }
  return query;
}
