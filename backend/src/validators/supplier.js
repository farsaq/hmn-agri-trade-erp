import { z } from 'zod';
export const normalizePhone = (v) => String(v ?? '').replace(/\D/g, '');
export const normalizeCnic = (v) => String(v ?? '').replace(/\D/g, '');
export const normalizeNtn = (v) =>
  String(v ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
export const normalizeEmail = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
export const formatCnic = (v) => {
  const x = normalizeCnic(v);
  return x.length === 13 ? `${x.slice(0, 5)}-${x.slice(5, 12)}-${x.slice(12)}` : x;
};
const text = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(500).optional());
const base = z.object({
  name: z.string().trim().min(2).max(160),
  company: text,
  phone: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .transform(normalizePhone)
      .refine((v) => /^\d{10,15}$/.test(v), 'Phone must contain 10 to 15 digits')
      .optional(),
  ),
  email: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().email().max(254).transform(normalizeEmail).optional(),
  ),
  cnic: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .transform(normalizeCnic)
      .refine((v) => /^\d{13}$/.test(v), 'CNIC must contain 13 digits')
      .optional(),
  ),
  ntn: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .transform(normalizeNtn)
      .refine((v) => v.length >= 7 && v.length <= 15, 'Invalid NTN')
      .optional(),
  ),
  supplierType: z.enum(['local', 'international']).default('local'),
  businessType: text,
  category: text,
  tags: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : v,
    z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ),
  village: text,
  taluka: text,
  district: text,
  city: text,
  province: text,
  country: text,
  address: text,
  openingBalance: z.coerce.number().finite().default(0),
  creditLimit: z.coerce.number().finite().min(0).default(0),
  status: z.enum(['active', 'inactive', 'blocked']).default('active'),
  registrationDate: z.coerce.date().optional(),
  paymentTerms: text,
  dueDays: z.coerce.number().int().min(0).max(3650).default(0),
  notes: text,
  reference: text,
});
export const createSupplierSchema = base;
export const updateSupplierSchema = base.partial();
export const parseSupplier = (payload, { partial = false } = {}) =>
  (partial ? updateSupplierSchema : createSupplierSchema).parse(payload);
