import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import multer from 'multer';
import crypto from 'crypto';
import { Expense, Sale, Purchase, Customer, Supplier } from '../models/index.js';
import { CompanyProfile } from '../models/enterprise.js';
import { WarehouseStock, ExpenseCategory, Quotation, DeliveryChallan, PaymentReceipt } from '../models/operations.js';
import { sendMail } from '../services/mail.js';
import { createNotification, writeAudit } from './governance.js';

const n = (v) => Number(v || 0);
const categories = ['Fuel', 'Salary', 'Transport', 'Warehouse', 'Electricity', 'Office', 'Repair', 'Miscellaneous'];
const safe = (s) => String(s ?? '').replace(/[<>]/g, '');
const money = (v) => `PKR ${n(v).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const uploads = 'uploads/expenses';
fs.mkdirSync(uploads, { recursive: true });
export const expenseUpload = multer({
  storage: multer.diskStorage({
    destination: uploads,
    filename: (_, f, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(f.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function nextNumber(prefix, Model, field) {
  const y = new Date().getFullYear();
  const count = await Model.countDocuments({ [field]: new RegExp(`^${prefix}-${y}-`) });
  return `${prefix}-${y}-${String(count + 1).padStart(6, '0')}`;
}
export async function seedExpenseCategories() {
  for (const name of categories)
    await ExpenseCategory.updateOne(
      { name },
      { $setOnInsert: { name, code: name.slice(0, 4).toUpperCase() } },
      { upsert: true },
    );
}
export async function listExpenseCategories(req, res) {
  await seedExpenseCategories();
  res.json(await ExpenseCategory.find({ active: true }).sort({ name: 1 }));
}
export async function createExpenseCategory(req, res) {
  res.status(201).json(await ExpenseCategory.create(req.body));
}
export async function listExpenses(req, res) {
  const q = {};
  if (req.query.category) q.category = req.query.category;
  if (req.query.status) q.status = req.query.status;
  if (req.query.from || req.query.to)
    q.date = {
      ...(req.query.from && { $gte: new Date(req.query.from) }),
      ...(req.query.to && { $lte: new Date(`${req.query.to}T23:59:59`) }),
    };
  const rows = await Expense.find(q)
    .populate('warehouse', 'name code')
    .populate('approvedBy createdBy', 'name')
    .sort({ date: -1, createdAt: -1 });
  const monthly = await Expense.aggregate([
    {
      $match: {
        date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        status: { $ne: 'rejected' },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  res.json({ rows, monthlyTotal: monthly[0]?.total || 0 });
}
export async function createExpense(req, res) {
  const data = {
    ...req.body,
    amount: n(req.body.amount),
    expenseNo: await nextNumber('EXP', Expense, 'expenseNo'),
    createdBy: req.user._id,
    attachments: (req.files || []).map((f) => `/uploads/expenses/${f.filename}`),
  };
  if (data.status === 'approved' || data.status === 'paid') {
    data.approvedBy = req.user._id;
    data.approvedAt = new Date();
  }
  const doc = await Expense.create(data);
  await writeAudit({
    req,
    action: 'EXPENSE_CREATED',
    entity: 'Expense',
    entityId: doc._id,
    description: `Created expense ${doc.expenseNo}`,
    after: doc,
  });
  if (doc.status === 'pending')
    await createNotification({
      audienceRoles: ['admin', 'manager', 'accountant'],
      type: 'expense-approval',
      severity: 'warning',
      title: 'Expense approval required',
      message: `${doc.expenseNo}: ${doc.category} — PKR ${Number(doc.amount).toLocaleString()}`,
      link: '/admin/expenses',
      sourceEntity: 'Expense',
      sourceId: doc._id,
    });
  res.status(201).json(doc);
}
export async function updateExpense(req, res) {
  const doc = await Expense.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Expense not found' });
  Object.assign(doc, req.body);
  if (req.files?.length) doc.attachments.push(...req.files.map((f) => `/uploads/expenses/${f.filename}`));
  await doc.save();
  res.json(doc);
}
export async function approveExpense(req, res) {
  const before = await Expense.findById(req.params.id).lean();
  const doc = await Expense.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status || 'approved', approvedBy: req.user._id, approvedAt: new Date() },
    { new: true },
  );
  if (!doc) return res.status(404).json({ message: 'Expense not found' });
  await writeAudit({
    req,
    action: 'EXPENSE_APPROVAL',
    entity: 'Expense',
    entityId: doc._id,
    description: `Expense ${doc.expenseNo} ${doc.status}`,
    before,
    after: doc,
  });
  await createNotification({
    user: doc.createdBy,
    type: 'expense-approval',
    severity: doc.status === 'approved' ? 'success' : 'critical',
    title: `Expense ${doc.status}`,
    message: `${doc.expenseNo} has been ${doc.status}`,
    link: '/admin/expenses',
    sourceEntity: 'Expense',
    sourceId: doc._id,
  });
  res.json(doc);
}
export async function deleteExpense(req, res) {
  const doc = await Expense.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Expense not found' });
  res.json({ success: true });
}

function rangeFrom(period, from, to) {
  if (from || to)
    return { from: from ? new Date(from) : new Date(0), to: to ? new Date(`${to}T23:59:59`) : new Date() };
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'daily') return { from: d, to: new Date() };
  if (period === 'weekly') {
    const x = new Date(d);
    x.setDate(x.getDate() - 6);
    return { from: x, to: new Date() };
  }
  if (period === 'yearly') return { from: new Date(d.getFullYear(), 0, 1), to: new Date() };
  return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date() };
}
export async function buildAdvancedReport(req) {
  const { from, to } = rangeFrom(req.query.period || 'monthly', req.query.from, req.query.to);
  const match = { date: { $gte: from, $lte: to } };
  const [
    sales,
    purchases,
    expenses,
    stocks,
    customerLedger,
    supplierLedger,
    villages,
    productProfit,
    expenseByCategory,
  ] = await Promise.all([
    Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          paid: { $sum: '$payment' },
          remaining: { $sum: '$remaining' },
          tax: { $sum: '$tax' },
        },
      },
    ]),
    Purchase.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          paid: { $sum: '$payment' },
          remaining: { $sum: '$remaining' },
          tax: { $sum: '$tax' },
        },
      },
    ]),
    Expense.aggregate([
      { $match: { ...match, status: { $ne: 'rejected' } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    WarehouseStock.find()
      .populate('product', 'name sku category unit purchasePrice salePrice')
      .populate('warehouse', 'name code'),
    Customer.find().select('name village phone currentBalance creditLimit').sort({ currentBalance: -1 }),
    Supplier.find().select('name company phone currentBalance paymentTerms').sort({ currentBalance: -1 }),
    Sale.aggregate([
      { $match: match },
      { $group: { _id: { $ifNull: ['$village', 'Unknown'] }, sales: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { sales: -1 } },
    ]),
    Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$items.product',
          name: { $first: { $ifNull: ['$items.name', '$p.name'] } },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.amount' },
          cost: { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$p.purchasePrice', 0] }] } },
        },
      },
      { $project: { name: 1, quantity: 1, revenue: 1, cost: 1, profit: { $subtract: ['$revenue', '$cost'] } } },
      { $sort: { profit: -1 } },
    ]),
    Expense.aggregate([
      { $match: { ...match, status: { $ne: 'rejected' } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Promise.resolve(null),
  ]);
  const sv = sales[0] || {},
    pv = purchases[0] || {},
    ev = expenses[0] || {};
  const inventory = stocks.map((s) => ({
    product: s.product?.name,
    sku: s.product?.sku,
    warehouse: s.warehouse?.name,
    quantity: s.quantity,
    averageCost: s.averageCost,
    value: n(s.quantity) * n(s.averageCost),
  }));
  const inventoryValue = inventory.reduce((a, x) => a + x.value, 0);
  const profit = n(sv.total) - n(pv.total) - n(ev.total);
  const cashFlow = {
    inflows: n(sv.paid),
    outflows: n(pv.paid) + n(ev.total),
    net: n(sv.paid) - n(pv.paid) - n(ev.total),
  };
  return {
    period: { from, to },
    summary: {
      sales: n(sv.total),
      purchases: n(pv.total),
      expenses: n(ev.total),
      profit,
      cashFlow,
      inventoryValue,
      salesTax: n(sv.tax),
      purchaseTax: n(pv.tax),
      netTax: n(sv.tax) - n(pv.tax),
    },
    stock: inventory,
    customerLedger,
    supplierLedger,
    villages,
    productProfit,
    expenseByCategory,
    tax: { salesTax: n(sv.tax), purchaseTax: n(pv.tax), netTax: n(sv.tax) - n(pv.tax) },
  };
}
export async function advancedReports(req, res) {
  res.json(await buildAdvancedReport(req));
}
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export async function exportReport(req, res) {
  const data = await buildAdvancedReport(req);
  const format = req.params.format;
  const rows = [
    ['Metric', 'Value'],
    ['Sales', data.summary.sales],
    ['Purchases', data.summary.purchases],
    ['Expenses', data.summary.expenses],
    ['Profit/Loss', data.summary.profit],
    ['Cash inflows', data.summary.cashFlow.inflows],
    ['Cash outflows', data.summary.cashFlow.outflows],
    ['Net cash flow', data.summary.cashFlow.net],
    ['Inventory valuation', data.summary.inventoryValue],
    ['Net tax', data.summary.netTax],
    [],
    ['Product', 'Warehouse', 'Quantity', 'Value'],
    ...data.stock.map((x) => [x.product, x.warehouse, x.quantity, x.value]),
  ];
  if (format === 'csv') {
    res.setHeader('Content-Disposition', 'attachment; filename=hmn-report.csv');
    res.type('text/csv').send(rows.map((r) => r.map(csvEscape).join(',')).join('\n'));
    return;
  }
  if (format === 'excel') {
    const html = `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${safe(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    res.setHeader('Content-Disposition', 'attachment; filename=hmn-report.xls');
    res.type('application/vnd.ms-excel').send(html);
    return;
  }
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Disposition', 'attachment; filename=hmn-report.pdf');
  res.type('application/pdf');
  doc.pipe(res);
  doc.fontSize(22).text('HMN Agri Trade — Advanced Report');
  doc
    .moveDown()
    .fontSize(10)
    .text(`${data.period.from.toLocaleDateString()} to ${data.period.to.toLocaleDateString()}`);
  doc.moveDown();
  for (const [k, v] of Object.entries(data.summary)) {
    if (typeof v === 'object') continue;
    doc.fontSize(11).text(`${k}: ${money(v)}`);
  }
  doc.moveDown().fontSize(15).text('Inventory valuation');
  data.stock
    .slice(0, 35)
    .forEach((x) => doc.fontSize(9).text(`${x.product} | ${x.warehouse} | ${x.quantity} | ${money(x.value)}`));
  doc.end();
}

async function company() {
  return (
    (await CompanyProfile.findOne()) || {
      name: 'HMN Agri Trade',
      phone: '',
      email: '',
      address: 'Hala, Sindh, Pakistan',
      terms: 'Thank you for your business.',
      signature: '',
    }
  );
}
async function saleDoc(id) {
  return Sale.findById(id).populate('customer').populate('items.product').populate('warehouse');
}
async function pdfBuffer(build) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc)
      .then(() => doc.end())
      .catch(reject);
  });
}
async function addHeader(doc, title, ref, companyData, qrText, barcodeText) {
  const logoPath = companyData.logo ? path.resolve(String(companyData.logo).replace(/^\//, '')) : null;
  if (logoPath && fs.existsSync(logoPath)) doc.image(logoPath, 42, 40, { fit: [70, 55] });
  doc
    .fontSize(22)
    .fillColor('#064e3b')
    .text(companyData.name || 'HMN Agri Trade');
  doc
    .fontSize(9)
    .fillColor('#334155')
    .text(companyData.address || '');
  doc.text(companyData.phone || '');
  doc.moveDown();
  doc.fontSize(18).fillColor('#0f172a').text(title, { align: 'right' });
  doc.fontSize(10).text(ref, { align: 'right' });
  const qr = await QRCode.toBuffer(qrText, { width: 90 });
  doc.image(qr, 42, 115, { width: 70 });
  const bar = await bwipjs.toBuffer({ bcid: 'code128', text: barcodeText, scale: 2, height: 8, includetext: true });
  doc.image(bar, 390, 112, { width: 160 });
  doc.moveDown(7);
}
function table(doc, items) {
  doc.fontSize(9).fillColor('#0f172a');
  doc.text('Item', 42, 220);
  doc.text('Qty', 300, 220);
  doc.text('Rate', 365, 220);
  doc.text('Amount', 460, 220);
  doc.moveTo(42, 235).lineTo(553, 235).stroke();
  let y = 245;
  for (const i of items) {
    doc.text(i.name || i.product?.name || 'Product', 42, y, { width: 240 });
    doc.text(String(i.quantity), 300, y);
    doc.text(money(i.rate), 365, y);
    doc.text(money(i.amount || n(i.quantity) * n(i.rate)), 460, y);
    y += 22;
    if (y > 680) {
      doc.addPage();
      y = 60;
    }
  }
  return y;
}
async function buildInvoicePdf(sale, type = 'invoice') {
  const co = await company();
  return pdfBuffer(async (doc) => {
    const title =
      type === 'quotation'
        ? 'QUOTATION'
        : type === 'challan'
          ? 'DELIVERY CHALLAN'
          : type === 'receipt'
            ? 'PAYMENT RECEIPT'
            : 'TAX INVOICE';
    await addHeader(
      doc,
      title,
      sale.invoiceNo || sale.quotationNo || sale.challanNo || sale.receiptNo,
      co,
      JSON.stringify({
        type,
        id: sale._id,
        reference: sale.invoiceNo || sale.quotationNo || sale.challanNo || sale.receiptNo,
      }),
      sale.invoiceNo || sale.quotationNo || sale.challanNo || sale.receiptNo || String(sale._id),
    );
    doc.fontSize(11).text(`Customer: ${sale.customer?.name || ''}`);
    doc.text(`Phone: ${sale.customer?.phone || ''}`);
    doc.text(`Address: ${sale.customer?.address || sale.customer?.village || ''}`);
    doc.text(`Date: ${new Date(sale.date || sale.createdAt).toLocaleDateString()}`);
    let y = table(doc, sale.items || []);
    doc
      .moveTo(330, y + 8)
      .lineTo(553, y + 8)
      .stroke();
    const totals = [
      ['Subtotal', sale.subtotal],
      ['Discount', sale.discount],
      ['Transport', sale.transport],
      ['Tax', sale.tax],
      ['Grand Total', sale.total || sale.grandTotal],
      ['Paid', sale.payment],
      ['Remaining', sale.remaining],
    ];
    y += 18;
    for (const [k, v] of totals) {
      if (v !== undefined) {
        doc.text(k, 360, y);
        doc.text(money(v), 460, y);
        y += 18;
      }
    }
    doc.fontSize(9).text(co.terms || 'Terms and conditions apply.', 42, 730, { width: 330 });
    doc.text('Authorized signature', 410, 730);
    if (co.signature && fs.existsSync(co.signature)) doc.image(co.signature, 420, 680, { width: 100 });
  });
}
export async function invoicePdf(req, res) {
  const sale = await saleDoc(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Invoice not found' });
  const b = await buildInvoicePdf(sale, 'invoice');
  res.setHeader('Content-Disposition', `inline; filename=${sale.invoiceNo || 'invoice'}.pdf`);
  res.type('application/pdf').send(b);
}
export async function challanPdf(req, res) {
  const ch = await DeliveryChallan.findById(req.params.id).populate('customer').populate('items.product');
  if (!ch) return res.status(404).json({ message: 'Challan not found' });
  const b = await buildInvoicePdf(ch, 'challan');
  res.type('application/pdf').send(b);
}
export async function quotationPdf(req, res) {
  const q = await Quotation.findById(req.params.id).populate('customer').populate('items.product');
  if (!q) return res.status(404).json({ message: 'Quotation not found' });
  const b = await buildInvoicePdf(q, 'quotation');
  res.type('application/pdf').send(b);
}
export async function createReceipt(req, res) {
  const sale = await Sale.findById(req.params.id).populate('customer');
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  const receipt = await PaymentReceipt.create({
    receiptNo: await nextNumber('RCP', PaymentReceipt, 'receiptNo'),
    sale: sale._id,
    customer: sale.customer._id,
    amount: n(req.body.amount),
    method: req.body.method || 'cash',
    reference: req.body.reference,
    notes: req.body.notes,
    createdBy: req.user._id,
  });
  res.status(201).json(receipt);
}
export async function receiptPdf(req, res) {
  const receipt = await PaymentReceipt.findById(req.params.id).populate('customer').populate('sale');
  if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
  const object = {
    ...receipt.toObject(),
    items: [
      {
        name: `Payment against ${receipt.sale?.invoiceNo || 'invoice'}`,
        quantity: 1,
        rate: receipt.amount,
        amount: receipt.amount,
      },
    ],
    total: receipt.amount,
    payment: receipt.amount,
    remaining: 0,
  };
  const b = await buildInvoicePdf(object, 'receipt');
  res.type('application/pdf').send(b);
}
export async function emailInvoice(req, res) {
  const sale = await saleDoc(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Invoice not found' });
  const to = req.body.to || sale.customer?.email;
  if (!to) return res.status(400).json({ message: 'Customer email required' });
  const attachment = await buildInvoicePdf(sale, 'invoice');
  await sendMail({
    to,
    subject: `HMN Invoice ${sale.invoiceNo}`,
    text: `Please find invoice ${sale.invoiceNo} attached.`,
    html: `<p>Please find invoice <b>${safe(sale.invoiceNo)}</b> attached.</p>`,
    attachments: [{ filename: `${sale.invoiceNo}.pdf`, content: attachment }],
  });
  res.json({ success: true });
}
export async function whatsappInvoice(req, res) {
  const sale = await saleDoc(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Invoice not found' });
  const phone = (req.body.phone || sale.customer?.whatsapp || sale.customer?.phone || '').replace(/\D/g, '');
  sale.shareToken = sale.shareToken || crypto.randomBytes(24).toString('hex');
  await sale.save();
  const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5000}`;
  const pdf = `${base}/api/public/invoices/${sale._id}/${sale.shareToken}.pdf`;
  const text = encodeURIComponent(`HMN Agri Trade invoice ${sale.invoiceNo}\nTotal: ${money(sale.total)}\n${pdf}`);
  res.json({ url: `https://wa.me/${phone}?text=${text}` });
}

export async function publicInvoicePdf(req, res) {
  const sale = await saleDoc(req.params.id);
  if (!sale || !sale.shareToken || sale.shareToken !== req.params.token)
    return res.status(404).json({ message: 'Shared invoice not found' });
  const b = await buildInvoicePdf(sale, 'invoice');
  res.setHeader('Content-Disposition', `inline; filename=${sale.invoiceNo || 'invoice'}.pdf`);
  res.type('application/pdf').send(b);
}
