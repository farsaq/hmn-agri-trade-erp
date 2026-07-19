import PDFDocument from 'pdfkit';
import { AuditLog, Ledger, Purchase, Supplier } from '../models/index.js';
import { parseSupplier, formatCnic } from '../validators/supplier.js';
import {
  auditSupplier,
  buildSupplierQuery,
  createSupplierTransactional,
  restoreSupplier as restoreSupplierService,
  softDeleteSupplier,
  SUPPLIER_SORTS,
  supplierAgeing,
  updateSupplierTransactional,
} from '../services/supplierService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
const page = (v) => Math.max(1, parseInt(v, 10) || 1),
  limit = (v) => Math.min(100, Math.max(1, parseInt(v, 10) || 20));
export const list = asyncHandler(async (req, res) => {
  const p = page(req.query.page),
    l = limit(req.query.limit),
    filter = buildSupplierQuery(req.query),
    sort = SUPPLIER_SORTS.has(req.query.sort) ? req.query.sort : '-createdAt';
  const [items, total] = await Promise.all([
    Supplier.find(filter)
      .sort(sort)
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Supplier.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: items,
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l), hasNext: p * l < total, hasPrevious: p > 1 },
    filters: { sort },
  });
});
export const deleted = asyncHandler(async (req, res) => {
  const p = page(req.query.page),
    l = limit(req.query.limit),
    filter = buildSupplierQuery(req.query, { deleted: true });
  const [items, total] = await Promise.all([
    Supplier.find(filter)
      .sort('-deletedAt')
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Supplier.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
});
export const create = asyncHandler(async (req, res) => {
  const supplier = await createSupplierTransactional(parseSupplier(req.body), req.user?._id);
  await auditSupplier(req, 'SUPPLIER_CREATED', supplier);
  res.status(201).json({ success: true, data: supplier });
});
export const update = asyncHandler(async (req, res) => {
  const before = await Supplier.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!before) throw new AppError('Supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
  const supplier = await updateSupplierTransactional(
    req.params.id,
    parseSupplier(req.body, { partial: true }),
    req.user?._id,
  );
  await auditSupplier(req, 'SUPPLIER_UPDATED', supplier, { before, after: supplier.toObject() });
  res.json({ success: true, data: supplier });
});
export const remove = asyncHandler(async (req, res) => {
  const supplier = await softDeleteSupplier(req.params.id, req.user?._id);
  await auditSupplier(req, 'SUPPLIER_SOFT_DELETED', supplier);
  res.json({ success: true, message: 'Supplier moved to deleted records' });
});
export const restore = asyncHandler(async (req, res) => {
  const supplier = await restoreSupplierService(req.params.id, req.user?._id);
  await auditSupplier(req, 'SUPPLIER_RESTORED', supplier);
  res.json({ success: true, data: supplier });
});
export const detail = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!supplier) throw new AppError('Supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
  const [ledger, purchases, ageing] = await Promise.all([
    Ledger.find({ party: req.params.id, partyType: 'supplier' }).sort({ date: -1 }),
    Purchase.find({ supplier: req.params.id }).sort({ date: -1 }).limit(100),
    supplierAgeing(req.params.id),
  ]);
  res.json({
    success: true,
    data: { supplier: { ...supplier, formattedCnic: formatCnic(supplier.cnic) }, ledger, purchases, ageing },
  });
});
export const ageing = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: await supplierAgeing(req.params.id, req.query.asOf ? new Date(req.query.asOf) : new Date()),
  }),
);
export const timeline = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const supplier = await Supplier.findOne({ _id: id, isDeleted: false }).lean();
  if (!supplier) throw new AppError('Supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
  const [ledger, purchases, audits] = await Promise.all([
    Ledger.find({ party: id, partyType: 'supplier' }).lean(),
    Purchase.find({ supplier: id }).lean(),
    AuditLog.find({ entity: 'Supplier', entityId: id }).lean(),
  ]);
  const events = [
    ...ledger.map((x) => ({ kind: 'ledger', at: x.date || x.createdAt, data: x })),
    ...purchases.map((x) => ({ kind: 'purchase', at: x.date || x.createdAt, data: x })),
    ...audits.map((x) => ({ kind: 'audit', at: x.createdAt, data: x })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ success: true, data: events });
});
export const statementPdf = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, isDeleted: false });
  if (!supplier) throw new AppError('Supplier not found', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
  const entries = await Ledger.find({ party: req.params.id, partyType: 'supplier' })
    .sort({ date: 1, createdAt: 1 })
    .lean();
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${supplier.supplierCode}-statement.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(18).text('HMN Agri Trade', { align: 'center' });
  doc.fontSize(14).text('Supplier Statement', { align: 'center' }).moveDown();
  doc.fontSize(10).text(`Supplier: ${supplier.name}`);
  doc.text(`Code: ${supplier.supplierCode}`);
  doc.text(`Phone: ${supplier.phone || '-'}`);
  if (supplier.cnic) doc.text(`CNIC: ${formatCnic(supplier.cnic)}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`).moveDown();
  for (const e of entries) {
    if (doc.y > 740) doc.addPage();
    doc
      .fontSize(8)
      .text(
        `${new Date(e.date).toLocaleDateString()} | ${String(e.type).toUpperCase()} | PKR ${Number(e.amount || 0).toLocaleString()} | ${e.description || ''}`,
      );
  }
  doc
    .moveDown()
    .fontSize(11)
    .text(`Closing Balance: PKR ${Number(supplier.currentBalance || 0).toFixed(2)}`, { align: 'right' });
  doc.end();
});
