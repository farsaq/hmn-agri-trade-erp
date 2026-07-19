import mongoose from 'mongoose';
import { AuditLog, Counter, Customer, Ledger, Sale } from '../models/index.js';
import { normalizeCnic, normalizeEmail, normalizePhone } from '../validators/customer.js';
import { AppError } from '../utils/AppError.js';

const OPENING = 'CUSTOMER_OPENING_BALANCE';
export async function nextCustomerCode(session) {
  const c = await Counter.findByIdAndUpdate(
    'customerCode',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session },
  );
  return `CUS-${String(c.seq).padStart(6, '0')}`;
}
export function normalizedIdentity(data) {
  return {
    normalizedPhone: normalizePhone(data.phone),
    normalizedCnic: data.cnic ? normalizeCnic(data.cnic) : undefined,
    normalizedEmail: data.email ? normalizeEmail(data.email) : undefined,
  };
}
export async function assertUniqueIdentity(data, { excludeId, session } = {}) {
  const clauses = [];
  const id = normalizedIdentity(data);
  if (id.normalizedPhone) clauses.push({ normalizedPhone: id.normalizedPhone });
  if (id.normalizedCnic) clauses.push({ normalizedCnic: id.normalizedCnic });
  if (id.normalizedEmail) clauses.push({ normalizedEmail: id.normalizedEmail });
  if (!clauses.length) return;
  const q = { $or: clauses };
  if (excludeId) q._id = { $ne: excludeId };
  const found = await Customer.findOne(q)
    .session(session || null)
    .lean();
  if (found)
    throw new AppError('A customer with the same phone, CNIC, or email already exists', {
      statusCode: 409,
      code: 'CUSTOMER_DUPLICATE_IDENTITY',
    });
}
async function writeOpeningLedger(customer, amount, session) {
  if (!amount) return;
  await Ledger.create(
    [
      {
        partyType: 'customer',
        party: customer._id,
        partyModel: 'Customer',
        date: customer.registrationDate || new Date(),
        type: amount >= 0 ? 'debit' : 'credit',
        amount: Math.abs(amount),
        description: 'Customer opening balance',
        referenceType: OPENING,
        referenceId: customer._id,
        balanceAfter: amount,
      },
    ],
    { session },
  );
}
export async function createCustomerTransactional(data, userId) {
  const session = await mongoose.startSession();
  let customer;
  try {
    await session.withTransaction(async () => {
      await assertUniqueIdentity(data, { session });
      const identity = normalizedIdentity(data);
      const code = await nextCustomerCode(session);
      [customer] = await Customer.create(
        [
          {
            ...data,
            ...identity,
            customerCode: code,
            currentBalance: data.openingBalance || 0,
            createdBy: userId,
            updatedBy: userId,
          },
        ],
        { session },
      );
      await writeOpeningLedger(customer, data.openingBalance || 0, session);
    });
    return customer;
  } finally {
    await session.endSession();
  }
}
export async function updateCustomerTransactional(id, data, userId) {
  const session = await mongoose.startSession();
  let customer;
  try {
    await session.withTransaction(async () => {
      const before = await Customer.findOne({ _id: id, isDeleted: false }).session(session);
      if (!before) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
      const merged = {
        phone: data.phone ?? before.phone,
        cnic: data.cnic ?? before.cnic,
        email: data.email ?? before.email,
      };
      await assertUniqueIdentity(merged, { excludeId: id, session });
      const oldOpening = before.openingBalance || 0;
      Object.assign(before, data, normalizedIdentity(merged), { updatedBy: userId });
      if (data.openingBalance !== undefined && data.openingBalance !== oldOpening) {
        const delta = data.openingBalance - oldOpening;
        before.currentBalance = (before.currentBalance || 0) + delta;
        await Ledger.deleteMany({ party: id, referenceType: OPENING, referenceId: id }).session(session);
        await writeOpeningLedger(before, data.openingBalance, session);
      }
      customer = await before.save({ session, validateBeforeSave: true });
    });
    return customer;
  } finally {
    await session.endSession();
  }
}
export async function hasFinancialActivity(id, session) {
  const saleQuery = Sale.exists({ customer: id });
  const ledgerQuery = Ledger.exists({ party: id, referenceType: { $ne: OPENING } });
  if (session) {
    saleQuery.session(session);
    ledgerQuery.session(session);
  }
  return Boolean(await Promise.all([saleQuery, ledgerQuery]).then((x) => x.some(Boolean)));
}
export async function softDeleteCustomer(id, userId) {
  const session = await mongoose.startSession();
  let customer;
  try {
    await session.withTransaction(async () => {
      customer = await Customer.findOne({ _id: id, isDeleted: false }).session(session);
      if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
      if (await hasFinancialActivity(id, session))
        throw new AppError('Customer has financial transactions and cannot be deleted', {
          statusCode: 409,
          code: 'CUSTOMER_HAS_TRANSACTIONS',
        });
      customer.isDeleted = true;
      customer.deletedAt = new Date();
      customer.deletedBy = userId;
      await customer.save({ session });
    });
    return customer;
  } finally {
    await session.endSession();
  }
}
export async function restoreCustomer(id, userId) {
  const customer = await Customer.findOneAndUpdate(
    { _id: id, isDeleted: true },
    { $set: { isDeleted: false, updatedBy: userId }, $unset: { deletedAt: 1, deletedBy: 1 } },
    { new: true, runValidators: true },
  );
  if (!customer) throw new AppError('Deleted customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  return customer;
}
export function buildCustomerQuery(query, { deleted = false } = {}) {
  const filter = { isDeleted: deleted };
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { customerCode: rx }, { phone: rx }, { cnic: rx }, { email: rx }, { village: rx }];
  }
  for (const k of ['village', 'district', 'status', 'category']) if (query[k]) filter[k] = query[k];
  if (query.tags)
    filter.tags = {
      $all: String(query.tags)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    };
  if (query.minBalance !== undefined || query.maxBalance !== undefined)
    filter.currentBalance = {
      ...(query.minBalance !== undefined && { $gte: Number(query.minBalance) }),
      ...(query.maxBalance !== undefined && { $lte: Number(query.maxBalance) }),
    };
  if (query.creditExceeded === 'true')
    filter.$expr = { $and: [{ $gt: ['$creditLimit', 0] }, { $gt: ['$currentBalance', '$creditLimit'] }] };
  if (query.dateFrom || query.dateTo)
    filter.registrationDate = {
      ...(query.dateFrom && { $gte: new Date(query.dateFrom) }),
      ...(query.dateTo && { $lte: new Date(query.dateTo) }),
    };
  return filter;
}
export const CUSTOMER_SORTS = new Set([
  'createdAt',
  '-createdAt',
  'name',
  '-name',
  'customerCode',
  '-customerCode',
  'currentBalance',
  '-currentBalance',
  'registrationDate',
  '-registrationDate',
]);
export async function customerAgeing(id, asOf = new Date()) {
  const sales = await Sale.find({
    customer: id,
    remaining: { $gt: 0 },
    status: { $nin: ['cancelled', 'draft'] },
  }).lean();
  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
  for (const sale of sales) {
    const base = new Date(sale.dueDate || sale.date || sale.createdAt);
    const days = Math.max(0, Math.floor((asOf - base) / 86400000));
    const amount = Number(sale.remaining || 0);
    const key = days === 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
    buckets[key] += amount;
    buckets.total += amount;
  }
  return { asOf, salesCount: sales.length, buckets };
}
export async function auditCustomer(req, action, customer, metadata) {
  return AuditLog.create({
    user: req.user?._id,
    action,
    entity: 'Customer',
    entityId: customer._id,
    description: action.replaceAll('_', ' '),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata,
  });
}
