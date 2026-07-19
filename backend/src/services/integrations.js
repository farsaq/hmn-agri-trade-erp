import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { v2 as cloudinary } from 'cloudinary';
import { google } from 'googleapis';
import Stripe from 'stripe';
import axios from 'axios';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

export const configured = {
  cloudinary: () =>
    Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  smtp: () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  sms: () => Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY),
  whatsapp: () => Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
  maps: () => Boolean(process.env.GOOGLE_MAPS_API_KEY),
  drive: () =>
    Boolean(
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
      process.env.GOOGLE_DRIVE_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_FOLDER_ID,
    ),
  stripe: () => Boolean(process.env.STRIPE_SECRET_KEY),
};
export function integrationStatus() {
  return Object.fromEntries(Object.entries(configured).map(([k, v]) => [k, v()]));
}
function setupCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}
export function buildCloudProcessing(options = {}) {
  const quality = ['auto:eco', 'auto:good', 'auto:best', 'auto'].includes(String(options.quality || ''))
    ? String(options.quality)
    : 'auto:good';
  const cropPreset = ['none', 'square', '16:9', 'custom', 'face'].includes(String(options.cropPreset || ''))
    ? String(options.cropPreset)
    : 'none';
  const targetWidth = Math.min(4096, Math.max(64, Number(options.targetWidth || 1600)));
  const targetHeight = Math.min(4096, Math.max(64, Number(options.targetHeight || 900)));
  const preserveExif = String(options.preserveExif || 'false') === 'true';
  const base = { quality, angle: 'auto', ...(preserveExif ? {} : { flags: 'strip_profile' }) };
  let main = { ...base };
  if (cropPreset === 'square')
    main = { ...base, width: targetWidth, height: targetWidth, crop: 'fill', gravity: 'auto' };
  if (cropPreset === '16:9')
    main = { ...base, width: targetWidth, height: Math.round((targetWidth * 9) / 16), crop: 'fill', gravity: 'auto' };
  if (cropPreset === 'custom')
    main = { ...base, width: targetWidth, height: targetHeight, crop: 'fill', gravity: 'auto' };
  if (cropPreset === 'face')
    main = { ...base, width: targetWidth, height: targetHeight, crop: 'fill', gravity: 'face' };
  if (cropPreset === 'none') main = { ...base, width: targetWidth, crop: 'limit' };
  const eager = [
    {
      ...base,
      width: 32,
      height: 32,
      crop: 'fill',
      gravity: cropPreset === 'face' ? 'face' : 'auto',
      effect: 'blur:800',
      fetch_format: 'webp',
      quality: 'auto:low',
    },
    {
      ...base,
      width: 320,
      height: 320,
      crop: 'fill',
      gravity: cropPreset === 'face' ? 'face' : 'auto',
      fetch_format: 'webp',
    },
    { ...base, width: 960, crop: 'limit', fetch_format: 'webp' },
    { ...main, fetch_format: 'webp' },
    { ...main, fetch_format: 'avif' },
  ];
  return { quality, cropPreset, targetWidth, targetHeight, preserveExif, main, eager };
}
export async function uploadCloud(file, folder = 'hmn/general', options = {}) {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  const isImage = String(file.mimetype || '').startsWith('image/');
  const data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const processing = buildCloudProcessing(options);
  const uploadOptions = {
    folder,
    resource_type: isImage ? 'image' : 'raw',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    filename_override: file.originalname,
    context: { original_filename: file.originalname, ...(options.context || {}) },
    tags: ['hmn-erp', String(options.purpose || options.context?.purpose || 'general')],
  };
  if (isImage) {
    uploadOptions.quality = processing.quality;
    uploadOptions.fetch_format = 'auto';
    uploadOptions.angle = 'auto';
    if (!processing.preserveExif) uploadOptions.flags = 'strip_profile';
    uploadOptions.transformation = [processing.main];
    uploadOptions.eager = processing.eager;
    uploadOptions.eager_async = false;
    uploadOptions.responsive_breakpoints = [
      {
        create_derived: true,
        bytes_step: 20000,
        min_width: 240,
        max_width: 1920,
        max_images: 5,
        transformation: { crop: 'limit', quality: processing.quality, fetch_format: 'auto' },
      },
    ];
  }
  const result = await cloudinary.uploader.upload(data, uploadOptions);
  return { ...result, _processing: processing };
}
export async function uploadCloudMany(files, folder = 'hmn/general', options = {}) {
  const concurrency = Math.min(6, Math.max(1, Number(options.concurrency || 3)));
  const results = new Array(files.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= files.length) return;
      const file = files[i];
      try {
        results[i] = { ok: true, file: file.originalname, result: await uploadCloud(file, folder, options) };
      } catch (error) {
        results[i] = { ok: false, file: file.originalname, error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return results;
}
export async function cloudFolderUsage(prefix = 'hmn') {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  const resources = [];
  let next_cursor;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      prefix,
      max_results: 500,
      next_cursor,
      resource_type: 'image',
    });
    resources.push(...page.resources);
    next_cursor = page.next_cursor;
  } while (next_cursor);
  const raw = [];
  next_cursor = undefined;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      prefix,
      max_results: 500,
      next_cursor,
      resource_type: 'raw',
    });
    raw.push(...page.resources);
    next_cursor = page.next_cursor;
  } while (next_cursor);
  const all = [...resources, ...raw],
    folders = {};
  for (const r of all) {
    const folder = String(r.asset_folder || r.folder || r.public_id.split('/').slice(0, -1).join('/') || 'root');
    const x = (folders[folder] ||= { folder, count: 0, bytes: 0 });
    x.count++;
    x.bytes += Number(r.bytes || 0);
  }
  return Object.values(folders).sort((a, b) => b.bytes - a.bytes);
}

export async function renameCloud(oldPublicId, newPublicId, resourceType = 'image') {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  return cloudinary.uploader.rename(oldPublicId, newPublicId, {
    resource_type: resourceType,
    overwrite: false,
    invalidate: true,
  });
}
export async function copyCloud(sourceUrl, newPublicId, resourceType = 'image') {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  return cloudinary.uploader.upload(sourceUrl, {
    public_id: newPublicId,
    resource_type: resourceType,
    overwrite: false,
    unique_filename: false,
    invalidate: true,
  });
}
export async function cloudResource(publicId, resourceType = 'image') {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  return cloudinary.api.resource(publicId, { resource_type: resourceType });
}
export async function listCloudResources(prefix = 'hmn') {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  const all = [];
  for (const resource_type of ['image', 'raw', 'video']) {
    let next_cursor;
    do {
      try {
        const page = await cloudinary.api.resources({
          type: 'upload',
          prefix,
          max_results: 500,
          next_cursor,
          resource_type,
        });
        all.push(...page.resources.map((x) => ({ ...x, resource_type })));
        next_cursor = page.next_cursor;
      } catch (e) {
        if (resource_type !== 'video') throw e;
        next_cursor = null;
      }
    } while (next_cursor);
  }
  return all;
}

export async function deleteCloud(publicId, resourceType = 'image') {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
export async function cloudinaryUsage() {
  if (!configured.cloudinary()) throw new Error('Cloudinary credentials are not configured');
  setupCloudinary();
  return cloudinary.api.usage();
}
export function mailTransport() {
  if (!configured.smtp()) throw new Error('SMTP credentials are not configured');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  return mailTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
    attachments,
  });
}
export async function sendSms({ to, message }) {
  if (!configured.sms()) throw new Error('SMS provider is not configured');
  return axios
    .post(
      process.env.SMS_API_URL,
      { to, message, sender: process.env.SMS_SENDER_ID || 'HMN' },
      { headers: { Authorization: `Bearer ${process.env.SMS_API_KEY}`, 'Content-Type': 'application/json' } },
    )
    .then((r) => r.data);
}
export async function sendWhatsApp({ to, message, documentUrl, filename }) {
  if (!configured.whatsapp()) throw new Error('WhatsApp Business credentials are not configured');
  const body = documentUrl
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { link: documentUrl, caption: message, filename: filename || 'document.pdf' },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } };
  return axios
    .post(
      `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      body,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } },
    )
    .then((r) => r.data);
}
export async function mapsDistance({ origins, destinations }) {
  if (!configured.maps()) throw new Error('Google Maps API key is not configured');
  return axios
    .get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: { origins, destinations, key: process.env.GOOGLE_MAPS_API_KEY },
    })
    .then((r) => r.data);
}
export async function mapsGeocode(address) {
  if (!configured.maps()) throw new Error('Google Maps API key is not configured');
  return axios
    .get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: process.env.GOOGLE_MAPS_API_KEY },
    })
    .then((r) => r.data);
}
function driveClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: String(process.env.GOOGLE_DRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}
export async function uploadDrive(localPath, name, mimeType = 'application/json') {
  if (!configured.drive()) throw new Error('Google Drive credentials are not configured');
  const drive = driveClient();
  const fsSync = await import('fs');
  return drive.files
    .create({
      requestBody: { name, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] },
      media: { mimeType, body: fsSync.createReadStream(localPath) },
      fields: 'id,name,size,md5Checksum,createdTime',
    })
    .then((r) => r.data);
}
export function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
export async function writeBackupFile(data, name) {
  const dir = path.resolve('backups');
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, name);
  const buf = Buffer.from(JSON.stringify(data, null, 2));
  await fs.writeFile(p, buf);
  return { path: p, size: buf.length, checksum: checksum(buf) };
}
export async function workbookBuffer(rows, sheet = 'Data', format = 'xlsx') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  const keys = rows.length ? Object.keys(rows[0]) : [];
  if (keys.length) {
    ws.columns = keys.map((key) => ({ header: key, key }));
    ws.addRows(rows);
  }
  if (format === 'csv') return Buffer.from(await wb.csv.writeBuffer());
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function formattedWorkbookBuffer(rows, sheet = 'Data') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HMN Agri Trade ERP';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  const keys = rows.length ? Object.keys(rows[0]) : [];
  ws.columns = keys.map((key) => ({
    header: key,
    key,
    width: Math.min(
      45,
      Math.max(12, key.length + 3, ...rows.slice(0, 500).map((r) => String(r[key] ?? '').length + 2)),
    ),
  }));
  if (rows.length) ws.addRows(rows);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
  header.alignment = { vertical: 'middle' };
  ws.autoFilter = keys.length
    ? { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: keys.length } }
    : undefined;
  ws.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 0)
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  const isXlsx = buffer?.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (isXlsx) await wb.xlsx.load(buffer);
  else await wb.csv.read(Readable.from(buffer));
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    let hasValue = false;
    headers.forEach((header, col) => {
      if (!header || col === 0) return;
      const value = row.getCell(col).value;
      const normalized = value && typeof value === 'object' && 'text' in value ? value.text : (value ?? '');
      item[header] = normalized;
      if (normalized !== '' && normalized !== null) hasValue = true;
    });
    if (hasValue) rows.push(item);
  });
  return rows;
}
export async function stripeCreate({ amount, currency = 'pkr', metadata = {} }) {
  if (!configured.stripe()) throw new Error('Stripe credentials are not configured');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe.paymentIntents.create({
    amount: Math.round(Number(amount) * 100),
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
}
export async function stripeRefund(paymentIntentId, amount) {
  if (!configured.stripe()) throw new Error('Stripe credentials are not configured');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount ? { amount: Math.round(Number(amount) * 100) } : {}),
  });
}
export function verifyHmac(raw, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || '')));
}
export async function deliverWebhook(endpoint, event, payload) {
  const timestamp = Date.now().toString();
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', endpoint.secret).update(`${timestamp}.${raw}`).digest('hex');
  return axios.post(endpoint.url, payload, {
    timeout: 10000,
    headers: {
      'X-HMN-Event': event,
      'X-HMN-Timestamp': timestamp,
      'X-HMN-Signature': signature,
      ...(endpoint.headers || {}),
    },
    validateStatus: () => true,
  });
}
