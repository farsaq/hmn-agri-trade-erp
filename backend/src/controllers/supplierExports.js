import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Supplier, AuditLog, Setting } from '../models/index.js';
import { ProductTransferJob } from '../models/integrations.js';
import * as svc from '../services/integrations.js';

const escapeRegex = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bool = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
const num = (v) => (v === '' || v === undefined ? undefined : Number(v));
const date = (v) => (v ? new Date(v) : undefined);
const defaultColumns = [
  'supplierCode',
  'name',
  'company',
  'supplierType',
  'businessType',
  'phone',
  'whatsapp',
  'email',
  'cnic',
  'ntn',
  'gstNumber',
  'village',
  'taluka',
  'district',
  'city',
  'province',
  'country',
  'paymentTerms',
  'paymentMethod',
  'currency',
  'creditLimit',
  'openingBalance',
  'currentBalance',
  'status',
  'preferredSupplier',
  'blacklisted',
  'registrationDate',
  'lastPurchaseDate',
  'defaultWarehouse',
];
const allowedColumns = new Set([
  ...defaultColumns,
  'secondaryPhone',
  'emergencyContact',
  'taxNumber',
  'taxCategory',
  'contactPerson',
  'website',
  'address',
  'paymentCycle',
  'dueDays',
  'bankName',
  'accountTitle',
  'accountNumber',
  'iban',
  'branch',
  'swiftCode',
  'supplierRating',
  'deliveryTimeDays',
  'transportType',
  'reference',
  'notes',
]);

function parseColumns(value) {
  const cols = String(value || defaultColumns.join(','))
    .split(',')
    .map((x) => x.trim())
    .filter((x) => allowedColumns.has(x));
  return cols.length ? cols : defaultColumns;
}
function buildFilter(q = {}) {
  const f = {};
  if (q.search) {
    const r = new RegExp(escapeRegex(q.search), 'i');
    f.$or = [
      { supplierCode: r },
      { name: r },
      { company: r },
      { phone: r },
      { whatsapp: r },
      { email: r },
      { cnic: r },
      { ntn: r },
      { gstNumber: r },
    ];
  }
  for (const k of [
    'supplierCode',
    'supplierType',
    'businessType',
    'village',
    'taluka',
    'district',
    'city',
    'province',
    'country',
    'paymentTerms',
    'paymentMethod',
    'currency',
    'status',
  ])
    if (q[k]) f[k] = new RegExp(`^${escapeRegex(q[k])}$`, 'i');
  if (q.company) f.company = new RegExp(escapeRegex(q.company), 'i');
  if (q.warehouse) f.defaultWarehouse = q.warehouse;
  if (q.preferredSupplier !== '') f.preferredSupplier = bool(q.preferredSupplier);
  if (q.blacklisted !== '') f.blacklisted = bool(q.blacklisted);
  if (q.hasGst === 'true') f.gstNumber = { $nin: ['', null] };
  if (q.hasGst === 'false')
    f.$and = [...(f.$and || []), { $or: [{ gstNumber: '' }, { gstNumber: null }, { gstNumber: { $exists: false } }] }];
  if (q.hasNtn === 'true') f.ntn = { $nin: ['', null] };
  if (q.hasNtn === 'false')
    f.$and = [...(f.$and || []), { $or: [{ ntn: '' }, { ntn: null }, { ntn: { $exists: false } }] }];
  const numeric = [
    ['minCreditLimit', 'maxCreditLimit', 'creditLimit'],
    ['minOutstanding', 'maxOutstanding', 'currentBalance'],
  ];
  for (const [minK, maxK, field] of numeric) {
    const a = num(q[minK]),
      b = num(q[maxK]);
    if (Number.isFinite(a) || Number.isFinite(b))
      f[field] = { ...(Number.isFinite(a) ? { $gte: a } : {}), ...(Number.isFinite(b) ? { $lte: b } : {}) };
  }
  const ranges = [
    ['registrationFrom', 'registrationTo', 'registrationDate'],
    ['lastPurchaseFrom', 'lastPurchaseTo', 'lastPurchaseDate'],
  ];
  for (const [fromK, toK, field] of ranges) {
    const a = date(q[fromK]),
      b = date(q[toK]);
    if ((a && !Number.isNaN(a)) || (b && !Number.isNaN(b))) {
      f[field] = {
        ...(a && !Number.isNaN(a) ? { $gte: a } : {}),
        ...(b && !Number.isNaN(b) ? { $lte: new Date(new Date(b).setHours(23, 59, 59, 999)) } : {}),
      };
    }
  }
  if (q.ids) {
    const ids = String(q.ids)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (ids.length) f._id = { $in: ids };
  }
  return f;
}
function valueFor(s, k) {
  if (k === 'defaultWarehouse')
    return s.defaultWarehouse
      ? `${s.defaultWarehouse.name || ''}${s.defaultWarehouse.code ? ` (${s.defaultWarehouse.code})` : ''}`
      : '';
  if (['registrationDate', 'lastPurchaseDate'].includes(k))
    return s[k] ? new Date(s[k]).toISOString().slice(0, 10) : '';
  if (
    k === 'bankName' ||
    k === 'accountTitle' ||
    k === 'accountNumber' ||
    k === 'iban' ||
    k === 'branch' ||
    k === 'swiftCode'
  )
    return s.bankDetails?.[k] || '';
  return s[k] ?? '';
}
function mapRows(list, cols) {
  return list.map((s) => Object.fromEntries(cols.map((k) => [k, valueFor(s, k)])));
}
async function getData(query) {
  const columns = parseColumns(query.columns);
  const filter = buildFilter(query);
  const sortField = [
    'name',
    'company',
    'currentBalance',
    'registrationDate',
    'lastPurchaseDate',
    'supplierCode',
  ].includes(query.sortBy)
    ? query.sortBy
    : 'name';
  const sortDir = query.sortDir === 'desc' ? -1 : 1;
  const rows = await Supplier.find(filter)
    .populate('defaultWarehouse', 'name code')
    .sort({ [sortField]: sortDir })
    .lean();
  const mapped = mapRows(rows, columns);
  const summary = {
    totalSuppliers: rows.length,
    totalOutstanding: rows.reduce((a, x) => a + Number(x.currentBalance || 0), 0),
    totalCreditLimit: rows.reduce((a, x) => a + Number(x.creditLimit || 0), 0),
    active: rows.filter((x) => x.status === 'active').length,
    inactive: rows.filter((x) => x.status !== 'active').length,
    preferred: rows.filter((x) => x.preferredSupplier).length,
    blacklisted: rows.filter((x) => x.blacklisted).length,
  };
  return { rows, mapped, columns, summary, filter };
}
function xmlEscape(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
function xmlBuffer(rows) {
  const body = rows
    .map(
      (r) =>
        `  <supplier>\n${Object.entries(r)
          .map(([k, v]) => `    <${k}>${xmlEscape(v)}</${k}>`)
          .join('\n')}\n  </supplier>`,
    )
    .join('\n');
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<suppliers>\n${body}\n</suppliers>`);
}
async function pdfBuffer(data, opts = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        layout: opts.orientation === 'landscape' ? 'landscape' : 'portrait',
        size: 'A4',
        userPassword: opts.pdfPassword || undefined,
        ownerPassword: opts.pdfPassword ? `${opts.pdfPassword}-owner` : undefined,
        permissions: opts.pdfPassword ? { printing: 'highResolution', copying: false, modifying: false } : undefined,
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const company = (await Setting.findOne({ key: 'company' }).lean())?.value || {};
      doc
        .fontSize(18)
        .fillColor('#14532d')
        .text(company.name || 'HMN Agri Trade', { align: 'center' });
      doc
        .fontSize(9)
        .fillColor('#475569')
        .text(company.location || 'Hala, Sindh, Pakistan', { align: 'center' });
      doc.moveDown();
      if (opts.watermark) {
        doc
          .save()
          .fillColor('#e2e8f0')
          .fontSize(44)
          .opacity(0.22)
          .rotate(-32, { origin: [300, 400] })
          .text(opts.watermark, 80, 380, { align: 'center' })
          .restore()
          .opacity(1);
      }
      doc.fillColor('#111827').fontSize(14).text('Supplier Export Report');
      doc
        .fontSize(9)
        .text(
          `Generated: ${new Date().toLocaleString()} | Records: ${data.summary.totalSuppliers} | Outstanding: PKR ${data.summary.totalOutstanding.toLocaleString()}`,
        );
      doc.moveDown();
      const widths = Math.max(70, Math.floor((doc.page.width - 72) / Math.max(1, Math.min(data.columns.length, 6))));
      const cols = data.columns.slice(0, 6);
      const drawHeader = () => {
        doc.fontSize(7).fillColor('#fff');
        doc.rect(36, doc.y, doc.page.width - 72, 20).fill('#166534');
        let x = 40;
        for (const c of cols) {
          doc.text(c, x, doc.y - 15, { width: widths - 4 });
          x += widths;
        }
        doc.moveDown(1.5);
        doc.fillColor('#111827');
      };
      drawHeader();
      for (const row of data.mapped) {
        if (doc.y > doc.page.height - 55) {
          doc.addPage();
          drawHeader();
        }
        let x = 40,
          y = doc.y;
        for (const c of cols) {
          doc
            .fontSize(7)
            .text(String(row[c] ?? '').slice(0, 45), x, y, { width: widths - 4, height: 24, ellipsis: true });
          x += widths;
        }
        doc.moveDown(1.6);
        doc
          .moveTo(36, doc.y)
          .lineTo(doc.page.width - 36, doc.y)
          .strokeColor('#e2e8f0')
          .stroke();
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
async function makeBuffer(format, data, query) {
  if (format === 'xlsx') return svc.formattedWorkbookBuffer(data.mapped, 'Suppliers');
  if (format === 'csv') return svc.workbookBuffer(data.mapped, 'Suppliers', 'csv');
  if (format === 'json')
    return Buffer.from(
      JSON.stringify({ generatedAt: new Date(), summary: data.summary, suppliers: data.mapped }, null, 2),
    );
  if (format === 'xml') return xmlBuffer(data.mapped);
  if (format === 'pdf')
    return pdfBuffer(data, {
      orientation: query.orientation,
      watermark: query.watermark,
      pdfPassword: query.pdfPassword,
    });
  throw new Error('Unsupported supplier export format');
}
function mime(format) {
  return (
    {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      pdf: 'application/pdf',
      zip: 'application/zip',
    }[format] || 'application/octet-stream'
  );
}
async function audit(req, format, count, filters) {
  await AuditLog.create({
    user: req.user?._id,
    action: 'SUPPLIERS_EXPORTED',
    entity: 'Supplier',
    description: `Exported ${count} suppliers as ${format}`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { format, count, filters },
  });
}

export async function previewSupplierExport(req, res) {
  const data = await getData(req.query);
  res.json({
    summary: data.summary,
    columns: data.columns,
    sample: data.mapped.slice(0, 25),
    estimatedFormats: ['xlsx', 'csv', 'pdf', 'json', 'xml', 'zip'],
  });
}
export async function supplierExport(req, res) {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const data = await getData(req.query);
  if (format === 'zip') {
    res.setHeader('Content-Disposition', `attachment; filename=suppliers-${new Date().toISOString().slice(0, 10)}.zip`);
    res.type('application/zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (e) => res.destroy(e));
    archive.pipe(res);
    for (const f of ['xlsx', 'csv', 'json', 'xml', 'pdf'])
      archive.append(await makeBuffer(f, data, req.query), { name: `suppliers.${f}` });
    archive.append(Buffer.from(JSON.stringify(data.summary, null, 2)), { name: 'summary.json' });
    await audit(req, 'zip', data.summary.totalSuppliers, req.query);
    return archive.finalize();
  }
  if (!['xlsx', 'csv', 'pdf', 'json', 'xml'].includes(format))
    return res.status(400).json({ message: 'Unsupported format' });
  const buffer = await makeBuffer(format, data, req.query);
  await audit(req, format, data.summary.totalSuppliers, req.query);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=suppliers-${new Date().toISOString().slice(0, 10)}.${format}`,
  );
  res.type(mime(format)).send(buffer);
}

const jobDir = path.resolve('storage', 'supplier-exports');
async function saveFile(name, buffer) {
  await fsp.mkdir(jobDir, { recursive: true });
  const p = path.join(jobDir, `${Date.now()}-${name}`);
  await fsp.writeFile(p, buffer);
  return p;
}
async function runJob(id, query, user, meta) {
  const started = Date.now();
  try {
    await ProductTransferJob.findByIdAndUpdate(id, {
      status: 'processing',
      stage: 'Querying suppliers',
      progress: 15,
      startedAt: new Date(),
    });
    const job = await ProductTransferJob.findById(id);
    if (job?.cancelRequested) return;
    const data = await getData(query);
    await ProductTransferJob.findByIdAndUpdate(id, {
      stage: 'Generating file',
      progress: 55,
      totalRows: data.summary.totalSuppliers,
      processedRows: data.summary.totalSuppliers,
    });
    const buffer = await makeBuffer(query.format, data, query);
    const fileName = `suppliers-${new Date().toISOString().replace(/[:.]/g, '-')}.${query.format}`;
    const filePath = await saveFile(fileName, buffer);
    await ProductTransferJob.findByIdAndUpdate(id, {
      status: 'completed',
      stage: 'Completed',
      progress: 100,
      fileName,
      filePath,
      fileSize: buffer.length,
      successRows: data.summary.totalSuppliers,
      result: { summary: data.summary },
      durationMs: Date.now() - started,
      completedAt: new Date(),
    });
    await AuditLog.create({
      user: user?._id,
      action: 'SUPPLIER_EXPORT_JOB_COMPLETED',
      entity: 'Supplier',
      description: `Background supplier export completed`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { jobId: id, format: query.format, count: data.summary.totalSuppliers },
    });
  } catch (e) {
    await ProductTransferJob.findByIdAndUpdate(id, {
      status: 'failed',
      stage: 'Failed',
      progress: 100,
      errorDetails: [{ message: e.message }],
      durationMs: Date.now() - started,
      completedAt: new Date(),
    });
  }
}
export async function createSupplierExportJob(req, res) {
  const format = String(req.body.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'csv', 'pdf', 'json', 'xml'].includes(format))
    return res.status(400).json({ message: 'Unsupported background export format' });
  const filters = { ...(req.body.filters || {}), format };
  const job = await ProductTransferJob.create({
    entity: 'supplier',
    type: 'export',
    format,
    status: 'queued',
    stage: 'Queued',
    filters,
    createdBy: req.user._id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  setImmediate(() => runJob(job._id, filters, req.user, { ip: req.ip, userAgent: req.get('user-agent') }));
  res.status(202).json(job);
}
export async function supplierExportJobs(req, res) {
  const q = { entity: 'supplier', type: 'export' };
  if (req.query.status) q.status = req.query.status;
  const items = await ProductTransferJob.find(q)
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ items });
}
export async function cancelSupplierExportJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.cancelRequested = true;
  job.status = 'cancelled';
  job.stage = 'Cancelled';
  job.completedAt = new Date();
  await job.save();
  res.json(job);
}
export async function retrySupplierExportJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.status = 'queued';
  job.stage = 'Queued for retry';
  job.progress = 0;
  job.cancelRequested = false;
  job.errorDetails = [];
  job.attempts = (job.attempts || 0) + 1;
  await job.save();
  setImmediate(() =>
    runJob(job._id, { ...(job.filters || {}), format: job.format }, req.user, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }),
  );
  res.json(job);
}
export async function deleteSupplierExportJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (job.filePath && fs.existsSync(job.filePath)) await fsp.unlink(job.filePath).catch(() => {});
  await job.deleteOne();
  res.json({ success: true });
}
export async function downloadSupplierExportJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job || !job.filePath || !fs.existsSync(job.filePath))
    return res.status(404).json({ message: 'Export file not available' });
  res.download(path.resolve(job.filePath), job.fileName || 'suppliers-export');
}
