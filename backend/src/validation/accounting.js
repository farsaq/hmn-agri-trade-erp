import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
export const accountCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[A-Za-z0-9.-]+$/),
    name: z.string().trim().min(2).max(120),
    type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
    subtype: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    reportingGroup: z.string().trim().max(80).optional(),
    description: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    displayOrder: z.coerce.number().int().min(0).default(0),
    reportingSequence: z.coerce.number().int().min(0).default(0),
    parent: objectId.nullish(),
    currency: z.string().trim().length(3).default('PKR'),
    openingBalance: z.coerce.number().default(0),
    allowManualPosting: z.boolean().default(true),
    active: z.boolean().default(true),
    isControlAccount: z.boolean().default(false),
    controlAccountKey: z.string().trim().max(80).optional(),
  })
  .strict();
export const accountUpdateSchema = accountCreateSchema.partial().omit({ code: true, openingBalance: true });
export const openingBalanceAdjustmentSchema = z
  .object({
    newOpeningBalance: z.coerce.number(),
    date: z.coerce.date().optional(),
    reason: z.string().trim().min(3).max(500),
    reference: z.string().trim().max(100).optional(),
  })
  .strict();
const journalLine = z
  .object({
    account: objectId,
    description: z.string().trim().max(300).optional(),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    foreignDebit: z.coerce.number().min(0).default(0),
    foreignCredit: z.coerce.number().min(0).default(0),
    partyType: z.enum(['customer', 'supplier', 'employee', 'other']).optional(),
    party: objectId.optional(),
    warehouse: objectId.optional(),
    product: objectId.optional(),
    costCenter: objectId.optional(),
    department: objectId.optional(),
    project: objectId.optional(),
    branch: objectId.optional(),
  })
  .strict()
  .refine((x) => x.debit > 0 !== x.credit > 0, 'Each line must have either debit or credit');
export const journalCreateSchema = z
  .object({
    date: z.coerce.date().optional(),
    type: z.enum(['manual', 'adjustment', 'opening']).default('manual'),
    narration: z.string().trim().min(3).max(500),
    reference: z.string().trim().max(100).optional(),
    referenceDocumentNo: z.string().trim().max(100).optional(),
    idempotencyKey: z.string().trim().max(120).optional(),
    currency: z.string().trim().length(3).default('PKR'),
    baseCurrency: z.string().trim().length(3).default('PKR'),
    exchangeRate: z.coerce.number().positive().default(1),
    requiredApprovalLevel: z.coerce.number().int().min(1).max(5).default(1),
    lines: z.array(journalLine).min(2),
    attachments: z
      .array(
        z
          .object({
            name: z.string(),
            url: z.string().url(),
            mimeType: z.string().optional(),
            size: z.coerce.number().nonnegative().optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();
export const journalUpdateSchema = journalCreateSchema.partial().omit({ idempotencyKey: true });
export const fiscalYearSchema = z
  .object({
    name: z.string().min(2).max(80),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    baseCurrency: z.string().length(3).default('PKR'),
  })
  .strict()
  .refine((v) => v.endDate > v.startDate, 'Fiscal year end must be after start');
export const periodSchema = z
  .object({
    fiscalYear: objectId,
    name: z.string().min(2).max(80),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, 'Period end must be after start');
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const e = new Error('Accounting validation failed');
  e.statusCode = 422;
  e.code = 'ACCOUNTING_VALIDATION_FAILED';
  e.details = result.error.issues;
  throw e;
}
