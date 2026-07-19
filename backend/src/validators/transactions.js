import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid object id');
const num = z.coerce.number();
const item = z
  .object({
    product: id,
    batch: id.optional().nullable(),
    quantity: num.positive(),
    unit: z.string().trim().min(1).max(30).optional(),
    rate: num.nonnegative(),
    expiryDate: z.coerce.date().optional(),
    batchNo: z.string().trim().max(80).optional(),
  })
  .strip();
export const saleSchema = z
  .object({
    customer: id,
    warehouse: id,
    items: z.array(item).min(1),
    discount: num.nonnegative().default(0),
    transport: num.nonnegative().default(0),
    taxRate: num.min(0).max(100).default(0),
    payment: num.nonnegative().default(0),
    paymentMethod: z.enum(['cash', 'bank', 'card', 'online', 'cheque', 'credit', 'other']).optional(),
    account: id.optional(),
    dueDate: z.coerce.date().optional(),
    status: z.enum(['draft', 'confirmed']).default('confirmed'),
    idempotencyKey: z.string().min(8).max(128).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strip()
  .superRefine((v, ctx) => {
    if (v.status === 'draft' && v.payment > 0)
      ctx.addIssue({ code: 'custom', path: ['payment'], message: 'Draft sales cannot contain payment; confirm first' });
  });
export const purchaseSchema = z
  .object({
    supplier: id,
    warehouse: id,
    supplierInvoiceNo: z.string().trim().max(100).optional(),
    items: z.array(item).min(1),
    discount: num.nonnegative().default(0),
    transport: num.nonnegative().default(0),
    expenses: num.nonnegative().default(0),
    taxRate: num.min(0).max(100).default(0),
    payment: num.nonnegative().default(0),
    paymentMethod: z.enum(['cash', 'bank', 'card', 'online', 'cheque', 'other']).optional(),
    account: id.optional(),
    status: z.enum(['draft', 'confirmed', 'received']).default('draft'),
    idempotencyKey: z.string().min(8).max(128).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strip()
  .superRefine((v, ctx) => {
    if (v.status !== 'received' && v.payment > 0)
      ctx.addIssue({
        code: 'custom',
        path: ['payment'],
        message: 'Payment can only be posted when purchase is received',
      });
  });
export const paymentSchema = z
  .object({
    direction: z.enum(['receipt', 'payment']),
    partyType: z.enum(['customer', 'supplier']),
    party: id,
    amount: num.positive(),
    method: z.enum(['cash', 'bank', 'card', 'online', 'cheque', 'other']).default('cash'),
    account: id.optional(),
    reference: z.string().trim().max(120).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    currency: z.string().trim().min(3).max(3).default('PKR'),
    exchangeRate: num.positive().default(1),
    chequeStatus: z.enum(['none', 'issued', 'deposited', 'pending', 'cleared', 'bounced', 'cancelled']).default('none'),
    allocations: z
      .array(z.object({ documentType: z.enum(['sale', 'purchase']), document: id, amount: num.positive() }).strip())
      .default([]),
  })
  .strip();
export const returnSchema = z
  .object({
    sale: id.optional(),
    purchase: id.optional(),
    warehouse: id,
    items: z
      .array(
        z
          .object({
            product: id,
            batch: id.optional().nullable(),
            quantity: num.positive(),
            rate: num.nonnegative().optional(),
            disposition: z.enum(['restock', 'damage', 'expiry', 'return-to-supplier']).optional(),
          })
          .strip(),
      )
      .min(1),
    reason: z.string().trim().min(2).max(1000),
    refundMethod: z.enum(['cash', 'bank', 'card', 'online', 'cheque', 'credit', 'other']).optional(),
    account: id.optional(),
  })
  .strip();
export const expenseSchema = z
  .object({
    date: z.coerce.date().optional(),
    category: z.string().trim().min(2).max(100),
    categoryRef: id.optional(),
    amount: num.positive(),
    description: z.string().trim().min(2).max(2000),
    paymentMethod: z.enum(['cash', 'bank', 'card', 'online', 'cheque', 'other']).default('cash'),
    reference: z.string().trim().max(120).optional(),
    vendor: z.string().trim().max(200).optional(),
    warehouse: id.optional(),
    account: id.optional(),
    payee: id.optional(),
    payeeModel: z.enum(['Supplier', 'Customer']).optional(),
    taxRate: num.min(0).max(100).default(0),
    status: z.enum(['draft', 'pending']).default('pending'),
    notes: z.string().max(2000).optional(),
    attachments: z.array(z.string().max(500)).max(10).default([]),
    recurring: z
      .object({
        enabled: z.boolean().default(false),
        frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
        nextRunAt: z.coerce.date().optional(),
      })
      .optional(),
  })
  .strip()
  .superRefine((v, ctx) => {
    if (Boolean(v.payee) !== Boolean(v.payeeModel))
      ctx.addIssue({ code: 'custom', path: ['payee'], message: 'payee and payeeModel must be provided together' });
    if (v.recurring?.enabled && !v.recurring.frequency)
      ctx.addIssue({ code: 'custom', path: ['recurring', 'frequency'], message: 'Recurring frequency is required' });
  });
export const expenseApprovalSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    level: num.int().min(1).max(5).default(1),
    reason: z.string().trim().max(1000).optional(),
  })
  .strip()
  .superRefine((v, ctx) => {
    if (v.status === 'rejected' && !v.reason)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Rejection reason is required' });
  });
export function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) {
    const e = new Error('Validation failed');
    e.statusCode = 422;
    e.code = 'TRANSACTION_VALIDATION_FAILED';
    e.details = r.error.flatten();
    throw e;
  }
  return r.data;
}
