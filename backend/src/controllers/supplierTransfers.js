import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { ProductTransferJob } from '../models/integrations.js';
import { AuditLog } from '../models/index.js';
import { importSuppliers } from './integrations.js';
import * as svc from '../services/integrations.js';

const baseDir = path.resolve('storage', 'supplier-transfers');
const esc = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function ensureDir() {
  await fsp.mkdir(baseDir, { recursive: true });
}
async function writeFile(name, buffer) {
  await ensureDir();
  const safe = String(name || 'supplier-import.xlsx').replace(/[^a-zA-Z0-9._-]/g, '_');
  const p = path.join(baseDir, `${Date.now()}-${safe}`);
  await fsp.writeFile(p, buffer);
  return p;
}
async function update(id, patch) {
  return ProductTransferJob.findByIdAndUpdate(id, patch, { new: true });
}
function fakeResponse(done) {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      done({ statusCode: this.statusCode, data });
      return this;
    },
    send(data) {
      done({ statusCode: this.statusCode, data });
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    type() {
      return this;
    },
  };
}
async function callSupplierImport(file, body, user, meta) {
  return new Promise((resolve, reject) => {
    const req = { file, body, user, ip: meta.ip, get: () => meta.userAgent };
    const res = fakeResponse(resolve);
    importSuppliers(req, res).catch(reject);
  });
}
async function audit(user, action, description, meta, metadata = {}) {
  await AuditLog.create({
    user: user?._id,
    action,
    entity: 'Supplier',
    description,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata,
  });
}

async function runImportJob(id, file, body, user, meta) {
  const started = Date.now();
  try {
    await update(id, {
      status: 'processing',
      stage: 'Validating supplier file',
      progress: 12,
      startedAt: new Date(),
      attempts: 1,
    });
    const job = await ProductTransferJob.findById(id);
    if (job?.cancelRequested) return;
    const preview = await callSupplierImport(
      file,
      { duplicateStrategy: body.duplicateStrategy || 'skip', dryRun: 'true', confirm: 'false' },
      user,
      meta,
    );
    const p = preview.data || {};
    await update(id, {
      stage: 'Validation complete',
      progress: 42,
      totalRows: p.totalRows || p.total || 0,
      processedRows: Math.floor((p.totalRows || p.total || 0) * 0.4),
      failedRows: p.invalidRows || 0,
      duplicateRows: p.duplicateCount || 0,
      errorDetails: (p.errors || []).slice(0, 10000),
      warnings: (p.warnings || []).slice(0, 10000),
      result: {
        previewSummary: {
          totalRows: p.totalRows || p.total || 0,
          validRows: p.validRows || p.valid || 0,
          invalidRows: p.invalidRows || 0,
          insertCount: p.insertCount || 0,
          updateCount: p.updateCount || 0,
          skipCount: p.skipCount || 0,
          duplicateCount: p.duplicateCount || 0,
        },
      },
    });
    const fresh = await ProductTransferJob.findById(id);
    if (fresh?.cancelRequested) return;
    await update(id, {
      stage: 'Importing suppliers transactionally',
      progress: 58,
      processedRows: Math.floor((p.totalRows || p.total || 0) * 0.55),
    });
    const result = await callSupplierImport(
      file,
      {
        duplicateStrategy: body.duplicateStrategy || 'skip',
        dryRun: 'false',
        confirm: 'true',
        confirmationFingerprint: p.confirmationFingerprint,
      },
      user,
      meta,
    );
    const out = result.data || {};
    if (result.statusCode >= 400) throw new Error(out.message || 'Supplier import failed');
    const errs = out.errors || p.errors || [],
      warns = out.warnings || p.warnings || [];
    const total = out.total || p.totalRows || p.total || 0;
    const status = errs.length ? 'partial' : 'completed';
    await update(id, {
      status,
      stage: status === 'partial' ? 'Completed with validation issues' : 'Completed',
      progress: 100,
      totalRows: total,
      processedRows: total,
      successRows: (out.inserted || 0) + (out.updated || 0),
      failedRows: new Set(errs.map((e) => e.row).filter(Boolean)).size,
      duplicateRows: out.duplicateCount || p.duplicateCount || out.skipped || 0,
      result: { ...out, validationSummary: p.validationReport || p },
      errorDetails: errs.slice(0, 10000),
      warnings: warns.slice(0, 10000),
      durationMs: Date.now() - started,
      completedAt: new Date(),
    });
    await audit(user, 'SUPPLIER_IMPORT_JOB_COMPLETED', 'Background supplier import completed', meta, {
      jobId: id,
      total,
      inserted: out.inserted || 0,
      updated: out.updated || 0,
      skipped: out.skipped || 0,
      status,
    });
  } catch (e) {
    await update(id, {
      status: 'failed',
      stage: 'Failed',
      progress: 100,
      errorDetails: [{ message: e.message }],
      durationMs: Date.now() - started,
      completedAt: new Date(),
    });
    await audit(user, 'SUPPLIER_IMPORT_JOB_FAILED', 'Background supplier import failed', meta, {
      jobId: id,
      error: e.message,
    });
  }
}

export async function createSupplierImportJob(req, res) {
  if (!req.file) return res.status(400).json({ message: 'Supplier spreadsheet required' });
  const raw = await svc.parseWorkbook(req.file.buffer);
  if (!raw.length) return res.status(400).json({ message: 'Spreadsheet has no data rows' });
  if (raw.length > 25000)
    return res.status(400).json({ message: 'Maximum 25000 supplier rows are allowed per background import' });
  const strategy = ['skip', 'update', 'error'].includes(req.body.duplicateStrategy)
    ? req.body.duplicateStrategy
    : 'skip';
  const originalFilePath = await writeFile(req.file.originalname, req.file.buffer);
  const job = await ProductTransferJob.create({
    entity: 'supplier',
    type: 'import',
    status: 'queued',
    stage: 'Queued',
    originalFileName: req.file.originalname,
    originalFilePath,
    totalRows: raw.length,
    duplicateStrategy: strategy,
    createdBy: req.user._id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await audit(
    req.user,
    'SUPPLIER_IMPORT_JOB_CREATED',
    'Supplier import job queued',
    { ip: req.ip, userAgent: req.get('user-agent') },
    { jobId: job._id, file: req.file.originalname, totalRows: raw.length, strategy },
  );
  setImmediate(() =>
    runImportJob(
      job._id,
      { originalname: req.file.originalname, buffer: req.file.buffer },
      { duplicateStrategy: strategy },
      req.user,
      { ip: req.ip, userAgent: req.get('user-agent') },
    ),
  );
  res.status(202).json(job);
}

export async function supplierTransferJobs(req, res) {
  const q = { entity: 'supplier' };
  if (req.query.type) q.type = req.query.type;
  if (req.query.status) q.status = req.query.status;
  if (req.query.search) {
    const r = new RegExp(esc(req.query.search), 'i');
    q.$or = [{ fileName: r }, { originalFileName: r }, { stage: r }];
  }
  const page = Math.max(1, Number(req.query.page || 1)),
    limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const [items, total] = await Promise.all([
    ProductTransferJob.find(q)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ProductTransferJob.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}
export async function supplierTransferJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' }).populate(
    'createdBy',
    'name email role',
  );
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
}
export async function cancelSupplierTransferJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (['completed', 'partial', 'failed', 'cancelled'].includes(job.status))
    return res.status(400).json({ message: 'Job is already finished' });
  job.cancelRequested = true;
  job.status = 'cancelled';
  job.stage = 'Cancelled by administrator';
  job.completedAt = new Date();
  await job.save();
  await audit(
    req.user,
    'SUPPLIER_TRANSFER_JOB_CANCELLED',
    'Supplier transfer job cancelled',
    { ip: req.ip, userAgent: req.get('user-agent') },
    { jobId: job._id, type: job.type },
  );
  res.json(job);
}
export async function retrySupplierTransferJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (job.attempts >= job.maxAttempts) return res.status(400).json({ message: 'Maximum retry attempts reached' });
  job.status = 'queued';
  job.stage = 'Queued for retry';
  job.progress = 0;
  job.cancelRequested = false;
  job.errorDetails = [];
  job.warnings = [];
  job.completedAt = undefined;
  job.attempts = (job.attempts || 0) + 1;
  await job.save();
  if (job.type === 'import') {
    if (!job.originalFilePath || !fs.existsSync(job.originalFilePath))
      return res.status(410).json({ message: 'Original import file is no longer available' });
    const buffer = await fsp.readFile(job.originalFilePath);
    setImmediate(() =>
      runImportJob(
        job._id,
        { originalname: job.originalFileName, buffer },
        { duplicateStrategy: job.duplicateStrategy || 'skip' },
        req.user,
        { ip: req.ip, userAgent: req.get('user-agent') },
      ),
    );
  } else return res.status(400).json({ message: 'Use supplier export retry endpoint for export jobs' });
  await audit(
    req.user,
    'SUPPLIER_TRANSFER_JOB_RETRIED',
    'Supplier transfer job retried',
    { ip: req.ip, userAgent: req.get('user-agent') },
    { jobId: job._id, type: job.type },
  );
  res.json(job);
}
export async function deleteSupplierTransferJob(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  for (const p of [job.filePath, job.originalFilePath]) if (p && fs.existsSync(p)) await fsp.unlink(p).catch(() => {});
  await audit(
    req.user,
    'SUPPLIER_TRANSFER_JOB_DELETED',
    'Supplier transfer history deleted',
    { ip: req.ip, userAgent: req.get('user-agent') },
    { jobId: job._id, type: job.type, status: job.status },
  );
  await job.deleteOne();
  res.json({ success: true });
}
export async function downloadSupplierTransferFile(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const original = req.query.original === 'true';
  const p = original ? job.originalFilePath : job.filePath;
  if (!p || !fs.existsSync(p)) return res.status(404).json({ message: 'File not available' });
  res.download(
    path.resolve(p),
    original ? job.originalFileName || 'supplier-import.xlsx' : job.fileName || 'supplier-export',
  );
}
const reportRows = (job) => [
  ...(job.errorDetails || []).map((x) => ({ type: 'error', row: x.row || '', message: x.message || '' })),
  ...(job.warnings || []).map((x) => ({ type: 'warning', row: x.row || '', message: x.message || '' })),
];
export async function downloadSupplierFailedRows(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const rows = (job.errorDetails || []).map((x) => ({ row: x.row || '', reason: x.message || '' }));
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const buffer =
    format === 'xlsx'
      ? await svc.formattedWorkbookBuffer(rows, 'Failed Supplier Rows')
      : await svc.workbookBuffer(rows, 'Failed Supplier Rows', 'csv');
  res.setHeader('Content-Disposition', `attachment; filename=supplier-job-${job._id}-failed.${format}`);
  res
    .type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv')
    .send(buffer);
}
export async function downloadSupplierValidationReport(req, res) {
  const job = await ProductTransferJob.findOne({ _id: req.params.id, entity: 'supplier' });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const format = String(req.query.format || 'csv').toLowerCase(),
    rows = reportRows(job);
  if (format === 'xlsx') {
    const buffer = await svc.formattedWorkbookBuffer(rows, 'Supplier Validation');
    res.setHeader('Content-Disposition', `attachment; filename=supplier-job-${job._id}-validation.xlsx`);
    return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
  }
  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Disposition', `attachment; filename=supplier-job-${job._id}-validation.pdf`);
    res.type('application/pdf');
    doc.pipe(res);
    doc.fontSize(18).text('HMN Supplier Import Validation Report');
    doc
      .moveDown()
      .fontSize(10)
      .text(
        `Job: ${job._id}\nStatus: ${job.status}\nTotal rows: ${job.totalRows}\nSuccess: ${job.successRows}\nFailed: ${job.failedRows}\nDuplicates: ${job.duplicateRows}\nDuration: ${job.durationMs || 0} ms`,
      );
    doc.moveDown();
    for (const r of rows.slice(0, 3000)) {
      doc.text(`${r.type.toUpperCase()} | Row ${r.row || '-'} | ${r.message}`);
      if (doc.y > 740) doc.addPage();
    }
    return doc.end();
  }
  const buffer = await svc.workbookBuffer(rows, 'Supplier Validation', 'csv');
  res.setHeader('Content-Disposition', `attachment; filename=supplier-job-${job._id}-validation.csv`);
  res.type('text/csv').send(buffer);
}
