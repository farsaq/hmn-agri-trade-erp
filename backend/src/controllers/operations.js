import mongoose from 'mongoose';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { Supplier, Product, Purchase, Sale, Customer, Ledger, AuditLog } from '../models/index.js';
import { Warehouse, InventoryMovement, Attachment } from '../models/enterprise.js';
import {
  SupplierContract,
  SupplierBankAccount,
  SupplierContact,
  SupplierCompliance,
  SupplierActivity,
  SupplierEvaluation,
  Category,
  Brand,
  ProductBatch,
  WarehouseStock,
  StockReconciliation,
  StockRequest,
  SaleReturn,
  Quotation,
  DeliveryChallan,
  PaymentAllocation,
} from '../models/operations.js';
const n = (v) => Number(v || 0);
const nextNo = async (Model, prefix) =>
  `${prefix}-${new Date().getFullYear()}-${String((await Model.countDocuments()) + 1).padStart(6, '0')}`;
const log = (req, action, entity, id, metadata) =>
  AuditLog.create({ user: req.user?._id, action, entity, entityId: id, metadata, description: `${action} ${entity}` });
export async function supplierProfile(req, res) {
  const supplier = await Supplier.findById(req.params.id)
    .populate('defaultWarehouse', 'name code')
    .populate('createdBy updatedBy', 'name email');
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  await SupplierContract.updateMany(
    { supplier: supplier._id, status: 'active', endDate: { $lt: new Date() } },
    { status: 'expired' },
  );
  const [contracts, banks, contacts, compliance, activities, purchases, ledger, attachments, evaluations, products] =
    await Promise.all([
      SupplierContract.find({ supplier: supplier._id }).sort({ endDate: 1, createdAt: -1 }),
      SupplierBankAccount.find({ supplier: supplier._id }).sort({ isPrimary: -1, createdAt: -1 }),
      SupplierContact.find({ supplier: supplier._id }).sort({ isPrimary: -1, createdAt: -1 }),
      SupplierCompliance.find({ supplier: supplier._id })
        .populate('verifiedBy', 'name')
        .sort({ expiresAt: 1, createdAt: -1 }),
      SupplierActivity.find({ supplier: supplier._id })
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .limit(200),
      Purchase.find({ supplier: supplier._id }).sort({ date: -1 }).limit(200).populate('items.product', 'name sku'),
      Ledger.find({ party: supplier._id, partyType: 'supplier' }).sort({ date: 1, createdAt: 1 }),
      Attachment.find({ entityType: 'supplier', entityId: supplier._id }).sort({ createdAt: -1 }),
      SupplierEvaluation.find({ supplier: supplier._id }).populate('reviewedBy', 'name').sort({ createdAt: -1 }),
      Product.find({ supplier: supplier._id }).select('name sku category availableStock purchasePrice'),
    ]);
  let running = Number(supplier.openingBalance || 0);
  const ledgerWithRunning = ledger.map((x) => {
    running += x.type === 'credit' ? Number(x.amount || 0) : -Number(x.amount || 0);
    return { ...x.toObject(), runningBalance: running };
  });
  const totals = purchases.reduce(
    (a, p) => ({
      purchaseTotal: a.purchaseTotal + Number(p.total || 0),
      paidTotal: a.paidTotal + Number(p.payment || 0),
      remainingTotal: a.remainingTotal + Number(p.remaining || 0),
    }),
    { purchaseTotal: 0, paidTotal: 0, remainingTotal: 0 },
  );
  const now = Date.now(),
    aging = { current: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  for (const p of purchases) {
    const due = Number(p.remaining || 0);
    if (due <= 0) continue;
    const days = Math.floor((now - new Date(p.date).getTime()) / 86400000);
    if (days <= 30) aging.current += due;
    else if (days <= 60) aging.days31to60 += due;
    else if (days <= 90) aging.days61to90 += due;
    else aging.days90plus += due;
  }
  for (const d of compliance) {
    if (d.expiresAt) {
      const days = Math.ceil((new Date(d.expiresAt) - new Date()) / 86400000);
      d.status =
        days < 0 ? 'expired' : days <= 30 ? 'expiring' : d.status === 'pending-review' ? 'pending-review' : 'valid';
      await d.save();
    }
  }
  const activeContracts = contracts.filter((x) => x.status === 'active').length;
  const expiringContracts = contracts.filter(
    (x) => x.status === 'active' && x.endDate && new Date(x.endDate) <= new Date(Date.now() + 30 * 86400000),
  ).length;
  const overdueCompliance = compliance.filter((x) => ['expired', 'expiring'].includes(x.status)).length;
  const openFollowUps = activities.filter((x) => !x.completed && x.nextFollowUpAt).length;
  res.json({
    supplier,
    contracts,
    banks,
    contacts,
    compliance,
    activities,
    purchases,
    ledger: ledgerWithRunning,
    attachments,
    evaluations,
    products,
    metrics: {
      ...totals,
      aging,
      activeContracts,
      expiringContracts,
      overdueCompliance,
      openFollowUps,
      productCount: products.length,
      averageRating: evaluations.length
        ? evaluations.reduce((a, x) => a + Number(x.overall || 0), 0) / evaluations.length
        : Number(supplier.supplierRating || 0),
    },
  });
}
export async function addSupplierContract(req, res) {
  const count = await SupplierContract.countDocuments({ supplier: req.params.id });
  const doc = await SupplierContract.create({
    ...req.body,
    supplier: req.params.id,
    contractNo: req.body.contractNo || `SC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await log(req, 'create', 'supplier-contract', doc._id);
  res.status(201).json(doc);
}
export async function updateSupplierContract(req, res) {
  const before = await SupplierContract.findOne({ _id: req.params.contractId, supplier: req.params.id }).lean();
  if (!before) return res.status(404).json({ message: 'Contract not found' });
  const doc = await SupplierContract.findByIdAndUpdate(
    req.params.contractId,
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true },
  );
  await log(req, 'update', 'supplier-contract', doc._id, { before, after: doc });
  res.json(doc);
}
export async function deleteSupplierContract(req, res) {
  const doc = await SupplierContract.findOneAndDelete({ _id: req.params.contractId, supplier: req.params.id });
  if (!doc) return res.status(404).json({ message: 'Contract not found' });
  await log(req, 'delete', 'supplier-contract', doc._id, { before: doc });
  res.json({ success: true });
}
export async function addSupplierBank(req, res) {
  if (req.body.isPrimary) await SupplierBankAccount.updateMany({ supplier: req.params.id }, { isPrimary: false });
  const doc = await SupplierBankAccount.create({ ...req.body, supplier: req.params.id });
  await log(req, 'create', 'supplier-bank', doc._id);
  res.status(201).json(doc);
}
export async function updateSupplierBank(req, res) {
  if (req.body.isPrimary)
    await SupplierBankAccount.updateMany(
      { supplier: req.params.id, _id: { $ne: req.params.bankId } },
      { isPrimary: false },
    );
  const data = { ...req.body };
  if (req.body.verified) {
    data.verifiedBy = req.user._id;
    data.verifiedAt = new Date();
  }
  const doc = await SupplierBankAccount.findOneAndUpdate({ _id: req.params.bankId, supplier: req.params.id }, data, {
    new: true,
    runValidators: true,
  });
  if (!doc) return res.status(404).json({ message: 'Bank account not found' });
  await log(req, 'update', 'supplier-bank', doc._id);
  res.json(doc);
}
export async function deleteSupplierBank(req, res) {
  const doc = await SupplierBankAccount.findOneAndDelete({ _id: req.params.bankId, supplier: req.params.id });
  if (!doc) return res.status(404).json({ message: 'Bank account not found' });
  await log(req, 'delete', 'supplier-bank', doc._id);
  res.json({ success: true });
}

export async function addSupplierContact(req, res) {
  if (req.body.isPrimary) await SupplierContact.updateMany({ supplier: req.params.id }, { isPrimary: false });
  const doc = await SupplierContact.create({
    ...req.body,
    supplier: req.params.id,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await log(req, 'create', 'supplier-contact', doc._id);
  res.status(201).json(doc);
}
export async function updateSupplierContact(req, res) {
  if (req.body.isPrimary)
    await SupplierContact.updateMany(
      { supplier: req.params.id, _id: { $ne: req.params.contactId } },
      { isPrimary: false },
    );
  const doc = await SupplierContact.findOneAndUpdate(
    { _id: req.params.contactId, supplier: req.params.id },
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true },
  );
  if (!doc) return res.status(404).json({ message: 'Contact not found' });
  await log(req, 'update', 'supplier-contact', doc._id);
  res.json(doc);
}
export async function deleteSupplierContact(req, res) {
  const doc = await SupplierContact.findOneAndDelete({ _id: req.params.contactId, supplier: req.params.id });
  if (!doc) return res.status(404).json({ message: 'Contact not found' });
  await log(req, 'delete', 'supplier-contact', doc._id);
  res.json({ success: true });
}
export async function addSupplierCompliance(req, res) {
  const data = { ...req.body, supplier: req.params.id, createdBy: req.user._id };
  if (req.body.verified) {
    data.verifiedBy = req.user._id;
    data.verifiedAt = new Date();
    delete data.verified;
  }
  const doc = await SupplierCompliance.create(data);
  await log(req, 'create', 'supplier-compliance', doc._id);
  res.status(201).json(doc);
}
export async function updateSupplierCompliance(req, res) {
  const data = { ...req.body };
  if (req.body.verified) {
    data.verifiedBy = req.user._id;
    data.verifiedAt = new Date();
    delete data.verified;
  }
  const doc = await SupplierCompliance.findOneAndUpdate(
    { _id: req.params.complianceId, supplier: req.params.id },
    data,
    { new: true, runValidators: true },
  );
  if (!doc) return res.status(404).json({ message: 'Compliance document not found' });
  await log(req, 'update', 'supplier-compliance', doc._id);
  res.json(doc);
}
export async function deleteSupplierCompliance(req, res) {
  const doc = await SupplierCompliance.findOneAndDelete({ _id: req.params.complianceId, supplier: req.params.id });
  if (!doc) return res.status(404).json({ message: 'Compliance document not found' });
  await log(req, 'delete', 'supplier-compliance', doc._id);
  res.json({ success: true });
}
export async function addSupplierActivity(req, res) {
  const doc = await SupplierActivity.create({ ...req.body, supplier: req.params.id, createdBy: req.user._id });
  await Supplier.findByIdAndUpdate(req.params.id, { lastTransaction: new Date(), updatedBy: req.user._id });
  await log(req, 'create', 'supplier-activity', doc._id);
  res.status(201).json(doc);
}
export async function completeSupplierActivity(req, res) {
  const doc = await SupplierActivity.findOneAndUpdate(
    { _id: req.params.activityId, supplier: req.params.id },
    { completed: true },
    { new: true },
  );
  if (!doc) return res.status(404).json({ message: 'Activity not found' });
  await log(req, 'complete', 'supplier-activity', doc._id);
  res.json(doc);
}
export async function updateSupplierGovernance(req, res) {
  const allowed = ['onboardingStatus', 'riskLevel', 'riskScore', 'holdReason', 'rejectedReason'];
  const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (data.onboardingStatus === 'approved') {
    data.approvedBy = req.user._id;
    data.approvedAt = new Date();
    data.rejectedReason = '';
  }
  const before = await Supplier.findById(req.params.id).lean();
  const doc = await Supplier.findByIdAndUpdate(
    req.params.id,
    { ...data, updatedBy: req.user._id },
    { new: true, runValidators: true },
  );
  if (!doc) return res.status(404).json({ message: 'Supplier not found' });
  await log(req, 'update', 'supplier-governance', doc._id, { before, after: doc });
  res.json(doc);
}
export async function addSupplierAttachment(req, res) {
  if (!req.file) return res.status(400).json({ message: 'File required' });
  const doc = await Attachment.create({
    entityType: 'supplier',
    entityId: req.params.id,
    name: req.file.originalname,
    url: `/uploads/suppliers/${req.file.filename}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
    category: req.body.category || 'general',
    description: req.body.description || '',
    uploadedBy: req.user._id,
  });
  await log(req, 'create', 'supplier-attachment', doc._id);
  res.status(201).json(doc);
}
export async function deleteSupplierAttachment(req, res) {
  const doc = await Attachment.findOneAndDelete({
    _id: req.params.attachmentId,
    entityType: 'supplier',
    entityId: req.params.id,
  });
  if (!doc) return res.status(404).json({ message: 'Attachment not found' });
  const local = doc.url?.startsWith('/uploads/') ? path.resolve(doc.url.slice(1)) : null;
  if (local && fs.existsSync(local)) await fsp.unlink(local).catch(() => {});
  await log(req, 'delete', 'supplier-attachment', doc._id);
  res.json({ success: true });
}
export async function addSupplierEvaluation(req, res) {
  const vals = ['quality', 'delivery', 'pricing', 'communication'].map((k) => Number(req.body[k] || 0));
  if (vals.some((x) => x < 0 || x > 5)) return res.status(400).json({ message: 'Ratings must be between 0 and 5' });
  const overall = Number(req.body.overall || vals.reduce((a, x) => a + x, 0) / 4);
  const doc = await SupplierEvaluation.create({
    ...req.body,
    overall,
    supplier: req.params.id,
    reviewedBy: req.user._id,
  });
  const avg = await SupplierEvaluation.aggregate([
    { $match: { supplier: new mongoose.Types.ObjectId(req.params.id) } },
    { $group: { _id: null, value: { $avg: '$overall' } } },
  ]);
  await Supplier.findByIdAndUpdate(req.params.id, {
    supplierRating: avg[0]?.value || overall,
    updatedBy: req.user._id,
  });
  await log(req, 'create', 'supplier-evaluation', doc._id);
  res.status(201).json(doc);
}
export async function supplierStatement(req, res) {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  const q = { party: supplier._id, partyType: 'supplier' };
  if (req.query.from || req.query.to)
    q.date = {
      ...(req.query.from && { $gte: new Date(req.query.from) }),
      ...(req.query.to && { $lte: new Date(req.query.to) }),
    };
  const rows = await Ledger.find(q).sort({ date: 1, createdAt: 1 }).lean();
  let balance = Number(supplier.openingBalance || 0);
  const mapped = rows.map((x) => {
    balance += x.type === 'credit' ? Number(x.amount || 0) : -Number(x.amount || 0);
    return { ...x, runningBalance: balance };
  });
  const format = String(req.query.format || 'pdf').toLowerCase();
  if (format === 'csv') {
    const lines = [
      'Date,Type,Description,Reference,Amount,Running Balance',
      ...mapped.map((x) =>
        [
          new Date(x.date).toISOString().slice(0, 10),
          x.type,
          `"${String(x.description || '').replaceAll('"', '""')}"`,
          x.referenceType || '',
          x.amount,
          x.runningBalance,
        ].join(','),
      ),
    ];
    res.setHeader('Content-Disposition', `attachment; filename=${supplier.supplierCode || 'supplier'}-statement.csv`);
    return res.type('text/csv').send(lines.join('\n'));
  }
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Disposition', `attachment; filename=${supplier.supplierCode || 'supplier'}-statement.pdf`);
  res.type('application/pdf');
  doc.pipe(res);
  doc.fontSize(18).fillColor('#14532d').text('HMN Agri Trade', { align: 'center' });
  doc.fontSize(14).fillColor('#111827').text('Supplier Statement', { align: 'center' });
  doc
    .moveDown()
    .fontSize(10)
    .text(`${supplier.name} | ${supplier.company || ''} | ${supplier.phone || ''}`);
  doc.text(
    `Opening balance: PKR ${Number(supplier.openingBalance || 0).toLocaleString()} | Closing balance: PKR ${balance.toLocaleString()}`,
  );
  doc.moveDown();
  for (const x of mapped) {
    doc
      .fontSize(8)
      .text(
        `${new Date(x.date).toLocaleDateString()} | ${String(x.type).toUpperCase()} | ${x.description || ''} | PKR ${Number(x.amount || 0).toLocaleString()} | Balance PKR ${Number(x.runningBalance || 0).toLocaleString()}`,
      );
    if (doc.y > 740) doc.addPage();
  }
  doc.end();
}
export async function archiveSupplier(req, res) {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  supplier.status = req.body.restore === true ? 'active' : 'inactive';
  supplier.updatedBy = req.user._id;
  await supplier.save();
  await log(req, req.body.restore === true ? 'restore' : 'archive', 'supplier', supplier._id);
  res.json(supplier);
}
export async function listMetadata(req, res) {
  res.json({
    categories: await Category.find({ active: true }).sort({ name: 1 }),
    brands: await Brand.find({ active: true }).sort({ name: 1 }),
    warehouses: await Warehouse.find({ active: true }).sort({ name: 1 }),
    suppliers: await Supplier.find({ status: 'active' }).select('name company').sort({ name: 1 }),
  });
}
export const createCategory = async (req, res) => res.status(201).json(await Category.create(req.body));
export const createBrand = async (req, res) => res.status(201).json(await Brand.create(req.body));
export async function productProfile(req, res) {
  const product = await Product.findById(req.params.id).populate('supplier', 'name company');
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const [batches, stocks] = await Promise.all([
    ProductBatch.find({ product: product._id }).sort({ expiryDate: 1 }),
    WarehouseStock.find({ product: product._id })
      .populate('warehouse', 'name code')
      .populate('batch', 'batchNo lotNo expiryDate'),
  ]);
  res.json({ product, batches, stocks, valuation: stocks.reduce((a, s) => a + n(s.quantity) * n(s.averageCost), 0) });
}
export async function uploadProductImages(req, res) {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const urls = (req.files || []).map((f) => `/uploads/products/${f.filename}`);
  product.images = [...(product.images || []), ...urls];
  if (!product.image && urls[0]) product.image = urls[0];
  await product.save();
  res.json(product);
}
export async function generateCodes(req, res) {
  const p = await Product.findById(req.params.id);
  if (!p) return res.status(404).json({ message: 'Product not found' });
  p.barcode = p.barcode || `HMN${String(p._id).slice(-10).toUpperCase()}`;
  p.qrCode = await QRCode.toDataURL(JSON.stringify({ type: 'product', id: p._id, sku: p.sku, name: p.name }));
  await p.save();
  res.json({ barcode: p.barcode, qrCode: p.qrCode });
}
export async function barcodePng(req, res) {
  const p = await Product.findById(req.params.id);
  if (!p) return res.status(404).end();
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: p.barcode || String(p._id),
    scale: 3,
    height: 12,
    includetext: true,
  });
  res.type('png').send(png);
}
export async function createBatch(req, res) {
  const doc = await ProductBatch.create({
    ...req.body,
    product: req.params.id,
    warehouse: req.body.warehouse || undefined,
  });
  res.status(201).json(doc);
}
async function changeStock({ session, product, warehouse, batch, delta, cost = 0 }) {
  const query = { product, warehouse, batch: batch || null };
  let stock = await WarehouseStock.findOne(query).session(session);
  if (!stock) stock = new WarehouseStock({ ...query, quantity: 0, averageCost: cost });
  const next = n(stock.quantity) + n(delta);
  if (next < 0) throw new Error('Insufficient warehouse stock');
  if (delta > 0 && cost > 0)
    stock.averageCost =
      (n(stock.quantity) * n(stock.averageCost) + n(delta) * n(cost)) / (n(stock.quantity) + n(delta));
  stock.quantity = next;
  await stock.save({ session });
  return stock;
}
export async function inventorySummary(req, res) {
  const q = {};
  if (req.query.warehouse) q.warehouse = req.query.warehouse;
  else if (req.allowedWarehouseIds) q.warehouse = { $in: req.allowedWarehouseIds };
  if (req.query.product) q.product = req.query.product;
  const stocks = await WarehouseStock.find(q)
    .populate('product', 'name sku category unit minimumStock')
    .populate('warehouse', 'name code')
    .populate('batch', 'batchNo lotNo expiryDate')
    .sort({ updatedAt: -1 });
  const value = stocks.reduce((a, s) => a + n(s.quantity) * n(s.averageCost), 0);
  const expiring = await ProductBatch.find({
    expiryDate: { $lte: new Date(Date.now() + 30 * 86400000) },
    status: 'active',
  }).populate('product', 'name sku');
  res.json({ stocks, value, expiring });
}
export async function transferStock(req, res) {
  const session = await mongoose.startSession();
  try {
    let movement;
    await session.withTransaction(async () => {
      const { product, fromWarehouse, toWarehouse, batch, quantity } = req.body;
      if (String(fromWarehouse) === String(toWarehouse)) throw new Error('Warehouses must be different');
      await changeStock({ session, product, warehouse: fromWarehouse, batch, delta: -n(quantity) });
      await changeStock({ session, product, warehouse: toWarehouse, batch, delta: n(quantity) });
      movement = await InventoryMovement.create(
        [
          {
            product,
            type: 'transfer',
            quantity,
            fromWarehouse,
            toWarehouse,
            batchNo: req.body.batchNo,
            reason: req.body.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
    });
    res.status(201).json(movement[0]);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function createReconciliation(req, res) {
  const stock = await WarehouseStock.findOne({
    product: req.body.product,
    warehouse: req.body.warehouse,
    batch: req.body.batch || null,
  });
  const systemQuantity = n(stock?.quantity);
  const doc = await StockReconciliation.create({
    ...req.body,
    systemQuantity,
    difference: n(req.body.countedQuantity) - systemQuantity,
    createdBy: req.user._id,
  });
  res.status(201).json(doc);
}
export async function approveReconciliation(req, res) {
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      doc = await StockReconciliation.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'pending') throw new Error('Invalid reconciliation');
      await changeStock({
        session,
        product: doc.product,
        warehouse: doc.warehouse,
        batch: doc.batch,
        delta: doc.difference,
      });
      doc.status = 'approved';
      doc.approvedBy = req.user._id;
      await doc.save({ session });
      await InventoryMovement.create(
        [
          {
            product: doc.product,
            warehouse: doc.warehouse,
            type: 'adjustment',
            quantity: Math.abs(doc.difference),
            reason: doc.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
    });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function createStockRequest(req, res) {
  res.status(201).json(await StockRequest.create({ ...req.body, requestedBy: req.user._id }));
}
export async function approveStockRequest(req, res) {
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      doc = await StockRequest.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'pending') throw new Error('Invalid request');
      const delta = doc.type === 'return' ? n(doc.quantity) : -n(doc.quantity);
      await changeStock({ session, product: doc.product, warehouse: doc.warehouse, batch: doc.batch, delta });
      doc.status = 'approved';
      doc.approvedBy = req.user._id;
      await doc.save({ session });
      await InventoryMovement.create(
        [
          {
            product: doc.product,
            warehouse: doc.warehouse,
            type: doc.type,
            quantity: doc.quantity,
            reason: doc.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
    });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function inventoryHistory(req, res) {
  const q = {};
  for (const k of ['product', 'warehouse', 'type']) if (req.query[k]) q[k] = req.query[k];
  if (!req.query.warehouse && req.allowedWarehouseIds)
    q.$or = [
      { warehouse: { $in: req.allowedWarehouseIds } },
      { fromWarehouse: { $in: req.allowedWarehouseIds } },
      { toWarehouse: { $in: req.allowedWarehouseIds } },
    ];
  if (req.query.from || req.query.to)
    q.createdAt = {
      ...(req.query.from && { $gte: new Date(req.query.from) }),
      ...(req.query.to && { $lte: new Date(req.query.to) }),
    };
  res.json(
    await InventoryMovement.find(q)
      .populate('product', 'name sku')
      .populate('warehouse fromWarehouse toWarehouse', 'name code')
      .sort({ createdAt: -1 })
      .limit(500),
  );
}
function calculateSale(body) {
  const items = (body.items || []).map((i) => ({
    ...i,
    quantity: n(i.quantity),
    rate: n(i.rate),
    amount: n(i.quantity) * n(i.rate),
  }));
  const subtotal = items.reduce((a, i) => a + i.amount, 0);
  const discount = n(body.discount);
  const transport = n(body.transport);
  const taxRate = n(body.taxRate ?? body.tax);
  const taxable = Math.max(subtotal - discount + transport, 0);
  const taxAmount = (taxable * taxRate) / 100;
  const total = taxable + taxAmount;
  const payment = n(body.payment);
  return {
    ...body,
    items,
    subtotal,
    discount,
    transport,
    tax: taxAmount,
    grandTotal: total,
    total,
    payment,
    remaining: Math.max(total - payment, 0),
    status: payment >= total ? 'paid' : payment > 0 ? 'partial' : body.status || 'confirmed',
  };
}
export async function createProfessionalSale(req, res) {
  const data = calculateSale(req.body);
  if (!data.customer || !data.warehouse || !data.items.length)
    return res.status(400).json({ message: 'Customer, warehouse and items are required' });
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      data.invoiceNo = await nextNo(Sale, 'INV', 'invoiceNo');
      for (const i of data.items)
        await changeStock({
          session,
          product: i.product,
          warehouse: data.warehouse,
          batch: i.batch,
          delta: -i.quantity,
        });
      [sale] = await Sale.create([data], { session });
      if (data.payment > 0)
        await PaymentAllocation.create(
          [{ sale: sale._id, amount: data.payment, method: data.paymentMethod, createdBy: req.user._id }],
          { session },
        );
      if (data.remaining > 0) {
        const customer = await Customer.findByIdAndUpdate(
          data.customer,
          { $inc: { currentBalance: data.remaining } },
          { new: true, session },
        );
        if (
          n(customer.currentBalance) > n(customer.creditLimit) &&
          n(customer.creditLimit) > 0 &&
          req.user.role !== 'admin' &&
          req.user.role !== 'manager'
        )
          throw new Error('Credit limit exceeded; manager approval required');
        await Ledger.create(
          [
            {
              partyType: 'customer',
              party: data.customer,
              partyModel: 'Customer',
              type: 'credit',
              amount: data.remaining,
              description: `Invoice ${data.invoiceNo}`,
              referenceType: 'sale',
              referenceId: sale._id,
              balanceAfter: customer.currentBalance,
            },
          ],
          { session },
        );
      }
    });
    res.status(201).json(sale);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function allocatePayment(req, res) {
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale) throw new Error('Sale not found');
      const amount = n(req.body.amount);
      if (amount <= 0 || amount > n(sale.remaining)) throw new Error('Invalid payment amount');
      sale.payment = n(sale.payment) + amount;
      sale.remaining = n(sale.total) - n(sale.payment);
      sale.status = sale.remaining <= 0 ? 'paid' : 'partial';
      await sale.save({ session });
      await PaymentAllocation.create(
        [{ sale: sale._id, amount, method: req.body.method, reference: req.body.reference, createdBy: req.user._id }],
        { session },
      );
      const customer = await Customer.findByIdAndUpdate(
        sale.customer,
        { $inc: { currentBalance: -amount } },
        { new: true, session },
      );
      await Ledger.create(
        [
          {
            partyType: 'customer',
            party: sale.customer,
            partyModel: 'Customer',
            type: 'debit',
            amount,
            description: `Payment for ${sale.invoiceNo}`,
            referenceType: 'payment',
            referenceId: sale._id,
            balanceAfter: customer.currentBalance,
          },
        ],
        { session },
      );
    });
    res.json(sale);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function cancelSale(req, res) {
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale || sale.status === 'cancelled') throw new Error('Invalid sale');
      for (const i of sale.items)
        await changeStock({
          session,
          product: i.product,
          warehouse: sale.warehouse || req.body.warehouse,
          batch: i.batch,
          delta: i.quantity,
        });
      if (n(sale.remaining) > 0)
        await Customer.findByIdAndUpdate(sale.customer, { $inc: { currentBalance: -n(sale.remaining) } }, { session });
      sale.status = 'cancelled';
      sale.notes = `${sale.notes || ''}\nCancelled: ${req.body.reason || ''}`;
      await sale.save({ session });
    });
    res.json(sale);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function createSaleReturn(req, res) {
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      const sale = await Sale.findById(req.body.sale).session(session);
      if (!sale) throw new Error('Sale not found');
      const items = (req.body.items || []).map((i) => ({ ...i, amount: n(i.quantity) * n(i.rate) }));
      const total = items.reduce((a, i) => a + i.amount, 0);
      for (const i of items)
        await changeStock({
          session,
          product: i.product,
          warehouse: req.body.warehouse,
          batch: i.batch,
          delta: i.quantity,
        });
      [ret] = await SaleReturn.create(
        [
          {
            ...req.body,
            returnNo: await nextNo(SaleReturn, 'SR', 'returnNo'),
            customer: sale.customer,
            items,
            total,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      await Customer.findByIdAndUpdate(sale.customer, { $inc: { currentBalance: -total } }, { session });
    });
    res.status(201).json(ret);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function createQuotation(req, res) {
  const data = calculateSale(req.body);
  res.status(201).json(await Quotation.create({ ...data, quotationNo: await nextNo(Quotation, 'QTN', 'quotationNo') }));
}
export async function createChallan(req, res) {
  const sale = await Sale.findById(req.body.sale);
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  res.status(201).json(
    await DeliveryChallan.create({
      ...req.body,
      challanNo: await nextNo(DeliveryChallan, 'DC', 'challanNo'),
      customer: sale.customer,
      items: sale.items.map((i) => ({ product: i.product, name: i.name, quantity: i.quantity, unit: i.unit })),
    }),
  );
}
export async function salesWorkspace(req, res) {
  const [sales, returns, quotations, challans] = await Promise.all([
    Sale.find().populate('customer', 'name phone village').sort({ date: -1 }).limit(200),
    SaleReturn.find().populate('customer', 'name').sort({ createdAt: -1 }).limit(100),
    Quotation.find().populate('customer', 'name').sort({ createdAt: -1 }).limit(100),
    DeliveryChallan.find().populate('customer', 'name').sort({ createdAt: -1 }).limit(100),
  ]);
  res.json({ sales, returns, quotations, challans });
}
