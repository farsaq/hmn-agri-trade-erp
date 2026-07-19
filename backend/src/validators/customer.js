import { z } from 'zod';

export const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '');
export const normalizeCnic = (value) => String(value ?? '').replace(/\D/g, '');
export const normalizeEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
export const formatCnic = (value) => {
  const v = normalizeCnic(value);
  return v.length === 13 ? `${v.slice(0, 5)}-${v.slice(5, 12)}-${v.slice(12)}` : v;
};

const optionalText = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(500).optional());
const customerBase = z.object({
  name: z.string().trim().min(2).max(120),
  fatherName: optionalText,
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((v) => /^\d{10,15}$/.test(v), 'Phone must contain 10 to 15 digits'),
  whatsapp: optionalText,
  cnic: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .transform(normalizeCnic)
      .refine((v) => /^\d{13}$/.test(v), 'CNIC must contain exactly 13 digits')
      .optional(),
  ),
  email: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().trim().email().max(254).transform(normalizeEmail).optional(),
  ),
  village: optionalText,
  taluka: optionalText,
  district: optionalText,
  address: optionalText,
  openingBalance: z.coerce.number().finite().default(0),
  creditLimit: z.coerce.number().finite().min(0).default(0),
  status: z.enum(['active', 'inactive', 'blocked']).default('active'),
  reference: optionalText,
  notes: optionalText,
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
  category: optionalText,
  registrationDate: z.coerce.date().optional(),
});

export const createCustomerSchema = customerBase;
export const updateCustomerSchema = customerBase.partial();
export const parseCustomer = (payload, { partial = false } = {}) =>
  (partial ? updateCustomerSchema : createCustomerSchema).parse(payload);
