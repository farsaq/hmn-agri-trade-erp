import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { google } from 'googleapis';
import { Customer, Supplier, Product, Sale, Purchase, Expense, Ledger, AuditLog, User } from '../models/index.js';
import { WarehouseStock } from '../models/operations.js';
import { BackupRecord } from '../models/integrations.js';

const MODEL_MAP = {
  customers: Customer,
  suppliers: Supplier,
  products: Product,
  sales: Sale,
  purchases: Purchase,
  expenses: Expense,
  ledger: Ledger,
  warehouseStock: WarehouseStock,
  users: User,
  auditLogs: AuditLog,
};
const BACKUP_DIR = path.resolve('backups');
let timer = null;
let nextRunAt = null;
let schedulerRunning = false;

export const backupModels = () => MODEL_MAP;
export const checksum = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function driveConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY && process.env.GOOGLE_DRIVE_FOLDER_ID,
  );
}
function driveClient() {
  if (!driveConfigured()) throw new Error('Google Drive credentials are not configured');
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: String(process.env.GOOGLE_DRIVE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}
export async function collectBackupData() {
  const collections = {};
  const manifest = {};
  for (const [name, Model] of Object.entries(MODEL_MAP)) {
    const rows = await Model.find().lean();
    collections[name] = rows;
    manifest[name] = { count: rows.length };
  }
  return {
    format: 'hmn-erp-backup',
    version: 2,
    createdAt: new Date().toISOString(),
    database: mongoose.connection.name,
    manifest,
    collections,
  };
}
export async function writeLocalBackup(payload, name) {
  await ensureBackupDir();
  const filePath = path.join(BACKUP_DIR, name);
  const buffer = Buffer.from(JSON.stringify(payload, null, 2));
  await fs.writeFile(filePath, buffer);
  return { path: filePath, size: buffer.length, checksum: checksum(buffer), buffer };
}
export async function uploadBackupToDrive(localPath, name) {
  const drive = driveClient();
  const result = await drive.files.create({
    requestBody: {
      name,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      appProperties: { app: 'HMN-ERP', type: 'database-backup' },
    },
    media: { mimeType: 'application/json', body: fsSync.createReadStream(localPath) },
    fields: 'id,name,size,md5Checksum,createdTime,webViewLink',
  });
  return result.data;
}
export async function downloadDriveBackup(fileId) {
  const drive = driveClient();
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}
export async function deleteDriveBackup(fileId) {
  if (!fileId) return;
  await driveClient().files.delete({ fileId });
}

export async function readBackupRecord(record) {
  if (record.path) {
    try {
      return await fs.readFile(record.path);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (record.fileId) return downloadDriveBackup(record.fileId);
  throw new Error('Backup file is unavailable locally and on Google Drive');
}
export function parseAndValidateBackup(buffer, expectedChecksum) {
  const actual = checksum(buffer);
  if (expectedChecksum && actual !== expectedChecksum) throw new Error('Backup checksum verification failed');
  const payload = JSON.parse(buffer.toString('utf8'));
  if (payload.format !== 'hmn-erp-backup' || ![1, 2].includes(Number(payload.version)))
    throw new Error('Unsupported or invalid backup format');
  if (!payload.collections || typeof payload.collections !== 'object')
    throw new Error('Backup collections are missing');
  return { payload, checksum: actual };
}
export async function createBackup({
  provider = 'local',
  createdBy = null,
  automatic = false,
  reason = 'manual',
} = {}) {
  const payload = await collectBackupData();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `hmn-backup-${stamp}.json`;
  const local = await writeLocalBackup(payload, name);
  let drive = null;
  let actualProvider = 'local';
  if (provider === 'drive') {
    drive = await uploadBackupToDrive(local.path, name);
    actualProvider = 'google-drive';
  }
  return BackupRecord.create({
    name,
    provider: actualProvider,
    fileId: drive?.id,
    path: local.path,
    size: local.size,
    checksum: local.checksum,
    status: 'created',
    collections: Object.keys(payload.collections),
    manifest: payload.manifest,
    version: payload.version,
    automatic,
    reason,
    createdBy,
  });
}
export async function previewRestore(record) {
  const buffer = await readBackupRecord(record);
  const { payload } = parseAndValidateBackup(buffer, record.checksum);
  const current = {};
  const incoming = {};
  for (const [name, Model] of Object.entries(MODEL_MAP)) {
    current[name] = await Model.countDocuments();
    incoming[name] = Array.isArray(payload.collections?.[name]) ? payload.collections[name].length : 0;
  }
  return {
    backupId: record._id,
    name: record.name,
    createdAt: payload.createdAt,
    provider: record.provider,
    checksumValid: true,
    current,
    incoming,
    changes: Object.keys(MODEL_MAP).map((name) => ({
      collection: name,
      current: current[name],
      incoming: incoming[name],
      difference: incoming[name] - current[name],
    })),
  };
}
export async function restoreRecord(record, { collections = null, createdBy = null } = {}) {
  const buffer = await readBackupRecord(record);
  const { payload } = parseAndValidateBackup(buffer, record.checksum);
  await createBackup({ provider: 'local', createdBy, automatic: true, reason: `pre-restore:${record._id}` });
  const selected = Array.isArray(collections) && collections.length ? collections : Object.keys(MODEL_MAP);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const name of selected) {
        const Model = MODEL_MAP[name];
        const rows = payload.collections?.[name];
        if (!Model || !Array.isArray(rows)) continue;
        await Model.deleteMany({}, { session });
        if (rows.length) await Model.insertMany(rows, { session, ordered: false });
      }
    });
  } finally {
    await session.endSession();
  }
  record.status = 'restored';
  record.restoredAt = new Date();
  record.restoreCollections = selected;
  await record.save();
  return record;
}
export async function verifyRecord(record) {
  const buffer = await readBackupRecord(record);
  parseAndValidateBackup(buffer, record.checksum);
  record.status = 'verified';
  record.verifiedAt = new Date();
  record.error = undefined;
  await record.save();
  return record;
}
export async function deleteBackupRecord(record) {
  if (record.path) {
    try {
      await fs.unlink(record.path);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (record.fileId) await deleteDriveBackup(record.fileId);
  await record.deleteOne();
}
export async function cleanupOldBackups({
  retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30),
  keepMinimum = Number(process.env.BACKUP_KEEP_MINIMUM || 5),
} = {}) {
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const records = await BackupRecord.find().sort({ createdAt: -1 });
  const removable = records
    .slice(keepMinimum)
    .filter((r) => r.createdAt < cutoff && !String(r.reason || '').startsWith('pre-restore:'));
  const errors = [];
  let deleted = 0;
  for (const r of removable) {
    try {
      await deleteBackupRecord(r);
      deleted++;
    } catch (e) {
      errors.push({ id: r._id, message: e.message });
    }
  }
  return { deleted, errors, retentionDays, keepMinimum };
}
export function schedulerStatus() {
  return {
    enabled: String(process.env.BACKUP_AUTO_ENABLED || 'false') === 'true',
    provider: process.env.BACKUP_AUTO_PROVIDER || 'local',
    intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 24),
    nextRunAt,
    running: schedulerRunning,
  };
}
export function startBackupScheduler() {
  if (String(process.env.BACKUP_AUTO_ENABLED || 'false') !== 'true') return schedulerStatus();
  const intervalMs = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24)) * 3600000;
  nextRunAt = new Date(Date.now() + intervalMs);
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await createBackup({
        provider: process.env.BACKUP_AUTO_PROVIDER || 'local',
        automatic: true,
        reason: 'scheduled',
      });
      await cleanupOldBackups();
    } catch (e) {
      console.error('Scheduled backup failed:', e.message);
    } finally {
      schedulerRunning = false;
      nextRunAt = new Date(Date.now() + intervalMs);
    }
  }, intervalMs);
  timer.unref?.();
  return schedulerStatus();
}
