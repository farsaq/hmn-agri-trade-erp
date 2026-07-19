import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { AuditLog, Customer, Ledger, Sale } from '../models/index.js';
import { parseCustomer, formatCnic } from '../validators/customer.js';
import {
  auditCustomer,
  buildCustomerQuery,
  CUSTOMER_SORTS,
  createCustomerTransactional,
  customerAgeing,
  restoreCustomer as restoreCustomerService,
  softDeleteCustomer,
  updateCustomerTransactional,
} from '../services/customerService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const fileUrl = (req) => (req.file ? `/uploads/customers/${req.file.filename}` : undefined);
const safePage = (value) => Math.max(1, Number.parseInt(value, 10) || 1);
const safeLimit = (value) => Math.min(100, Math.max(1, Number.parseInt(value, 10) || 20));

export const listCustomers = asyncHandler(async (req, res) => {
  const page = safePage(req.query.page);
  const limit = safeLimit(req.query.limit);
  const filter = buildCustomerQuery(req.query);
  const sort = CUSTOMER_SORTS.has(req.query.sort) ? req.query.sort : '-createdAt';
  const [items, total] = await Promise.all([
    Customer.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Customer.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1,
    },
    filters: { sort },
  });
});
export const listDeletedCustomers = asyncHandler(async (req, res) => {
  const page = safePage(req.query.page);
  const limit = safeLimit(req.query.limit);
  const filter = buildCustomerQuery(req.query, { deleted: true });
  const [items, total] = await Promise.all([
    Customer.find(filter)
      .sort('-deletedAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Customer.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
export const createCustomer = asyncHandler(async (req, res) => {
  const data = parseCustomer(req.body);
  if (req.file) data.photo = fileUrl(req);
  const customer = await createCustomerTransactional(data, req.user?._id);
  await auditCustomer(req, 'CUSTOMER_CREATED', customer);
  res.status(201).json({ success: true, data: customer });
});
export const updateCustomer = asyncHandler(async (req, res) => {
  const data = parseCustomer(req.body, { partial: true });
  if (req.file) data.photo = fileUrl(req);
  const before = await Customer.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!before) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  const customer = await updateCustomerTransactional(req.params.id, data, req.user?._id);
  await auditCustomer(req, 'CUSTOMER_UPDATED', customer, { before, after: customer.toObject() });
  res.json({ success: true, data: customer });
});
export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await softDeleteCustomer(req.params.id, req.user?._id);
  await auditCustomer(req, 'CUSTOMER_SOFT_DELETED', customer);
  res.json({ success: true, message: 'Customer moved to deleted records' });
});
export const restoreCustomer = asyncHandler(async (req, res) => {
  const customer = await restoreCustomerService(req.params.id, req.user?._id);
  await auditCustomer(req, 'CUSTOMER_RESTORED', customer);
  res.json({ success: true, data: customer });
});
export const customerDetail = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  const [ledger, sales, ageing] = await Promise.all([
    Ledger.find({ party: req.params.id }).sort({ date: -1, createdAt: -1 }),
    Sale.find({ customer: req.params.id }).sort({ date: -1 }).limit(100),
    customerAgeing(req.params.id),
  ]);
  const creditWarning = customer.creditLimit > 0 && customer.currentBalance > customer.creditLimit;
  res.json({
    success: true,
    data: {
      customer: { ...customer.toObject(), formattedCnic: formatCnic(customer.cnic) },
      ledger,
      sales,
      ageing,
      creditWarning,
      availableCredit: Math.max((customer.creditLimit || 0) - (customer.currentBalance || 0), 0),
    },
  });
});
export const timeline = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const customer = await Customer.findOne({ _id: id, isDeleted: false }).lean();
  if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  const [ledger, sales, audits] = await Promise.all([
    Ledger.find({ party: id }).lean(),
    Sale.find({ customer: id }).lean(),
    AuditLog.find({ entity: 'Customer', entityId: id }).lean(),
  ]);
  const events = [
    ...ledger.map((x) => ({ kind: 'ledger', at: x.date || x.createdAt, data: x })),
    ...sales.map((x) => ({ kind: 'sale', at: x.date || x.createdAt, data: x })),
    ...audits.map((x) => ({ kind: 'audit', at: x.createdAt, data: x })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ success: true, data: events });
});
export const ageing = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: await customerAgeing(req.params.id, req.query.asOf ? new Date(req.query.asOf) : new Date()),
  }),
);
export const addAttachment = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  if (!req.file) throw new AppError('Attachment required', { statusCode: 400, code: 'ATTACHMENT_REQUIRED' });
  customer.attachments.push({
    url: fileUrl(req),
    name: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
  await customer.save();
  await auditCustomer(req, 'CUSTOMER_ATTACHMENT_ADDED', customer, { name: req.file.originalname });
  res.status(201).json({ success: true, data: customer.attachments.at(-1) });
});
export const removeAttachment = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  const item = customer.attachments.id(req.params.attachmentId);
  if (!item) throw new AppError('Attachment not found', { statusCode: 404, code: 'ATTACHMENT_NOT_FOUND' });
  const local = path.join(process.cwd(), String(item.url).replace(/^\//, ''));
  if (fs.existsSync(local)) fs.unlinkSync(local);
  item.deleteOne();
  await customer.save();
  await auditCustomer(req, 'CUSTOMER_ATTACHMENT_REMOVED', customer);
  res.json({ success: true });
});
export const statement = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  const entries = await Ledger.find({ party: req.params.id }).sort({ date: 1, createdAt: 1 });
  res.json({
    success: true,
    data: {
      company: 'HMN Agri Trade',
      generatedAt: new Date(),
      customer,
      entries,
      closingBalance: customer.currentBalance,
    },
  });
});
export const statementPdf = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  const entries = await Ledger.find({ party: req.params.id }).sort({ date: 1, createdAt: 1 }).lean();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${customer.customerCode}-statement.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(18).text('HMN Agri Trade', { align: 'center' });
  doc.fontSize(14).text('Customer Statement', { align: 'center' }).moveDown();
  doc.fontSize(10).text(`Customer: ${customer.name}`);
  doc.text(`Code: ${customer.customerCode}`);
  doc.text(`Phone: ${customer.phone}`);
  if (customer.cnic) doc.text(`CNIC: ${formatCnic(customer.cnic)}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`).moveDown();
  doc.fontSize(9).text('Date                  Type        Amount          Balance        Description');
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  for (const e of entries) {
    if (doc.y > 740) doc.addPage();
    doc.text(
      `${new Date(e.date).toLocaleDateString().padEnd(20)} ${String(e.type).padEnd(10)} ${String(e.amount).padEnd(15)} ${String(e.balanceAfter ?? '').padEnd(14)} ${e.description || ''}`,
    );
  }
  doc
    .moveDown()
    .fontSize(11)
    .text(`Closing Balance: PKR ${Number(customer.currentBalance || 0).toFixed(2)}`, { align: 'right' });
  doc.end();
});
