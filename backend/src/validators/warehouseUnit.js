import { z } from 'zod';
const clean = (v) => (typeof v === 'string' ? v.trim() : v);
export const normalizeName = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
export const normalizeSymbol = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB id');
const assignedUser = z.object({ user: objectId, permissions: z.array(z.string().trim()).default([]) });
const warehouseFields = {
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(['main', 'branch', 'distribution', 'cold-storage', 'transit', 'returns', 'other']),
  address: z.string().trim().max(500),
  city: z.string().trim().max(100),
  district: z.string().trim().max(100),
  province: z.string().trim().max(100),
  postalCode: z.string().trim().max(20),
  managerName: z.string().trim().max(120),
  managerPhone: z.string().trim().max(30),
  managerEmail: z.string().email().or(z.literal('')),
  capacity: z.coerce.number().min(0),
  capacityUnit: z.string().trim().max(20),
  isDefault: z.coerce.boolean(),
  active: z.coerce.boolean(),
  assignedUsers: z.array(assignedUser),
};
const warehouseCreate = z
  .object({
    name: warehouseFields.name,
    code: warehouseFields.code,
    type: warehouseFields.type.default('branch'),
    address: warehouseFields.address.optional(),
    city: warehouseFields.city.optional(),
    district: warehouseFields.district.optional(),
    province: warehouseFields.province.optional(),
    postalCode: warehouseFields.postalCode.optional(),
    managerName: warehouseFields.managerName.optional(),
    managerPhone: warehouseFields.managerPhone.optional(),
    managerEmail: warehouseFields.managerEmail.optional(),
    capacity: warehouseFields.capacity.default(0),
    capacityUnit: warehouseFields.capacityUnit.default('kg'),
    isDefault: warehouseFields.isDefault.default(false),
    active: warehouseFields.active.default(true),
    assignedUsers: warehouseFields.assignedUsers.default([]),
  })
  .strict();
const warehouseUpdate = z
  .object(Object.fromEntries(Object.entries(warehouseFields).map(([k, v]) => [k, v.optional()])))
  .strict();
const unitFields = {
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(20),
  category: z.enum(['weight', 'quantity', 'volume', 'length', 'packaging']),
  isBase: z.coerce.boolean(),
  baseUnit: objectId.nullable(),
  ratioToBase: z.coerce.number().positive(),
  decimalPrecision: z.coerce.number().int().min(0).max(6),
  system: z.coerce.boolean(),
  active: z.coerce.boolean(),
};
const refineUnit = (schema, partial) =>
  schema.superRefine((v, ctx) => {
    if (v.isBase === true && v.baseUnit)
      ctx.addIssue({ code: 'custom', path: ['baseUnit'], message: 'Base unit cannot reference another base unit' });
    if (!partial && v.isBase === false && !v.baseUnit)
      ctx.addIssue({ code: 'custom', path: ['baseUnit'], message: 'Derived unit requires a base unit' });
    if (v.isBase === true && v.ratioToBase !== undefined && v.ratioToBase !== 1)
      ctx.addIssue({ code: 'custom', path: ['ratioToBase'], message: 'Base unit ratio must equal 1' });
  });
const unitCreate = refineUnit(
  z
    .object({
      name: unitFields.name,
      symbol: unitFields.symbol,
      category: unitFields.category,
      isBase: unitFields.isBase.default(false),
      baseUnit: unitFields.baseUnit.optional(),
      ratioToBase: unitFields.ratioToBase.default(1),
      decimalPrecision: unitFields.decimalPrecision.default(3),
      system: unitFields.system.default(false),
      active: unitFields.active.default(true),
    })
    .strict(),
  false,
);
const unitUpdate = refineUnit(
  z.object(Object.fromEntries(Object.entries(unitFields).map(([k, v]) => [k, v.optional()]))).strict(),
  true,
);
function parse(schema, input, code) {
  const result = schema.safeParse(Object.fromEntries(Object.entries(input || {}).map(([k, v]) => [k, clean(v)])));
  if (!result.success) {
    const e = new Error(result.error.issues.map((x) => `${x.path.join('.') || 'payload'}: ${x.message}`).join('; '));
    e.statusCode = 422;
    e.code = code;
    e.details = result.error.flatten();
    throw e;
  }
  return result.data;
}
export function parseWarehouse(input, { partial = false } = {}) {
  const x = parse(partial ? warehouseUpdate : warehouseCreate, input, 'WAREHOUSE_VALIDATION_ERROR');
  if (x.name) x.normalizedName = normalizeName(x.name);
  if (x.managerEmail) x.managerEmail = x.managerEmail.toLowerCase();
  return x;
}
export function parseUnit(input, { partial = false } = {}) {
  const x = parse(partial ? unitUpdate : unitCreate, input, 'UNIT_VALIDATION_ERROR');
  if (x.name) x.normalizedName = normalizeName(x.name);
  if (x.symbol) x.normalizedSymbol = normalizeSymbol(x.symbol);
  return x;
}
export const WAREHOUSE_SORTS = new Set([
  'name',
  'code',
  'warehouseCode',
  'type',
  'city',
  'district',
  'capacity',
  'currentUtilization',
  'createdAt',
  'updatedAt',
]);
export const UNIT_SORTS = new Set(['name', 'symbol', 'unitCode', 'category', 'ratioToBase', 'createdAt']);
