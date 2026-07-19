import mongoose from 'mongoose';
import { AuditLog, Counter, Ledger, Purchase, Supplier } from '../models/index.js';
import { Payment } from '../models/enterprise.js';
import { normalizeCnic, normalizeEmail, normalizeNtn, normalizePhone } from '../validators/supplier.js';
import { AppError } from '../utils/AppError.js';
const OPENING = 'SUPPLIER_OPENING_BALANCE';
export async function nextSupplierCode(session) {
  const c = await Counter.findByIdAndUpdate(
    'supplierCode',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session },
  );
  return `SUP-${String(c.seq).padStart(6, '0')}`;
}
export function identity(data) {
  return {
    normalizedPhone: data.phone ? normalizePhone(data.phone) : undefined,
    normalizedEmail: data.email ? normalizeEmail(data.email) : undefined,
    normalizedCnic: data.cnic ? normalizeCnic(data.cnic) : undefined,
    normalizedNtn: data.ntn ? normalizeNtn(data.ntn) : undefined,
  };
}
export async function assertUniqueSupplier(data, { excludeId, session } = {}) {
  const x = identity(data),
    or = [];
  for (const [k, v] of Object.entries(x)) if (v) or.push({ [k]: v });
  if (!or.length) return;
  const q = { $or: or };
  if (excludeId) q._id = { $ne: excludeId };
  const found = await Supplier.findOne(q)
    .session(session || null)
    .lean();
  if (found)
    throw new AppError('Supplier phone, email, CNIC or NTN already exists', {
      statusCode: 409,
      code: 'SUPPLIER_DUPLICATE_IDENTITY',
    });
}
async function openingLedger(supplier, amount, session) {
  if (!amount) return;
  await Ledger.create(
    [
      {
        partyType: 'supplier',
        party: supplier._id,
        partyModel: 'Supplier',
        date: supplier.registrationDate || new Date(),
        type: amount >= 0 ? 'credit' : 'debit',
        amount: Math.abs(amount),
        description: 'Supplier opening balance',
        referenceType: OPENING,
        referenceId: supplier._id,
        balanceAfter: amount,
      },
    ],
    { session },
  );
}
export async function createSupplierTransactional(data, userId) {
  const session = await mongoose.startSession();
  let supplier;
  try {
    await session.withTransaction(async () => {
      await assertUniqueSupplier(data, { session });
      [supplier] = await Supplier.create(
        [
          {
            ...data,
            ...identity(data),
            supplierCode: await nextSupplierCode(session),
            currentBalance: data.openingBalance || 0,
            createdBy: userId,
            updatedBy: userId,
          },
        ],
        { session },
      );
      await openingLedger(supplier, data.openingBalance || 0, session);
    });
    return supplier;
  } finally {
    await session.endSession();
  }
}
export async function updateSupplierTransactional(id, data, userId) {
  const session = await mongoose.startSession();
  let supplier;
  try {
    await session.withTransaction(async () => {
      const before = await Supplier.findOne({ _id: id, isDeleted: false }).session(session);
      if (!before) throw new AppError('Supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
      const merged = {
        phone: data.phone ?? before.phone,
        email: data.email ?? before.email,
        cnic: data.cnic ?? before.cnic,
        ntn: data.ntn ?? before.ntn,
      };
      await assertUniqueSupplier(merged, { excludeId: id, session });
      const old = Number(before.openingBalance || 0);
      Object.assign(before, data, identity(merged), { updatedBy: userId });
      if (data.openingBalance !== undefined && Number(data.openingBalance) !== old) {
        const delta = Number(data.openingBalance) - old;
        before.currentBalance = Number(before.currentBalance || 0) + delta;
        await Ledger.deleteMany({ party: id, referenceType: OPENING, referenceId: id }).session(session);
        await openingLedger(before, Number(data.openingBalance), session);
      }
      supplier = await before.save({ session, validateBeforeSave: true });
    });
    return supplier;
  } finally {
    await session.endSession();
  }
}
export async function hasSupplierFinancialActivity(id, session) {
  const qs = [
    Purchase.exists({ supplier: id }),
    Payment.exists({ party: id, partyType: 'supplier' }),
    Ledger.exists({ party: id, partyType: 'supplier', referenceType: { $ne: OPENING } }),
  ];
  if (session) qs.forEach((q) => q.session(session));
  return (await Promise.all(qs)).some(Boolean);
}
export async function softDeleteSupplier(id, userId) {
  const session = await mongoose.startSession();
  let supplier;
  try {
    await session.withTransaction(async () => {
      supplier = await Supplier.findOne({ _id: id, isDeleted: false }).session(session);
      if (!supplier) throw new AppError('Supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
      if (await hasSupplierFinancialActivity(id, session))
        throw new AppError('Supplier has financial transactions and cannot be deleted', {
          statusCode: 409,
          code: 'SUPPLIER_HAS_TRANSACTIONS',
        });
      supplier.isDeleted = true;
      supplier.deletedAt = new Date();
      supplier.deletedBy = userId;
      await supplier.save({ session });
    });
    return supplier;
  } finally {
    await session.endSession();
  }
}
export async function restoreSupplier(id, userId) {
  const s = await Supplier.findOneAndUpdate(
    { _id: id, isDeleted: true },
    { $set: { isDeleted: false, updatedBy: userId }, $unset: { deletedAt: 1, deletedBy: 1 } },
    { new: true, runValidators: true },
  );
  if (!s) throw new AppError('Deleted supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
  return s;
}
export function buildSupplierQuery(q, { deleted = false } = {}) {
  const f = { isDeleted: deleted };
  if (q.search) {
    const rx = new RegExp(String(q.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [
      { name: rx },
      { company: rx },
      { supplierCode: rx },
      { phone: rx },
      { email: rx },
      { cnic: rx },
      { ntn: rx },
      { village: rx },
    ];
  }
  for (const k of [
    'supplierType',
    'businessType',
    'category',
    'village',
    'district',
    'status',
    'onboardingStatus',
    'riskLevel',
  ])
    if (q[k]) f[k] = q[k];
  if (q.tags)
    f.tags = {
      $all: String(q.tags)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    };
  if (q.minBalance !== undefined || q.maxBalance !== undefined)
    f.currentBalance = {
      ...(q.minBalance !== undefined && { $gte: Number(q.minBalance) }),
      ...(q.maxBalance !== undefined && { $lte: Number(q.maxBalance) }),
    };
  if (q.dateFrom || q.dateTo)
    f.registrationDate = {
      ...(q.dateFrom && { $gte: new Date(q.dateFrom) }),
      ...(q.dateTo && { $lte: new Date(q.dateTo) }),
    };
  if (q.preferred === 'true') f.preferredSupplier = true;
  if (q.blacklisted === 'true') f.blacklisted = true;
  return f;
}
export const SUPPLIER_SORTS = new Set([
  'createdAt',
  '-createdAt',
  'name',
  '-name',
  'supplierCode',
  '-supplierCode',
  'currentBalance',
  '-currentBalance',
  'registrationDate',
  '-registrationDate',
  'supplierRating',
  '-supplierRating',
]);
export async function supplierAgeing(id, asOf = new Date()) {
  const purchases = await Purchase.find({
    supplier: id,
    remaining: { $gt: 0 },
    status: { $nin: ['cancelled', 'draft'] },
  }).lean();
  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
  for (const p of purchases) {
    const days = Math.max(0, Math.floor((asOf - new Date(p.date || p.createdAt)) / 86400000));
    const amount = Number(p.remaining || 0);
    const key = days === 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
    buckets[key] += amount;
    buckets.total += amount;
  }
  return { asOf, purchasesCount: purchases.length, buckets };
}
export async function auditSupplier(req, action, supplier, metadata) {
  return AuditLog.create({
    user: req.user?._id,
    action,
    entity: 'Supplier',
    entityId: supplier._id,
    description: action.replaceAll('_', ' '),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata,
  });
}
