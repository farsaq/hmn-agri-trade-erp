import crypto from 'crypto';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import QRCode from 'qrcode';
import archiver from 'archiver';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { imageSize } from 'image-size';
import { Customer, Supplier, Product, Sale, Purchase, Expense, AuditLog } from '../models/index.js';
import { WarehouseStock, Category, ProductBatch } from '../models/operations.js';
import { Warehouse } from '../models/enterprise.js';
import {
  BackupRecord,
  PaymentTransaction,
  WebhookEndpoint,
  WebhookDelivery,
  IntegrationConfig,
  ProductTransferJob,
  CloudAsset,
  CloudUploadToken,
  CloudUploadAttempt,
  CloudAccessLog,
} from '../models/integrations.js';
import * as backupSvc from '../services/backup.js';
import * as svc from '../services/integrations.js';
import { createCustomerTransactional, updateCustomerTransactional } from '../services/customerService.js';
import { parseCustomer } from '../validators/customer.js';
const entities = {
  customers: Customer,
  suppliers: Supplier,
  products: Product,
  sales: Sale,
  purchases: Purchase,
  expenses: Expense,
  inventory: WarehouseStock,
};
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v !== undefined));

const customerColumns = [
  'name',
  'fatherName',
  'cnic',
  'phone',
  'whatsapp',
  'village',
  'taluka',
  'district',
  'address',
  'openingBalance',
  'currentBalance',
  'creditLimit',
  'status',
  'reference',
  'notes',
];
const customerHeaderAliases = {
  name: ['name', 'customer name', 'full name'],
  fatherName: ['fathername', 'father name', 'father_name'],
  cnic: ['cnic', 'cnic no', 'cnic number'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number'],
  whatsapp: ['whatsapp', 'whatsapp number'],
  village: ['village'],
  taluka: ['taluka', 'tehsil'],
  district: ['district'],
  address: ['address'],
  openingBalance: ['openingbalance', 'opening balance'],
  currentBalance: ['currentbalance', 'current balance'],
  creditLimit: ['creditlimit', 'credit limit'],
  status: ['status'],
  reference: ['reference', 'ref'],
  notes: ['notes', 'note'],
};
const normalizeHeader = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
const customerAliasLookup = Object.fromEntries(
  Object.entries(customerHeaderAliases).flatMap(([field, names]) => names.map((n) => [normalizeHeader(n), field])),
);
const normalizePhone = (v) =>
  String(v ?? '')
    .trim()
    .replace(/\.0$/, '');
const normalizeCustomerRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const field = customerAliasLookup[normalizeHeader(k)] || k;
    if (customerColumns.includes(field)) out[field] = typeof v === 'string' ? v.trim() : v;
  }
  out.cnic = String(out.cnic ?? '').replace(/\D/g, '');
  out.phone = normalizePhone(out.phone);
  out.whatsapp = normalizePhone(out.whatsapp);
  for (const k of ['openingBalance', 'currentBalance', 'creditLimit']) {
    if (out[k] !== '' && out[k] !== undefined) out[k] = Number(out[k]);
  }
  out.status = String(out.status || 'active').toLowerCase();
  if (
    (out.currentBalance === '' || out.currentBalance === undefined || Number.isNaN(out.currentBalance)) &&
    !Number.isNaN(out.openingBalance)
  )
    out.currentBalance = Number(out.openingBalance || 0);
  return clean(out);
};
const validateCustomerRow = (row, rowNumber) => {
  const errors = [];
  if (!row.name) errors.push('Name is required');
  if (!row.phone) errors.push('Phone is required');
  if (row.cnic && !/^\d{13}$/.test(row.cnic)) errors.push('CNIC must contain exactly 13 digits');
  if (!['active', 'inactive', 'blocked'].includes(row.status || 'active'))
    errors.push('Status must be active, inactive or blocked');
  for (const k of ['openingBalance', 'currentBalance', 'creditLimit'])
    if (row[k] !== undefined && !Number.isFinite(row[k])) errors.push(`${k} must be a number`);
  return errors.map((message) => ({ row: rowNumber, message }));
};
const escapeRegex = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const customerExportRows = (rows) => rows.map((x) => Object.fromEntries(customerColumns.map((k) => [k, x[k] ?? ''])));
export const customerTemplate = async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const example = [
    {
      name: 'Ali Ahmed',
      fatherName: 'Ahmed Khan',
      cnic: '4130412345671',
      phone: '03001234567',
      whatsapp: '03001234567',
      village: 'Hala',
      taluka: 'Hala',
      district: 'Matiari',
      address: 'Main Road',
      openingBalance: 0,
      currentBalance: 0,
      creditLimit: 100000,
      status: 'active',
      reference: 'Walk-in',
      notes: 'Example row - replace or delete',
    },
  ];
  const buffer = await svc.workbookBuffer(example, 'Customers', format);
  res.setHeader('Content-Disposition', `attachment; filename=customers-import-template.${format}`);
  res
    .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(buffer);
};
export const exportCustomers = async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.village) filter.village = new RegExp(escapeRegex(req.query.village), 'i');
  if (req.query.search) {
    const q = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: q }, { phone: q }, { cnic: q }, { village: q }];
  }
  const rows = await Customer.find(filter).sort({ name: 1 }).lean();
  const buffer = await svc.workbookBuffer(customerExportRows(rows), 'Customers', format);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=customers-${new Date().toISOString().slice(0, 10)}.${format}`,
  );
  res
    .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(buffer);
};
export const importCustomers = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Customer spreadsheet required' });
  const raw = await svc.parseWorkbook(req.file.buffer);
  if (!raw.length) return res.status(400).json({ message: 'Spreadsheet has no data rows' });
  if (raw.length > 5000) return res.status(400).json({ message: 'Maximum 5000 customer rows are allowed per import' });
  const strategy = ['skip', 'update', 'error'].includes(req.body.duplicateStrategy)
    ? req.body.duplicateStrategy
    : 'skip';
  const rows = raw.map(normalizeCustomerRow);
  const errors = [];
  const valid = [];
  const seenPhone = new Map(),
    seenCnic = new Map();
  rows.forEach((row, i) => {
    const rowNo = i + 2;
    errors.push(...validateCustomerRow(row, rowNo));
    if (row.phone) {
      if (seenPhone.has(row.phone))
        errors.push({
          row: rowNo,
          message: `Duplicate phone inside file; first seen at row ${seenPhone.get(row.phone)}`,
        });
      else seenPhone.set(row.phone, rowNo);
    }
    if (row.cnic) {
      if (seenCnic.has(row.cnic))
        errors.push({ row: rowNo, message: `Duplicate CNIC inside file; first seen at row ${seenCnic.get(row.cnic)}` });
      else seenCnic.set(row.cnic, rowNo);
    }
    if (!errors.some((e) => e.row === rowNo)) valid.push({ row: rowNo, data: row });
  });
  const phones = [...new Set(valid.map((x) => x.data.phone).filter(Boolean))],
    cnics = [...new Set(valid.map((x) => x.data.cnic).filter(Boolean))];
  const existing = await Customer.find({
    $or: [...(phones.length ? [{ phone: { $in: phones } }] : []), ...(cnics.length ? [{ cnic: { $in: cnics } }] : [])],
  }).lean();
  const byPhone = new Map(existing.filter((x) => x.phone).map((x) => [x.phone, x])),
    byCnic = new Map(existing.filter((x) => x.cnic).map((x) => [x.cnic, x]));
  const preview = [];
  let insertCount = 0,
    updateCount = 0,
    skipCount = 0;
  for (const item of valid) {
    const match = byCnic.get(item.data.cnic) || byPhone.get(item.data.phone);
    let action = 'insert';
    if (match) {
      action = strategy === 'update' ? 'update' : strategy === 'skip' ? 'skip' : 'error';
      if (action === 'error') errors.push({ row: item.row, message: 'Customer already exists in database' });
      if (action === 'update') updateCount++;
      if (action === 'skip') skipCount++;
    } else insertCount++;
    preview.push({
      row: item.row,
      action,
      name: item.data.name,
      phone: item.data.phone,
      cnic: item.data.cnic,
      village: item.data.village || '',
    });
  }
  const dryRun = req.body.dryRun === 'true' || req.body.confirm !== 'true';
  if (dryRun)
    return res.json({
      total: rows.length,
      valid: valid.length,
      invalidRows: new Set(errors.map((e) => e.row)).size,
      insertCount,
      updateCount,
      skipCount,
      errors,
      preview: preview.slice(0, 100),
      requiresConfirmation: true,
    });
  if (errors.length && strategy === 'error')
    return res.status(400).json({ message: 'Import cancelled because duplicate strategy is error', errors });
  let inserted = 0,
    updated = 0,
    skipped = 0;
  for (const item of valid) {
    if (errors.some((e) => e.row === item.row)) continue;
    const match = byCnic.get(item.data.cnic) || byPhone.get(item.data.phone);
    if (match) {
      if (strategy === 'skip') {
        skipped++;
        continue;
      }
      if (strategy === 'update') {
        const parsed = parseCustomer(item.data, { partial: true });
        await updateCustomerTransactional(match._id, parsed, req.user?._id);
        updated++;
        continue;
      }
    }
    const parsed = parseCustomer(item.data);
    await createCustomerTransactional(parsed, req.user?._id);
    inserted++;
  }
  await AuditLog.create({
    user: req.user?._id,
    action: 'CUSTOMERS_IMPORTED',
    entity: 'Customer',
    description: 'Customers imported from spreadsheet',
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      file: req.file.originalname,
      total: rows.length,
      inserted,
      updated,
      skipped,
      errorCount: errors.length,
      strategy,
    },
  });
  res
    .status(201)
    .json({ message: 'Customer import completed', total: rows.length, inserted, updated, skipped, errors });
};

const supplierColumns = [
  'supplierCode',
  'supplierType',
  'businessType',
  'registrationDate',
  'name',
  'company',
  'phone',
  'secondaryPhone',
  'emergencyContact',
  'whatsapp',
  'email',
  'cnic',
  'ntn',
  'taxNumber',
  'gstNumber',
  'salesTaxRegistered',
  'taxCategory',
  'contactPerson',
  'website',
  'facebook',
  'linkedin',
  'village',
  'taluka',
  'district',
  'city',
  'province',
  'country',
  'address',
  'paymentTerms',
  'currency',
  'paymentMethod',
  'paymentCycle',
  'dueDays',
  'creditLimit',
  'openingBalance',
  'currentBalance',
  'bankName',
  'accountTitle',
  'accountNumber',
  'iban',
  'branch',
  'swiftCode',
  'bankCountry',
  'bankCurrency',
  'cnicAttachment',
  'ntnAttachment',
  'agreementPdf',
  'bankChequeImage',
  'supplierRating',
  'blacklisted',
  'preferredSupplier',
  'ledgerId',
  'defaultExpenseAccount',
  'defaultPayableAccount',
  'defaultWarehouse',
  'deliveryTimeDays',
  'transportType',
  'status',
  'reference',
  'notes',
  'lastTransaction',
  'lastPurchaseDate',
];
const supplierHeaderAliases = {
  supplierCode: ['supplier code', 'suppliercode', 'code'],
  supplierType: ['supplier type', 'suppliertype', 'type'],
  businessType: ['business type', 'businesstype'],
  registrationDate: ['registration date', 'registrationdate'],
  name: ['name', 'supplier name', 'full name'],
  company: ['company', 'company name', 'business name'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number'],
  secondaryPhone: ['secondary phone', 'secondaryphone', 'alternate phone'],
  emergencyContact: ['emergency contact', 'emergencycontact'],
  whatsapp: ['whatsapp', 'whatsapp number'],
  email: ['email', 'email address'],
  cnic: ['cnic', 'cnic no', 'cnic number'],
  ntn: ['ntn', 'ntn number'],
  taxNumber: ['tax number', 'taxnumber'],
  gstNumber: ['gst number', 'gstnumber', 'gst'],
  salesTaxRegistered: ['sales tax registered', 'salestaxregistered', 'strn registered'],
  taxCategory: ['tax category', 'taxcategory'],
  contactPerson: ['contact person', 'contactperson'],
  website: ['website', 'web site'],
  facebook: ['facebook', 'facebook url'],
  linkedin: ['linkedin', 'linkedin url'],
  village: ['village'],
  taluka: ['taluka', 'tehsil'],
  district: ['district'],
  city: ['city'],
  province: ['province', 'state'],
  country: ['country'],
  address: ['address'],
  paymentTerms: ['payment terms', 'paymentterms'],
  currency: ['currency'],
  paymentMethod: ['payment method', 'paymentmethod'],
  paymentCycle: ['payment cycle', 'paymentcycle'],
  dueDays: ['due days', 'duedays'],
  creditLimit: ['credit limit', 'creditlimit'],
  openingBalance: ['opening balance', 'openingbalance'],
  currentBalance: ['current balance', 'currentbalance'],
  bankName: ['bank name', 'bankname'],
  accountTitle: ['account title', 'accounttitle'],
  accountNumber: ['account number', 'accountnumber', 'bank account'],
  iban: ['iban'],
  branch: ['branch', 'bank branch'],
  swiftCode: ['swift code', 'swiftcode', 'bic'],
  bankCountry: ['bank country', 'bankcountry'],
  bankCurrency: ['bank currency', 'bankcurrency'],
  cnicAttachment: ['cnic attachment', 'cnicattachment', 'cnic file'],
  ntnAttachment: ['ntn attachment', 'ntnattachment', 'ntn file'],
  agreementPdf: ['agreement pdf', 'agreementpdf', 'agreement'],
  bankChequeImage: ['bank cheque image', 'bankchequeimage', 'cheque image'],
  supplierRating: ['supplier rating', 'supplierrating', 'rating'],
  blacklisted: ['blacklisted', 'blacklist'],
  preferredSupplier: ['preferred supplier', 'preferredsupplier', 'preferred'],
  ledgerId: ['ledger id', 'ledgerid'],
  defaultExpenseAccount: ['default expense account', 'defaultexpenseaccount'],
  defaultPayableAccount: ['default payable account', 'defaultpayableaccount'],
  defaultWarehouse: ['default warehouse', 'defaultwarehouse', 'warehouse'],
  deliveryTimeDays: ['delivery time', 'delivery time days', 'deliverytimedays'],
  transportType: ['transport type', 'transporttype'],
  status: ['status'],
  reference: ['reference', 'ref'],
  notes: ['notes', 'note'],
  lastTransaction: ['last transaction', 'lasttransaction'],
  lastPurchaseDate: ['last purchase date', 'lastpurchasedate'],
};
const supplierAliasLookup = Object.fromEntries(
  Object.entries(supplierHeaderAliases).flatMap(([field, names]) => names.map((n) => [normalizeHeader(n), field])),
);
const boolValue = (v) =>
  ['true', '1', 'yes', 'y', 'on'].includes(
    String(v ?? '')
      .trim()
      .toLowerCase(),
  );
const dateValue = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d;
};
const normalizeSupplierRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const field = supplierAliasLookup[normalizeHeader(k)] || k;
    if (supplierColumns.includes(field)) out[field] = typeof v === 'string' ? v.trim() : v;
  }
  out.phone = normalizePhone(out.phone);
  out.secondaryPhone = normalizePhone(out.secondaryPhone);
  out.emergencyContact = normalizePhone(out.emergencyContact);
  out.whatsapp = normalizePhone(out.whatsapp);
  out.email = String(out.email || '')
    .trim()
    .toLowerCase();
  out.cnic = String(out.cnic || '').replace(/\D/g, '');
  out.ntn = String(out.ntn || '').trim();
  out.taxNumber = String(out.taxNumber || out.ntn || '').trim();
  for (const k of [
    'creditLimit',
    'openingBalance',
    'currentBalance',
    'dueDays',
    'supplierRating',
    'deliveryTimeDays',
  ]) {
    if (out[k] !== '' && out[k] !== undefined) out[k] = Number(out[k]);
    else out[k] = 0;
  }
  for (const k of ['salesTaxRegistered', 'blacklisted', 'preferredSupplier']) out[k] = boolValue(out[k]);
  for (const k of ['registrationDate', 'lastTransaction', 'lastPurchaseDate'])
    if (out[k] !== undefined) out[k] = dateValue(out[k]);
  out.status = String(out.status || 'active').toLowerCase();
  out.supplierType = String(out.supplierType || 'local').toLowerCase();
  out.country = out.country || 'Pakistan';
  out.currency = String(out.currency || 'PKR').toUpperCase();
  out.bankDetails = {
    bankName: out.bankName || '',
    accountTitle: out.accountTitle || '',
    accountNumber: out.accountNumber || '',
    iban: out.iban || '',
    branch: out.branch || '',
    swiftCode: out.swiftCode || '',
    bankCountry: out.bankCountry || '',
    bankCurrency: String(out.bankCurrency || out.currency || 'PKR').toUpperCase(),
  };
  out.documents = {
    cnicAttachment: out.cnicAttachment || '',
    ntnAttachment: out.ntnAttachment || '',
    agreementPdf: out.agreementPdf || '',
    bankChequeImage: out.bankChequeImage || '',
  };
  for (const k of [
    'bankName',
    'accountTitle',
    'accountNumber',
    'iban',
    'branch',
    'swiftCode',
    'bankCountry',
    'bankCurrency',
    'cnicAttachment',
    'ntnAttachment',
    'agreementPdf',
    'bankChequeImage',
  ])
    delete out[k];
  return clean(out);
};
const SUPPLIER_CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CNY', 'JPY', 'CAD', 'AUD'];
const SUPPLIER_PAYMENT_METHODS = ['cash', 'bank', 'cheque', 'card', 'online', 'credit', 'other', ''];
const SUPPLIER_PAYMENT_CYCLES = ['immediate', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom', ''];
const normalizeComparable = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const normalizePhoneDigits = (v) => String(v ?? '').replace(/\D/g, '');
const validPhone = (v) => {
  const d = normalizePhoneDigits(v);
  return !v || /^\d{10,15}$/.test(d);
};
const validIban = (v) => {
  if (!v) return true;
  const x = String(v).replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(x);
};
const validSwift = (v) => !v || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(String(v).replace(/\s/g, ''));
const validVillage = (v) => !v || /^[\p{L}\p{N} .,'()\-/]{2,100}$/u.test(String(v).trim());
const validateSupplierRow = (row, rowNumber) => {
  const errors = [],
    warnings = [];
  if (!row.name) errors.push('Supplier name is required');
  if (!row.phone) errors.push('Phone number is required');
  for (const [field, value] of [
    ['phone', row.phone],
    ['whatsapp', row.whatsapp],
    ['secondaryPhone', row.secondaryPhone],
    ['emergencyContact', row.emergencyContact],
  ])
    if (value && !validPhone(value)) errors.push(`${field} must contain 10 to 15 digits`);
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Email address is invalid');
  if (row.cnic && !/^\d{13}$/.test(row.cnic)) errors.push('CNIC must contain exactly 13 digits');
  if (row.ntn && !/^[A-Z0-9\-]{5,20}$/i.test(row.ntn)) errors.push('NTN format is invalid');
  if (row.gstNumber && !/^[A-Z0-9\-\/]{4,30}$/i.test(row.gstNumber)) errors.push('GST number format is invalid');
  if (!['active', 'inactive', 'blocked'].includes(row.status || 'active'))
    errors.push('Status must be active, inactive or blocked');
  if (!['local', 'international'].includes(row.supplierType || 'local'))
    errors.push('Supplier type must be local or international');
  if (!SUPPLIER_CURRENCIES.includes(String(row.currency || 'PKR').toUpperCase()))
    errors.push(`Currency must be one of: ${SUPPLIER_CURRENCIES.join(', ')}`);
  if (!SUPPLIER_PAYMENT_METHODS.includes(String(row.paymentMethod || '').toLowerCase()))
    errors.push(`Payment method must be one of: ${SUPPLIER_PAYMENT_METHODS.filter(Boolean).join(', ')}`);
  if (!SUPPLIER_PAYMENT_CYCLES.includes(String(row.paymentCycle || '').toLowerCase()))
    errors.push(`Payment cycle must be one of: ${SUPPLIER_PAYMENT_CYCLES.filter(Boolean).join(', ')}`);
  for (const k of [
    'creditLimit',
    'openingBalance',
    'currentBalance',
    'dueDays',
    'supplierRating',
    'deliveryTimeDays',
  ]) {
    if (!Number.isFinite(row[k])) errors.push(`${k} must be a number`);
    else if (
      ['creditLimit', 'openingBalance', 'currentBalance', 'dueDays', 'deliveryTimeDays'].includes(k) &&
      row[k] < 0
    )
      errors.push(`${k} cannot be negative`);
  }
  if (row.supplierRating < 0 || row.supplierRating > 5) errors.push('supplierRating must be between 0 and 5');
  if (!validIban(row.bankDetails?.iban)) errors.push('IBAN format is invalid');
  if (!validSwift(row.bankDetails?.swiftCode)) errors.push('SWIFT/BIC must contain 8 or 11 letters/digits');
  if (row.bankDetails?.accountNumber && !/^[A-Z0-9\- ]{4,40}$/i.test(row.bankDetails.accountNumber))
    errors.push('Bank account number format is invalid');
  if ((row.bankDetails?.iban || row.bankDetails?.accountNumber) && !row.bankDetails?.bankName)
    errors.push('Bank name is required when bank details are provided');
  if ((row.bankDetails?.iban || row.bankDetails?.accountNumber) && !row.bankDetails?.accountTitle)
    errors.push('Account title is required when bank details are provided');
  if (!validVillage(row.village)) errors.push('Village contains invalid characters or length');
  if (row.blacklisted && row.preferredSupplier) errors.push('A blacklisted supplier cannot be marked as preferred');
  if (row.salesTaxRegistered && !row.gstNumber) warnings.push('Sales-tax-registered supplier has no GST number');
  if (row.supplierType === 'international' && String(row.currency || 'PKR').toUpperCase() === 'PKR')
    warnings.push('International supplier uses PKR currency');
  for (const k of ['website', 'facebook', 'linkedin'])
    if (row[k] && !/^https?:\/\//i.test(String(row[k]))) warnings.push(`${k} should be a full http/https URL`);
  for (const [k, v] of Object.entries(row.documents || {}))
    if (v && !/^https?:\/\//i.test(String(v))) warnings.push(`${k} should be a full http/https URL`);
  return {
    errors: errors.map((message) => ({ row: rowNumber, message })),
    warnings: warnings.map((message) => ({ row: rowNumber, message })),
  };
};
const makeSupplierErrorCsv = (errors) =>
  ['row,message', ...errors.map((e) => `${e.row},"${String(e.message || '').replaceAll('"', '""')}"`)].join('\n');
const makeSupplierValidationReport = ({
  rows,
  errors,
  warnings,
  insertCount,
  updateCount,
  skipCount,
  duplicateCount,
  strategy,
}) => ({
  generatedAt: new Date().toISOString(),
  strategy,
  totalRows: rows.length,
  validRows: rows.length - new Set(errors.map((e) => e.row)).size,
  invalidRows: new Set(errors.map((e) => e.row)).size,
  insertCount,
  updateCount,
  skipCount,
  duplicateCount,
  errorCount: errors.length,
  warningCount: warnings.length,
  errors,
  warnings,
});
const supplierExportRows = (rows) =>
  rows.map((x) => ({
    supplierCode: x.supplierCode || '',
    supplierType: x.supplierType || 'local',
    businessType: x.businessType || '',
    registrationDate: x.registrationDate ? new Date(x.registrationDate).toISOString().slice(0, 10) : '',
    name: x.name || '',
    company: x.company || '',
    phone: x.phone || '',
    secondaryPhone: x.secondaryPhone || '',
    emergencyContact: x.emergencyContact || '',
    whatsapp: x.whatsapp || '',
    email: x.email || '',
    cnic: x.cnic || '',
    ntn: x.ntn || '',
    taxNumber: x.taxNumber || '',
    gstNumber: x.gstNumber || '',
    salesTaxRegistered: !!x.salesTaxRegistered,
    taxCategory: x.taxCategory || '',
    contactPerson: x.contactPerson || '',
    website: x.website || '',
    facebook: x.facebook || '',
    linkedin: x.linkedin || '',
    village: x.village || '',
    taluka: x.taluka || '',
    district: x.district || '',
    city: x.city || '',
    province: x.province || '',
    country: x.country || '',
    address: x.address || '',
    paymentTerms: x.paymentTerms || '',
    currency: x.currency || 'PKR',
    paymentMethod: x.paymentMethod || '',
    paymentCycle: x.paymentCycle || '',
    dueDays: x.dueDays || 0,
    creditLimit: x.creditLimit || 0,
    openingBalance: x.openingBalance || 0,
    currentBalance: x.currentBalance || 0,
    bankName: x.bankDetails?.bankName || '',
    accountTitle: x.bankDetails?.accountTitle || '',
    accountNumber: x.bankDetails?.accountNumber || '',
    iban: x.bankDetails?.iban || '',
    branch: x.bankDetails?.branch || '',
    swiftCode: x.bankDetails?.swiftCode || '',
    bankCountry: x.bankDetails?.bankCountry || '',
    bankCurrency: x.bankDetails?.bankCurrency || '',
    cnicAttachment: x.documents?.cnicAttachment || '',
    ntnAttachment: x.documents?.ntnAttachment || '',
    agreementPdf: x.documents?.agreementPdf || '',
    bankChequeImage: x.documents?.bankChequeImage || '',
    supplierRating: x.supplierRating || 0,
    blacklisted: !!x.blacklisted,
    preferredSupplier: !!x.preferredSupplier,
    ledgerId: x.ledgerId || '',
    defaultExpenseAccount: x.defaultExpenseAccount || '',
    defaultPayableAccount: x.defaultPayableAccount || '',
    defaultWarehouse: x.defaultWarehouse?.code || x.defaultWarehouse?.name || x.defaultWarehouse || '',
    deliveryTimeDays: x.deliveryTimeDays || 0,
    transportType: x.transportType || '',
    status: x.status || 'active',
    reference: x.reference || '',
    notes: x.notes || '',
    createdBy: x.createdBy?.email || x.createdBy?.name || x.createdBy || '',
    updatedBy: x.updatedBy?.email || x.updatedBy?.name || x.updatedBy || '',
    lastTransaction: x.lastTransaction ? new Date(x.lastTransaction).toISOString() : '',
    lastPurchaseDate: x.lastPurchaseDate ? new Date(x.lastPurchaseDate).toISOString() : '',
  }));
const supplierTemplateRows = [
  {
    supplierCode: '',
    supplierType: 'local',
    businessType: 'fertilizer distributor',
    registrationDate: '2026-01-01',
    name: 'Ali Fertilizer Traders',
    company: 'Ali Traders',
    phone: '03001234567',
    secondaryPhone: '03007654321',
    emergencyContact: '03001112222',
    whatsapp: '03001234567',
    email: 'supplier@example.com',
    cnic: '4130412345671',
    ntn: '1234567-8',
    taxNumber: '1234567-8',
    gstNumber: 'GST-12345',
    salesTaxRegistered: true,
    taxCategory: 'registered',
    contactPerson: 'Ali Ahmed',
    website: 'https://example.com',
    facebook: 'https://facebook.com/example',
    linkedin: 'https://linkedin.com/company/example',
    village: 'Hala',
    taluka: 'Hala',
    district: 'Matiari',
    city: 'Hala',
    province: 'Sindh',
    country: 'Pakistan',
    address: 'Main Road, Hala',
    paymentTerms: '30 days',
    currency: 'PKR',
    paymentMethod: 'bank',
    paymentCycle: 'monthly',
    dueDays: 30,
    creditLimit: 500000,
    openingBalance: 0,
    currentBalance: 0,
    bankName: 'Example Bank',
    accountTitle: 'Ali Traders',
    accountNumber: '000123456789',
    iban: 'PK00EXAMPLE000123456789',
    branch: 'Hala',
    swiftCode: 'EXAMPKKA',
    bankCountry: 'Pakistan',
    bankCurrency: 'PKR',
    cnicAttachment: 'https://example.com/cnic.jpg',
    ntnAttachment: 'https://example.com/ntn.pdf',
    agreementPdf: 'https://example.com/agreement.pdf',
    bankChequeImage: 'https://example.com/cheque.jpg',
    supplierRating: 4.5,
    blacklisted: false,
    preferredSupplier: true,
    ledgerId: '',
    defaultExpenseAccount: 'Purchases',
    defaultPayableAccount: 'Accounts Payable',
    defaultWarehouse: 'MAIN',
    deliveryTimeDays: 3,
    transportType: 'truck',
    status: 'active',
    reference: 'Direct',
    notes: 'Example row - replace or delete',
    lastTransaction: '',
    lastPurchaseDate: '',
  },
];
export const supplierTemplate = async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const buffer = await svc.workbookBuffer(supplierTemplateRows, 'Suppliers', format);
  res.setHeader('Content-Disposition', `attachment; filename=suppliers-import-template.${format}`);
  res
    .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(buffer);
};
export const exportSuppliers = async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.village) filter.village = new RegExp(escapeRegex(req.query.village), 'i');
  if (req.query.company) filter.company = new RegExp(escapeRegex(req.query.company), 'i');
  if (req.query.search) {
    const q = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [
      { supplierCode: q },
      { name: q },
      { company: q },
      { phone: q },
      { email: q },
      { cnic: q },
      { ntn: q },
      { taxNumber: q },
      { gstNumber: q },
    ];
  }
  const rows = await Supplier.find(filter)
    .populate('defaultWarehouse', 'name code')
    .populate('createdBy updatedBy', 'name email')
    .sort({ name: 1 })
    .lean();
  const buffer = await svc.workbookBuffer(supplierExportRows(rows), 'Suppliers', format);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=suppliers-${new Date().toISOString().slice(0, 10)}.${format}`,
  );
  res
    .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(buffer);
};
export const importSuppliers = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Supplier spreadsheet required' });
  const raw = await svc.parseWorkbook(req.file.buffer);
  if (!raw.length) return res.status(400).json({ message: 'Spreadsheet has no data rows' });
  if (raw.length > 25000)
    return res.status(400).json({ message: 'Maximum 25000 supplier rows are allowed per import' });
  const strategy = ['skip', 'update', 'error'].includes(req.body.duplicateStrategy)
    ? req.body.duplicateStrategy
    : 'skip';
  const rows = raw.map(normalizeSupplierRow);
  const warehouseRefs = [...new Set(rows.map((x) => String(x.defaultWarehouse || '').trim()).filter(Boolean))],
    warehouseOr = [];
  for (const value of warehouseRefs) {
    if (mongoose.isValidObjectId(value)) warehouseOr.push({ _id: value });
    warehouseOr.push(
      { name: new RegExp(`^${escapeRegex(value)}$`, 'i') },
      { code: new RegExp(`^${escapeRegex(value)}$`, 'i') },
    );
  }
  const warehouses = warehouseOr.length ? await Warehouse.find({ $or: warehouseOr }).lean() : [],
    whMap = new Map();
  for (const w of warehouses) {
    whMap.set(String(w._id), w);
    if (w.name) whMap.set(normalizeComparable(w.name), w);
    if (w.code) whMap.set(normalizeComparable(w.code), w);
  }
  const knownVillageRows = await Promise.all([Supplier.distinct('village'), Customer.distinct('village')]);
  const knownVillages = new Set(knownVillageRows.flat().filter(Boolean).map(normalizeComparable));
  const errors = [],
    warnings = [],
    valid = [];
  const duplicateFields = [
    'supplierCode',
    'name',
    'company',
    'phone',
    'whatsapp',
    'email',
    'cnic',
    'ntn',
    'taxNumber',
    'gstNumber',
  ];
  const seen = Object.fromEntries(duplicateFields.map((f) => [f, new Map()]));
  rows.forEach((row, i) => {
    const rowNo = i + 2;
    if (row.defaultWarehouse) {
      const key = normalizeComparable(row.defaultWarehouse),
        match = whMap.get(key) || whMap.get(String(row.defaultWarehouse));
      if (match) row.defaultWarehouse = match._id;
      else errors.push({ row: rowNo, message: `Invalid default warehouse: ${row.defaultWarehouse}` });
    }
    const check = validateSupplierRow(row, rowNo);
    errors.push(...check.errors);
    warnings.push(...check.warnings);
    if (row.village && knownVillages.size && !knownVillages.has(normalizeComparable(row.village)))
      warnings.push({ row: rowNo, message: `Village '${row.village}' is not yet present in ERP master data` });
    for (const field of duplicateFields) {
      const value = normalizeComparable(
        field === 'phone' || field === 'whatsapp' ? normalizePhoneDigits(row[field]) : row[field],
      );
      if (!value) continue;
      if (seen[field].has(value))
        errors.push({
          row: rowNo,
          message: `Duplicate ${field} inside file; first seen at row ${seen[field].get(value)}`,
        });
      else seen[field].set(value, rowNo);
    }
    if (!errors.some((e) => e.row === rowNo)) valid.push({ row: rowNo, data: row });
  });
  const vals = (field) => [...new Set(valid.map((x) => x.data[field]).filter(Boolean))],
    ors = [];
  for (const field of duplicateFields) {
    const values = vals(field);
    if (!values.length) continue;
    if (['name', 'company'].includes(field))
      ors.push({ [field]: { $in: values.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) } });
    else ors.push({ [field]: { $in: values } });
  }
  const existing = ors.length ? await Supplier.find({ $or: ors }).lean() : [];
  const maps = Object.fromEntries(duplicateFields.map((f) => [f, new Map()]));
  for (const x of existing)
    for (const field of duplicateFields) {
      if (!x[field]) continue;
      const value = normalizeComparable(
        field === 'phone' || field === 'whatsapp' ? normalizePhoneDigits(x[field]) : x[field],
      );
      maps[field].set(value, x);
    }
  const findMatch = (row) => {
    for (const field of [
      'supplierCode',
      'cnic',
      'ntn',
      'taxNumber',
      'gstNumber',
      'email',
      'phone',
      'whatsapp',
      'company',
      'name',
    ]) {
      const value = normalizeComparable(
        field === 'phone' || field === 'whatsapp' ? normalizePhoneDigits(row[field]) : row[field],
      );
      if (value && maps[field].has(value)) return { supplier: maps[field].get(value), matchedBy: field };
    }
    return null;
  };
  const preview = [];
  let insertCount = 0,
    updateCount = 0,
    skipCount = 0,
    duplicateCount = 0;
  for (const item of valid) {
    const found = findMatch(item.data);
    let action = 'insert',
      matchedBy = '';
    if (found) {
      duplicateCount++;
      matchedBy = found.matchedBy;
      action = strategy === 'update' ? 'update' : strategy === 'skip' ? 'skip' : 'error';
      if (action === 'error')
        errors.push({ row: item.row, message: `Supplier already exists in database (matched by ${matchedBy})` });
      if (action === 'update') updateCount++;
      if (action === 'skip') skipCount++;
    } else insertCount++;
    preview.push({
      row: item.row,
      action,
      matchedBy,
      supplierCode: item.data.supplierCode || '(auto)',
      name: item.data.name,
      company: item.data.company || '',
      phone: item.data.phone,
      whatsapp: item.data.whatsapp || '',
      email: item.data.email || '',
      cnic: item.data.cnic || '',
      ntn: item.data.ntn || '',
      gstNumber: item.data.gstNumber || '',
      defaultWarehouse: item.data.defaultWarehouse || '',
    });
  }
  const fingerprint = crypto.createHash('sha256').update(req.file.buffer).update(strategy).digest('hex');
  const report = makeSupplierValidationReport({
    rows,
    errors,
    warnings,
    insertCount,
    updateCount,
    skipCount,
    duplicateCount,
    strategy,
  });
  const dryRun = req.body.dryRun === 'true' || req.body.confirm !== 'true';
  if (dryRun)
    return res.json({
      ...report,
      valid: valid.length,
      preview: preview.slice(0, 200),
      requiresConfirmation: true,
      confirmationFingerprint: fingerprint,
      errorCsv: makeSupplierErrorCsv(errors),
      validationReport: report,
    });
  if (!req.body.confirmationFingerprint || req.body.confirmationFingerprint !== fingerprint)
    return res
      .status(409)
      .json({ message: 'Import file or duplicate strategy changed after preview. Validate again before confirming.' });
  if (errors.length && strategy === 'error')
    return res.status(400).json({
      message: 'Import cancelled because validation or duplicate errors exist',
      errors,
      errorCsv: makeSupplierErrorCsv(errors),
      validationReport: report,
    });
  const session = await mongoose.startSession();
  let inserted = 0,
    updated = 0,
    skipped = 0;
  try {
    await session.withTransaction(async () => {
      for (const item of valid) {
        if (errors.some((e) => e.row === item.row)) continue;
        const found = findMatch(item.data),
          match = found?.supplier;
        const payload = { ...item.data, updatedBy: req.user?._id };
        if (match) {
          if (strategy === 'skip') {
            skipped++;
            continue;
          }
          if (strategy === 'update') {
            await Supplier.findByIdAndUpdate(match._id, { $set: payload }, { runValidators: true, session });
            updated++;
            continue;
          }
        }
        payload.createdBy = req.user?._id;
        await Supplier.create([payload], { session });
        inserted++;
      }
    });
    await AuditLog.create({
      user: req.user?._id,
      action: 'SUPPLIERS_IMPORTED',
      entity: 'Supplier',
      description: 'Suppliers imported from spreadsheet',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        file: req.file.originalname,
        total: rows.length,
        inserted,
        updated,
        skipped,
        duplicateCount,
        errorCount: errors.length,
        warningCount: warnings.length,
        strategy,
        fingerprint,
      },
    });
    res.status(201).json({
      message: 'Supplier import completed',
      total: rows.length,
      inserted,
      updated,
      skipped,
      duplicateCount,
      errors,
      warnings,
    });
  } catch (e) {
    res.status(400).json({ message: `Supplier import rolled back: ${e.message}` });
  } finally {
    await session.endSession();
  }
};

const PRODUCT_CATEGORIES = ['Cotton', 'Wheat', 'DAP', 'Urea', 'Bardana', 'Seeds', 'Pesticides', 'Other'];
const productColumns = [
  'name',
  'sku',
  'barcode',
  'qrCode',
  'category',
  'brand',
  'unit',
  'supplier',
  'warehouse',
  'purchasePrice',
  'salePrice',
  'availableStock',
  'minimumStock',
];
const productHeaderAliases = {
  name: ['name', 'product name', 'item name'],
  sku: ['sku', 'product sku', 'item code', 'code'],
  barcode: ['barcode', 'bar code'],
  qrCode: ['qrcode', 'qr code', 'qr_code'],
  category: ['category', 'product category'],
  brand: ['brand'],
  unit: ['unit', 'uom'],
  supplier: ['supplier', 'supplier name', 'supplier phone', 'supplier id'],
  warehouse: ['warehouse', 'warehouse name', 'warehouse code', 'warehouse id'],
  purchasePrice: ['purchaseprice', 'purchase price', 'cost price', 'buying price'],
  salePrice: ['saleprice', 'sale price', 'selling price'],
  availableStock: ['availablestock', 'available stock', 'current stock', 'stock'],
  minimumStock: ['minimumstock', 'minimum stock', 'min stock', 'reorder level'],
};
const productAliasLookup = Object.fromEntries(
  Object.entries(productHeaderAliases).flatMap(([field, names]) => names.map((n) => [normalizeHeader(n), field])),
);
const normalizeText = (v) => String(v ?? '').trim();
const productIdentity = (row) =>
  [
    normalizeText(row.name).toLowerCase(),
    normalizeText(row.brand).toLowerCase(),
    normalizeText(row.unit).toLowerCase(),
  ].join('|');
const normalizeProductRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const field = productAliasLookup[normalizeHeader(k)] || k;
    if (productColumns.includes(field)) out[field] = typeof v === 'string' ? v.trim() : v;
  }
  out.name = normalizeText(out.name);
  out.sku = normalizeText(out.sku);
  out.barcode = normalizeText(out.barcode);
  out.qrCode = normalizeText(out.qrCode);
  out.brand = normalizeText(out.brand);
  out.unit = normalizeText(out.unit || 'kg');
  out.supplier = normalizeText(out.supplier);
  out.warehouse = normalizeText(out.warehouse);
  const cat = normalizeText(out.category || 'Other');
  out.category = PRODUCT_CATEGORIES.find((x) => x.toLowerCase() === cat.toLowerCase()) || cat;
  for (const k of ['purchasePrice', 'salePrice', 'availableStock', 'minimumStock']) {
    if (out[k] !== '' && out[k] !== undefined) out[k] = Number(out[k]);
    else out[k] = 0;
  }
  return clean(out);
};
const validateProductRow = (row, rowNumber, validCategories = PRODUCT_CATEGORIES) => {
  const errors = [],
    warnings = [];
  if (!row.name) errors.push('Product name is required');
  if (!row.sku) errors.push('SKU is required');
  if (!row.unit) errors.push('Unit is required');
  if (!validCategories.some((x) => x.toLowerCase() === String(row.category || '').toLowerCase()))
    errors.push(`Invalid category: ${row.category || '(blank)'}`);
  for (const k of ['purchasePrice', 'salePrice', 'availableStock', 'minimumStock']) {
    if (!Number.isFinite(row[k])) errors.push(`${k} must be a number`);
    else if (row[k] < 0) errors.push(`${k} cannot be negative`);
  }
  if (Number.isFinite(row.salePrice) && Number.isFinite(row.purchasePrice) && row.salePrice < row.purchasePrice)
    warnings.push('Sale price is lower than purchase price');
  if (row.minimumStock > row.availableStock) warnings.push('Minimum stock is greater than current stock');
  return {
    errors: errors.map((message) => ({ row: rowNumber, message })),
    warnings: warnings.map((message) => ({ row: rowNumber, message })),
  };
};
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const makeErrorCsv = (errors) =>
  ['row,message', ...errors.map((e) => `${e.row},"${String(e.message || '').replaceAll('"', '""')}"`)].join('\n');
async function buildProductReferenceMaps(rows) {
  const supplierRefs = [...new Set(rows.map((x) => x.supplier).filter(Boolean))],
    warehouseRefs = [...new Set(rows.map((x) => x.warehouse).filter(Boolean))];
  const supplierOr = [];
  for (const v of supplierRefs) {
    if (isObjectId(v)) supplierOr.push({ _id: v });
    supplierOr.push(
      { name: new RegExp(`^${escapeRegex(v)}$`, 'i') },
      { company: new RegExp(`^${escapeRegex(v)}$`, 'i') },
      { phone: v },
    );
  }
  const warehouseOr = [];
  for (const v of warehouseRefs) {
    if (isObjectId(v)) warehouseOr.push({ _id: v });
    warehouseOr.push(
      { name: new RegExp(`^${escapeRegex(v)}$`, 'i') },
      { code: new RegExp(`^${escapeRegex(v)}$`, 'i') },
    );
  }
  const [suppliers, warehouses] = await Promise.all([
    supplierOr.length ? Supplier.find({ $or: supplierOr }).lean() : [],
    warehouseOr.length ? Warehouse.find({ $or: warehouseOr }).lean() : [],
  ]);
  const sm = new Map(),
    wm = new Map();
  for (const x of suppliers) {
    for (const key of [String(x._id), x.name, x.company, x.phone].filter(Boolean))
      sm.set(String(key).trim().toLowerCase(), x._id);
  }
  for (const x of warehouses) {
    for (const key of [String(x._id), x.name, x.code].filter(Boolean)) wm.set(String(key).trim().toLowerCase(), x._id);
  }
  return { supplierMap: sm, warehouseMap: wm };
}
const productTemplateRows = [
  {
    name: 'Premium Cotton',
    sku: 'COTTON-001',
    barcode: '890000000001',
    qrCode: 'HMN-COTTON-001',
    category: 'Cotton',
    brand: 'HMN',
    unit: 'kg',
    supplier: 'Example Supplier',
    warehouse: 'MAIN',
    purchasePrice: 180,
    salePrice: 195,
    availableStock: 1000,
    minimumStock: 100,
  },
];
export const productTemplate = async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const buffer = await svc.workbookBuffer(productTemplateRows, 'Products', format);
  res.setHeader('Content-Disposition', `attachment; filename=products-import-template.${format}`);
  res
    .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(buffer);
};
export const importProducts = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Product spreadsheet required' });
  const raw = await svc.parseWorkbook(req.file.buffer);
  if (!raw.length) return res.status(400).json({ message: 'Spreadsheet has no data rows' });
  if (raw.length > 25000) return res.status(400).json({ message: 'Maximum 25000 product rows are allowed per import' });
  const strategy = ['skip', 'update', 'error'].includes(req.body.duplicateStrategy)
    ? req.body.duplicateStrategy
    : 'skip';
  const rows = raw.map(normalizeProductRow);
  const errors = [],
    warnings = [],
    valid = [];
  const seenSku = new Map(),
    seenBarcode = new Map(),
    seenProduct = new Map();
  const activeCategories = await Category.find({ active: { $ne: false } })
    .select('name')
    .lean();
  const categoryNames = [
    ...new Set([
      ...PRODUCT_CATEGORIES,
      ...activeCategories
        .map((x) => x.name)
        .filter((x) => PRODUCT_CATEGORIES.some((y) => y.toLowerCase() === String(x).toLowerCase())),
    ]),
  ];
  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const check = validateProductRow(row, rowNo, categoryNames);
    errors.push(...check.errors);
    warnings.push(...check.warnings);
    if (row.sku) {
      const k = row.sku.toLowerCase();
      if (seenSku.has(k))
        errors.push({ row: rowNo, message: `Duplicate SKU inside file; first seen at row ${seenSku.get(k)}` });
      else seenSku.set(k, rowNo);
    }
    if (row.barcode) {
      const k = row.barcode.toLowerCase();
      if (seenBarcode.has(k))
        errors.push({ row: rowNo, message: `Duplicate barcode inside file; first seen at row ${seenBarcode.get(k)}` });
      else seenBarcode.set(k, rowNo);
    }
    const identity = productIdentity(row);
    if (row.name) {
      if (seenProduct.has(identity))
        errors.push({
          row: rowNo,
          message: `Duplicate product inside file (same name, brand and unit); first seen at row ${seenProduct.get(identity)}`,
        });
      else seenProduct.set(identity, rowNo);
    }
    if (!errors.some((e) => e.row === rowNo)) valid.push({ row: rowNo, data: row });
  });
  const { supplierMap, warehouseMap } = await buildProductReferenceMaps(valid.map((x) => x.data));
  for (const item of valid) {
    if (item.data.supplier) {
      const id = supplierMap.get(item.data.supplier.toLowerCase());
      if (!id) errors.push({ row: item.row, message: `Invalid supplier: ${item.data.supplier}` });
      else item.data.supplier = id;
    }
    if (item.data.warehouse) {
      const id = warehouseMap.get(item.data.warehouse.toLowerCase());
      if (!id) errors.push({ row: item.row, message: `Invalid warehouse: ${item.data.warehouse}` });
      else item.data.warehouse = id;
    }
  }
  const usable = valid.filter((x) => !errors.some((e) => e.row === x.row));
  const skus = [...new Set(usable.map((x) => x.data.sku).filter(Boolean))],
    barcodes = [...new Set(usable.map((x) => x.data.barcode).filter(Boolean))],
    names = [...new Set(usable.map((x) => x.data.name).filter(Boolean))];
  const or = [];
  if (skus.length) or.push({ sku: { $in: skus } });
  if (barcodes.length) or.push({ barcode: { $in: barcodes } });
  if (names.length) or.push({ name: { $in: names.map((x) => new RegExp(`^${escapeRegex(x)}$`, 'i')) } });
  const existing = or.length ? await Product.find({ $or: or }).lean() : [];
  const bySku = new Map(existing.filter((x) => x.sku).map((x) => [x.sku.toLowerCase(), x])),
    byBarcode = new Map(existing.filter((x) => x.barcode).map((x) => [x.barcode.toLowerCase(), x])),
    byIdentity = new Map(existing.map((x) => [productIdentity(x), x]));
  const preview = [];
  let insertCount = 0,
    updateCount = 0,
    skipCount = 0,
    duplicateCount = 0;
  for (const item of usable) {
    const match =
      bySku.get(item.data.sku.toLowerCase()) ||
      (item.data.barcode ? byBarcode.get(item.data.barcode.toLowerCase()) : null) ||
      byIdentity.get(productIdentity(item.data));
    let action = 'insert',
      matchedBy = '';
    if (match) {
      duplicateCount++;
      matchedBy =
        match.sku?.toLowerCase() === item.data.sku.toLowerCase()
          ? 'sku'
          : item.data.barcode && match.barcode?.toLowerCase() === item.data.barcode.toLowerCase()
            ? 'barcode'
            : 'name-brand-unit';
      action = strategy === 'update' ? 'update' : strategy === 'skip' ? 'skip' : 'error';
      if (action === 'error')
        errors.push({ row: item.row, message: `Product already exists in database (matched by ${matchedBy})` });
      if (action === 'update') updateCount++;
      if (action === 'skip') skipCount++;
    } else insertCount++;
    preview.push({
      row: item.row,
      action,
      matchedBy,
      name: item.data.name,
      sku: item.data.sku,
      barcode: item.data.barcode || '',
      category: item.data.category,
      warehouse: item.data.warehouse ? String(item.data.warehouse) : '',
      purchasePrice: item.data.purchasePrice,
      salePrice: item.data.salePrice,
      availableStock: item.data.availableStock,
    });
  }
  const fingerprint = crypto.createHash('sha256').update(req.file.buffer).update(strategy).digest('hex');
  const dryRun = req.body.dryRun === 'true' || req.body.confirm !== 'true';
  if (dryRun)
    return res.json({
      total: rows.length,
      valid: usable.length,
      invalidRows: new Set(errors.map((e) => e.row)).size,
      insertCount,
      updateCount,
      skipCount,
      duplicateCount,
      errors,
      warnings,
      preview: preview.slice(0, 200),
      requiresConfirmation: true,
      confirmationFingerprint: fingerprint,
      errorCsv: makeErrorCsv(errors),
    });
  if (req.body.confirmationFingerprint && req.body.confirmationFingerprint !== fingerprint)
    return res
      .status(409)
      .json({ message: 'Import file or duplicate strategy changed after preview. Validate again before confirming.' });
  if (errors.length && strategy === 'error')
    return res.status(400).json({
      message: 'Import cancelled because validation or duplicate errors exist',
      errors,
      errorCsv: makeErrorCsv(errors),
    });
  const session = await mongoose.startSession();
  let inserted = 0,
    updated = 0,
    skipped = 0;
  try {
    await session.withTransaction(async () => {
      for (const item of usable) {
        if (errors.some((e) => e.row === item.row)) continue;
        const match =
          bySku.get(item.data.sku.toLowerCase()) ||
          (item.data.barcode ? byBarcode.get(item.data.barcode.toLowerCase()) : null) ||
          byIdentity.get(productIdentity(item.data));
        if (match) {
          if (strategy === 'skip') {
            skipped++;
            continue;
          }
          if (strategy === 'update') {
            await Product.findByIdAndUpdate(match._id, { $set: item.data }, { runValidators: true, session });
            updated++;
            continue;
          }
        }
        await Product.create([item.data], { session });
        inserted++;
      }
    });
    await AuditLog.create({
      user: req.user?._id,
      action: 'PRODUCTS_IMPORTED',
      entity: 'Product',
      description: 'Products imported from spreadsheet',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        file: req.file.originalname,
        total: rows.length,
        inserted,
        updated,
        skipped,
        errorCount: errors.length,
        warningCount: warnings.length,
        strategy,
        fingerprint,
      },
    });
    res
      .status(201)
      .json({ message: 'Product import completed', total: rows.length, inserted, updated, skipped, errors, warnings });
  } catch (error) {
    res.status(400).json({ message: `Product import rolled back: ${error.message}` });
  } finally {
    await session.endSession();
  }
};

const productJobDir = path.resolve('uploads/product-transfer-jobs');
const ensureProductJobDir = async () => fsp.mkdir(productJobDir, { recursive: true });
const safeJobName = (v) => String(v || 'file').replace(/[^a-zA-Z0-9._-]+/g, '-');
const writeJobFile = async (name, buffer) => {
  await ensureProductJobDir();
  const target = path.join(
    productJobDir,
    `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeJobName(name)}`,
  );
  await fsp.writeFile(target, buffer);
  return target;
};
const fakeResponse = (done) => {
  let statusCode = 200,
    headers = {};
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
      return this;
    },
    type(v) {
      headers['content-type'] = v;
      return this;
    },
    json(data) {
      done({ statusCode, headers, data });
      return this;
    },
    send(data) {
      done({ statusCode, headers, data });
      return this;
    },
    destroy(err) {
      done({ statusCode: 500, headers, data: { message: err.message } });
    },
  };
};
async function updateJob(id, patch) {
  return ProductTransferJob.findByIdAndUpdate(id, patch, { new: true });
}
async function runImportJob(jobId, file, body, user, meta) {
  const started = Date.now();
  await updateJob(jobId, {
    status: 'processing',
    startedAt: new Date(),
    stage: 'Parsing spreadsheet',
    progress: 5,
    attempts: 1,
  });
  const job = await ProductTransferJob.findById(jobId);
  if (job?.cancelRequested)
    return updateJob(jobId, { status: 'cancelled', stage: 'Cancelled', completedAt: new Date() });
  await new Promise((resolve) => {
    const req = {
      file,
      body: { ...body, dryRun: 'false', confirm: 'true' },
      user,
      ip: meta.ip,
      get: () => meta.userAgent,
    };
    const res = fakeResponse(async (out) => {
      try {
        const payload = out.data || {};
        const errors = payload.errors || [];
        const warnings = payload.warnings || [];
        const status = out.statusCode >= 400 ? 'failed' : errors.length ? 'partial' : 'completed';
        await updateJob(jobId, {
          status,
          stage: status === 'failed' ? 'Failed' : 'Completed',
          progress: 100,
          totalRows: payload.total || 0,
          processedRows: payload.total || 0,
          successRows: (payload.inserted || 0) + (payload.updated || 0),
          failedRows: errors.length,
          duplicateRows: payload.skipped || 0,
          result: payload,
          errorDetails: errors.slice(0, 5000),
          warnings: warnings.slice(0, 5000),
          durationMs: Date.now() - started,
          completedAt: new Date(),
        });
      } finally {
        resolve();
      }
    });
    importProducts(req, res).catch(async (e) => {
      await updateJob(jobId, {
        status: 'failed',
        stage: 'Failed',
        progress: 100,
        errorDetails: [{ message: e.message }],
        durationMs: Date.now() - started,
        completedAt: new Date(),
      });
      resolve();
    });
  });
}
async function runExportJob(jobId, query, user, meta) {
  const started = Date.now();
  await updateJob(jobId, {
    status: 'processing',
    startedAt: new Date(),
    stage: 'Building export',
    progress: 10,
    attempts: 1,
  });
  const job = await ProductTransferJob.findById(jobId);
  if (job?.cancelRequested)
    return updateJob(jobId, { status: 'cancelled', stage: 'Cancelled', completedAt: new Date() });
  await new Promise((resolve) => {
    const req = { query, user, ip: meta.ip, get: () => meta.userAgent };
    const res = fakeResponse(async (out) => {
      try {
        if (out.statusCode >= 400) throw new Error(out.data?.message || 'Export failed');
        const ext = String(query.format || 'xlsx').toLowerCase();
        const data = Buffer.isBuffer(out.data)
          ? out.data
          : Buffer.from(typeof out.data === 'string' ? out.data : JSON.stringify(out.data));
        const fileName = `products-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
        const filePath = await writeJobFile(fileName, data);
        await updateJob(jobId, {
          status: 'completed',
          stage: 'Completed',
          progress: 100,
          fileName,
          filePath,
          fileSize: data.length,
          result: { format: ext },
          durationMs: Date.now() - started,
          completedAt: new Date(),
        });
      } catch (e) {
        await updateJob(jobId, {
          status: 'failed',
          stage: 'Failed',
          progress: 100,
          errorDetails: [{ message: e.message }],
          durationMs: Date.now() - started,
          completedAt: new Date(),
        });
      } finally {
        resolve();
      }
    });
    exportProducts(req, res).catch(async (e) => {
      await updateJob(jobId, {
        status: 'failed',
        stage: 'Failed',
        progress: 100,
        errorDetails: [{ message: e.message }],
        durationMs: Date.now() - started,
        completedAt: new Date(),
      });
      resolve();
    });
  });
}
export const createProductImportJob = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Product spreadsheet required' });
  const originalFilePath = await writeJobFile(req.file.originalname, req.file.buffer);
  const raw = await svc.parseWorkbook(req.file.buffer);
  if (raw.length > 25000) return res.status(400).json({ message: 'Maximum 25000 rows per job' });
  const job = await ProductTransferJob.create({
    type: 'import',
    status: 'queued',
    stage: 'Queued',
    originalFileName: req.file.originalname,
    originalFilePath,
    totalRows: raw.length,
    duplicateStrategy: req.body.duplicateStrategy || 'skip',
    createdBy: req.user._id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  setImmediate(() =>
    runImportJob(
      job._id,
      { ...req.file, buffer: req.file.buffer },
      { duplicateStrategy: req.body.duplicateStrategy || 'skip' },
      req.user,
      { ip: req.ip, userAgent: req.get('user-agent') },
    ),
  );
  res.status(202).json(job);
};
export const createProductExportJob = async (req, res) => {
  const format = String(req.body.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'csv', 'pdf', 'json', 'xml'].includes(format))
    return res.status(400).json({ message: 'Background export supports xlsx, csv, pdf, json or xml' });
  const job = await ProductTransferJob.create({
    type: 'export',
    format,
    status: 'queued',
    stage: 'Queued',
    filters: req.body.filters || {},
    createdBy: req.user._id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  setImmediate(() =>
    runExportJob(job._id, { ...(req.body.filters || {}), format }, req.user, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }),
  );
  res.status(202).json(job);
};
export const productTransferJobs = async (req, res) => {
  const q = {};
  if (req.query.type) q.type = req.query.type;
  if (req.query.status) q.status = req.query.status;
  if (req.query.search)
    q.$or = [
      { fileName: new RegExp(escapeRegex(req.query.search), 'i') },
      { originalFileName: new RegExp(escapeRegex(req.query.search), 'i') },
    ];
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
};
export const productTransferJob = async (req, res) => {
  const job = await ProductTransferJob.findById(req.params.id).populate('createdBy', 'name email role');
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
};
export const cancelProductTransferJob = async (req, res) => {
  const job = await ProductTransferJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (['completed', 'failed', 'cancelled'].includes(job.status))
    return res.status(400).json({ message: 'Job is already finished' });
  job.cancelRequested = true;
  job.status = 'cancelled';
  job.stage = 'Cancelled by administrator';
  job.completedAt = new Date();
  await job.save();
  res.json(job);
};
export const retryProductTransferJob = async (req, res) => {
  const old = await ProductTransferJob.findById(req.params.id);
  if (!old) return res.status(404).json({ message: 'Job not found' });
  if (old.attempts >= old.maxAttempts) return res.status(400).json({ message: 'Maximum retry attempts reached' });
  old.status = 'queued';
  old.stage = 'Queued for retry';
  old.progress = 0;
  old.cancelRequested = false;
  old.errors = [];
  old.completedAt = undefined;
  await old.save();
  if (old.type === 'import') {
    if (!old.originalFilePath || !fs.existsSync(old.originalFilePath))
      return res.status(410).json({ message: 'Original import file is no longer available' });
    const buffer = await fsp.readFile(old.originalFilePath);
    setImmediate(() =>
      runImportJob(
        old._id,
        { originalname: old.originalFileName, buffer },
        { duplicateStrategy: old.duplicateStrategy || 'skip' },
        req.user,
        { ip: req.ip, userAgent: req.get('user-agent') },
      ),
    );
  } else
    setImmediate(() =>
      runExportJob(old._id, { ...(old.filters || {}), format: old.format }, req.user, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }),
    );
  res.json(old);
};
export const deleteProductTransferJob = async (req, res) => {
  const job = await ProductTransferJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  for (const f of [job.filePath, job.originalFilePath]) if (f && fs.existsSync(f)) await fsp.unlink(f).catch(() => {});
  await job.deleteOne();
  res.json({ success: true });
};
export const downloadProductJobFile = async (req, res) => {
  const job = await ProductTransferJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const original = req.query.original === 'true';
  const filePath = original ? job.originalFilePath : job.filePath;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ message: 'File not available' });
  res.download(
    path.resolve(filePath),
    original ? job.originalFileName || 'original-import.xlsx' : job.fileName || 'product-export',
  );
};
const reportRows = (job) => [
  ...(job.errorDetails || []).map((x) => ({ type: 'error', row: x.row || '', message: x.message || '' })),
  ...(job.warnings || []).map((x) => ({ type: 'warning', row: x.row || '', message: x.message || '' })),
];
export const downloadProductFailedRows = async (req, res) => {
  const job = await ProductTransferJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const rows = (job.errorDetails || []).map((x) => ({ row: x.row || '', reason: x.message || '' }));
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const buffer =
    format === 'xlsx'
      ? await svc.formattedWorkbookBuffer(rows, 'Failed Rows')
      : await svc.workbookBuffer(rows, 'Failed Rows', 'csv');
  res.setHeader('Content-Disposition', `attachment; filename=product-job-${job._id}-failed.${format}`);
  res
    .type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv')
    .send(buffer);
};
export const downloadProductValidationReport = async (req, res) => {
  const job = await ProductTransferJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const format = String(req.query.format || 'csv').toLowerCase(),
    rows = reportRows(job);
  if (format === 'xlsx') {
    const buffer = await svc.formattedWorkbookBuffer(rows, 'Validation Report');
    res.setHeader('Content-Disposition', `attachment; filename=product-job-${job._id}-validation.xlsx`);
    return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
  }
  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Disposition', `attachment; filename=product-job-${job._id}-validation.pdf`);
    res.type('application/pdf');
    doc.pipe(res);
    doc.fontSize(18).text('HMN Product Import Validation Report');
    doc
      .moveDown()
      .fontSize(10)
      .text(
        `Job: ${job._id}\nStatus: ${job.status}\nTotal rows: ${job.totalRows}\nSuccess: ${job.successRows}\nFailed: ${job.failedRows}\nDuplicates: ${job.duplicateRows}`,
      );
    doc.moveDown();
    for (const r of rows.slice(0, 2000)) {
      doc.text(`${r.type.toUpperCase()} | Row ${r.row || '-'} | ${r.message}`);
      if (doc.y > 740) doc.addPage();
    }
    return doc.end();
  }
  const buffer = await svc.workbookBuffer(rows, 'Validation Report', 'csv');
  res.setHeader('Content-Disposition', `attachment; filename=product-job-${job._id}-validation.csv`);
  res.type('text/csv').send(buffer);
};

export const status = async (req, res) => res.json({ providers: svc.integrationStatus(), configuredAt: new Date() });
export const saveConfig = async (req, res) => {
  const { key, enabled, settings } = req.body;
  const item = await IntegrationConfig.findOneAndUpdate(
    { key },
    { key, enabled, settings, updatedBy: req.user._id },
    { upsert: true, new: true },
  );
  res.json(item);
};

const CLOUDINARY_ALLOWED = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
};
const cloudMaxBytes = () => Math.max(1, Number(process.env.CLOUDINARY_MAX_FILE_SIZE_MB || 15)) * 1024 * 1024;
const cloudMaxFiles = () => Math.max(1, Number(process.env.CLOUDINARY_MAX_FILES || 20));
const extOf = (name) =>
  String(name || '')
    .toLowerCase()
    .split('.')
    .pop();
const hasMagic = (file) => {
  const b = file.buffer || Buffer.alloc(0),
    mime = file.mimetype,
    ext = extOf(file.originalname);
  if (!b.length) return false;
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png')
    return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp')
    return b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  if (mime === 'application/pdf') return b.subarray(0, 5).toString() === '%PDF-';
  if (['docx', 'xlsx'].includes(ext))
    return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && [0x03, 0x05, 0x07].includes(b[2]);
  return false;
};
const hashFile = (file) => crypto.createHash('sha256').update(file.buffer).digest('hex');
const imageDimensions = (file) => {
  try {
    return imageSize(file.buffer);
  } catch {
    return null;
  }
};
const virusScanFile = async (file) => {
  if (!process.env.VIRUS_SCAN_WEBHOOK_URL) return { status: 'not-configured' };
  try {
    const r = await axios.post(
      process.env.VIRUS_SCAN_WEBHOOK_URL,
      {
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        sha256: hashFile(file),
        contentBase64: file.buffer.toString('base64'),
      },
      {
        timeout: Number(process.env.VIRUS_SCAN_TIMEOUT_MS || 15000),
        headers: {
          ...(process.env.VIRUS_SCAN_API_KEY ? { Authorization: `Bearer ${process.env.VIRUS_SCAN_API_KEY}` } : {}),
        },
      },
    );
    const status = String(r.data?.status || 'clean').toLowerCase();
    return {
      status: ['clean', 'infected'].includes(status) ? status : 'failed',
      provider: r.data?.provider || 'webhook',
      message: r.data?.message || '',
      checkedAt: new Date(),
    };
  } catch (e) {
    return { status: 'failed', provider: 'webhook', message: e.message, checkedAt: new Date() };
  }
};
const validateCloudFiles = async (files) => {
  const errors = [],
    warnings = [],
    seen = new Map(),
    max = cloudMaxBytes(),
    hashes = [];
  if (!files.length) errors.push({ message: 'At least one file is required' });
  if (files.length > cloudMaxFiles())
    errors.push({ message: `Maximum ${cloudMaxFiles()} files are allowed per upload` });
  for (let index = 0; index < files.length; index++) {
    const file = files[index],
      name = String(file.originalname || '').trim(),
      key = name.toLowerCase(),
      ext = extOf(name),
      allowed = CLOUDINARY_ALLOWED[file.mimetype];
    if (!file.size) errors.push({ index, name, message: 'Empty files are not allowed' });
    if (file.size > max)
      errors.push({ index, name, message: `File exceeds ${process.env.CLOUDINARY_MAX_FILE_SIZE_MB || 15} MB limit` });
    if (!allowed || !allowed.includes(ext))
      errors.push({ index, name, message: 'Unsupported file type. Allowed: JPG, PNG, WEBP, PDF, DOCX, XLSX' });
    if (seen.has(key))
      errors.push({
        index,
        name,
        message: `Duplicate filename in selection; first seen at position ${seen.get(key) + 1}`,
      });
    else seen.set(key, index);
    if (allowed && !hasMagic(file))
      errors.push({ index, name, message: 'File signature is invalid or the file appears corrupted' });
    const sha256 = hashFile(file);
    file.sha256 = sha256;
    if (hashes.includes(sha256))
      errors.push({ index, name, message: 'Duplicate file content detected inside this upload' });
    hashes.push(sha256);
    if (String(file.mimetype).startsWith('image/')) {
      const d = imageDimensions(file);
      if (!d) errors.push({ index, name, message: 'Image dimensions could not be read; image may be corrupted' });
      else {
        file.imageWidth = d.width;
        file.imageHeight = d.height;
        const minW = Number(process.env.CLOUDINARY_MIN_IMAGE_WIDTH || 200),
          minH = Number(process.env.CLOUDINARY_MIN_IMAGE_HEIGHT || 200),
          maxW = Number(process.env.CLOUDINARY_MAX_IMAGE_WIDTH || 12000),
          maxH = Number(process.env.CLOUDINARY_MAX_IMAGE_HEIGHT || 12000);
        if (d.width < minW || d.height < minH)
          errors.push({ index, name, message: `Image resolution must be at least ${minW}x${minH}` });
        if (d.width > maxW || d.height > maxH)
          errors.push({ index, name, message: `Image resolution exceeds ${maxW}x${maxH}` });
      }
    }
  }
  if (hashes.length) {
    const existing = await CloudAsset.find({ sha256: { $in: hashes }, status: { $ne: 'deleted' } })
      .select('sha256 originalFilename publicId')
      .lean();
    const byHash = new Map(existing.map((x) => [x.sha256, x]));
    files.forEach((f, index) => {
      const x = byHash.get(f.sha256);
      if (x)
        errors.push({
          index,
          name: f.originalname,
          message: `Duplicate file content already uploaded as ${x.originalFilename || x.publicId}`,
        });
    });
  }
  return { errors, warnings };
};
const CLOUDINARY_FOLDERS = {
  company: 'hmn/company/logo',
  products: 'hmn/products',
  productThumbnails: 'hmn/products/thumbnails',
  customers: 'hmn/customers',
  suppliers: 'hmn/suppliers',
  expenses: 'hmn/expenses',
  invoices: 'hmn/invoices',
  contracts: 'hmn/contracts',
  backups: 'hmn/backups',
  temp: 'hmn/temp',
  general: 'hmn/general',
};
const cloudFolder = (body = {}) => {
  const purpose = String(body.purpose || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const base = CLOUDINARY_FOLDERS[purpose] || CLOUDINARY_FOLDERS.general;
  const custom = String(body.folder || '')
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/^\/+|\/+$/g, '');
  return custom ? `${base}/${custom}` : base;
};
const processingOptions = (body) => ({
  quality: body.quality || 'auto:good',
  cropPreset: body.cropPreset || 'none',
  targetWidth: Number(body.targetWidth || 1600),
  targetHeight: Number(body.targetHeight || 900),
  preserveExif: body.preserveExif || 'false',
  concurrency: Number(body.concurrency || 3),
});
const eagerAt = (x, n) => x.eager?.[n]?.secure_url || '';
const mapCloudResult = (x) => ({
  url: x.secure_url,
  publicId: x.public_id,
  resourceType: x.resource_type,
  bytes: x.bytes,
  width: x.width,
  height: x.height,
  format: x.format,
  originalFilename: x.original_filename,
  createdAt: x.created_at,
  lqipUrl: eagerAt(x, 0),
  thumbnailUrl: eagerAt(x, 1),
  mediumUrl: eagerAt(x, 2),
  optimizedUrl: eagerAt(x, 3) || x.secure_url,
  avifUrl: eagerAt(x, 4),
  responsiveBreakpoints: x.responsive_breakpoints?.[0]?.breakpoints || [],
  processing: {
    quality: x._processing?.quality,
    cropPreset: x._processing?.cropPreset,
    targetWidth: x._processing?.targetWidth,
    targetHeight: x._processing?.targetHeight,
    preserveExif: Boolean(x._processing?.preserveExif),
    webp: Boolean(eagerAt(x, 3)),
    avif: Boolean(eagerAt(x, 4)),
  },
});
const saveCloudAsset = async ({
  file,
  result,
  folder,
  purpose,
  relativePath,
  user,
  virusScan,
  department = '',
  branch = '',
}) =>
  CloudAsset.findOneAndUpdate(
    { publicId: result.public_id },
    {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      purpose,
      folder,
      relativePath,
      sha256: file.sha256 || hashFile(file),
      processing: {
        quality: result._processing?.quality,
        cropPreset: result._processing?.cropPreset,
        targetWidth: result._processing?.targetWidth,
        targetHeight: result._processing?.targetHeight,
        preserveExif: Boolean(result._processing?.preserveExif),
        webp: Boolean(eagerAt(result, 3)),
        avif: Boolean(eagerAt(result, 4)),
        lqipUrl: eagerAt(result, 0),
        thumbnailUrl: eagerAt(result, 1),
        mediumUrl: eagerAt(result, 2),
        optimizedUrl: eagerAt(result, 3) || result.secure_url,
        avifUrl: eagerAt(result, 4),
        responsiveBreakpoints: result.responsive_breakpoints?.[0]?.breakpoints || [],
      },
      virusScan,
      status: 'active',
      uploadedBy: user?._id,
      ownerRole: user?.role,
      department,
      branch,
      lastModifiedBy: user?._id,
      version: result.version,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

const cloudTokenHash = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
const cloudRoleFolders = {
  admin: ['hmn/'],
  manager: ['hmn/'],
  accountant: ['hmn/expenses', 'hmn/invoices', 'hmn/temp'],
  sales: ['hmn/customers', 'hmn/invoices', 'hmn/temp'],
  warehouse: ['hmn/products', 'hmn/products/thumbnails', 'hmn/temp'],
  operator: ['hmn/customers', 'hmn/suppliers', 'hmn/expenses', 'hmn/temp'],
  viewer: [],
};
const canCloudAction = (user, action, folder = '') => {
  if (user?.permissions?.includes('*') || user?.role === 'admin') return true;
  if (action === 'download') return Boolean(user);
  if (action === 'delete') return false;
  const allowed = cloudRoleFolders[user?.role] || [];
  return allowed.some((prefix) => String(folder).startsWith(prefix));
};
const ensureCloudAction = (req, action, folder) => {
  if (!canCloudAction(req.user, action, folder)) {
    const e = new Error(
      `Cloudinary ${action} is not permitted for role ${req.user?.role || 'unknown'} in ${folder || 'this folder'}`,
    );
    e.status = 403;
    throw e;
  }
};
const logCloudAccess = (payload) => CloudAccessLog.create(payload).catch(() => null);
export const issueCloudUploadToken = async (req, res) => {
  const folder = cloudFolder(req.body),
    purpose = req.body.purpose || 'general';
  ensureCloudAction(req, 'upload', folder);
  const ttl = Math.min(900, Math.max(30, Number(process.env.CLOUDINARY_SIGNED_UPLOAD_TTL_SECONDS || 300))),
    plain = crypto.randomBytes(32).toString('hex'),
    expiresAt = new Date(Date.now() + ttl * 1000);
  await CloudUploadToken.create({
    tokenHash: cloudTokenHash(plain),
    user: req.user._id,
    folder,
    purpose,
    expiresAt,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await logCloudAccess({
    user: req.user._id,
    action: 'signature',
    success: true,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { folder, purpose, expiresAt },
  });
  res.json({ uploadToken: plain, expiresAt, ttlSeconds: ttl, oneTime: true });
};
const consumeCloudUploadToken = async (req, folder, purpose) => {
  if (String(process.env.CLOUDINARY_REQUIRE_UPLOAD_TOKEN || 'true') !== 'true') return;
  const plain = req.body.uploadToken || req.get('x-upload-token');
  if (!plain) {
    const e = new Error('One-time upload token is required');
    e.status = 401;
    throw e;
  }
  const token = await CloudUploadToken.findOne({
    tokenHash: cloudTokenHash(plain),
    user: req.user._id,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!token) {
    const e = new Error('Upload token is invalid, expired, or already used');
    e.status = 401;
    throw e;
  }
  if (token.folder !== folder || token.purpose !== purpose) {
    const e = new Error('Upload token scope does not match folder/purpose');
    e.status = 403;
    throw e;
  }
  token.usedAt = new Date();
  await token.save();
};
const attemptMeta = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
  uploadedBy: req.user?._id,
  folder: cloudFolder(req.body),
  purpose: req.body.purpose || 'general',
});

export const upload = async (req, res) => {
  const started = Date.now(),
    folder = cloudFolder(req.body),
    purpose = req.body.purpose || 'general';
  let attempt;
  try {
    ensureCloudAction(req, 'upload', folder);
    await consumeCloudUploadToken(req, folder, purpose);
    if (!req.file) return res.status(400).json({ message: 'File required' });
    attempt = await CloudUploadAttempt.create({
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'pending',
      ...attemptMeta(req),
    });
    const validation = await validateCloudFiles([req.file]);
    if (validation.errors.length) {
      await CloudUploadAttempt.findByIdAndUpdate(attempt._id, {
        status: 'blocked',
        durationMs: Date.now() - started,
        errorCategory: 'validation',
        errorMessage: validation.errors.map((x) => x.message).join('; '),
      });
      await logCloudAccess({
        user: req.user._id,
        action: 'failed-upload',
        success: false,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        error: 'Validation failed',
        metadata: { errors: validation.errors, folder, purpose },
      });
      return res
        .status(400)
        .json({ message: 'File validation failed', errors: validation.errors, warnings: validation.warnings });
    }
    const virusScan = await virusScanFile(req.file);
    if (virusScan.status === 'infected') {
      await CloudUploadAttempt.findByIdAndUpdate(attempt._id, {
        status: 'blocked',
        durationMs: Date.now() - started,
        errorCategory: 'virus',
        errorMessage: virusScan.message || 'Infected file',
      });
      return res.status(400).json({
        message: 'Upload blocked by virus scanner',
        errors: [{ message: virusScan.message || 'Infected file detected' }],
      });
    }
    const result = await svc.uploadCloud(req.file, folder, {
      ...processingOptions(req.body),
      purpose,
      context: { purpose, uploaded_by: String(req.user?._id || '') },
    });
    const asset = await saveCloudAsset({
      file: req.file,
      result,
      folder,
      purpose,
      relativePath: '',
      user: req.user,
      virusScan,
      department: req.body.department || '',
      branch: req.body.branch || '',
    });
    await CloudUploadAttempt.findByIdAndUpdate(attempt._id, {
      status: 'success',
      asset: asset._id,
      durationMs: Date.now() - started,
    });
    await logCloudAccess({
      asset: asset._id,
      publicId: asset.publicId,
      user: req.user._id,
      action: 'upload',
      success: true,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      version: asset.version,
      metadata: { folder, purpose, bytes: asset.bytes },
    });
    await AuditLog.create({
      user: req.user?._id,
      action: 'CLOUDINARY_FILE_UPLOADED',
      entity: 'Integration',
      description: `Uploaded ${req.file.originalname}`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        publicId: result.public_id,
        sha256: req.file.sha256,
        bytes: result.bytes,
        mimeType: req.file.mimetype,
        folder,
        processing: processingOptions(req.body),
        virusScan: virusScan.status,
      },
    });
    res.status(201).json({ ...mapCloudResult(result), assetId: asset._id, virusScan });
  } catch (e) {
    if (attempt)
      await CloudUploadAttempt.findByIdAndUpdate(attempt._id, {
        status: 'failed',
        durationMs: Date.now() - started,
        errorCategory: e.status === 403 ? 'permission' : 'provider',
        errorMessage: e.message,
        stackRef: crypto
          .createHash('sha1')
          .update(e.stack || e.message)
          .digest('hex')
          .slice(0, 12),
      });
    await logCloudAccess({
      user: req.user?._id,
      action: 'failed-upload',
      success: false,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      error: e.message,
      metadata: { folder, purpose },
    });
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const uploadMultiple = async (req, res) => {
  const files = req.files || [],
    folder = cloudFolder(req.body),
    purpose = req.body.purpose || 'general';
  try {
    ensureCloudAction(req, 'upload', folder);
    await consumeCloudUploadToken(req, folder, purpose);
    const validation = await validateCloudFiles(files);
    if (validation.errors.length) {
      await CloudUploadAttempt.insertMany(
        files.map((f) => ({
          filename: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          folder,
          purpose,
          status: 'blocked',
          uploadedBy: req.user._id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          errorCategory: 'validation',
          errorMessage: validation.errors
            .filter((x) => x.name === f.originalname)
            .map((x) => x.message)
            .join('; '),
        })),
      );
      return res
        .status(400)
        .json({ message: 'File validation failed', errors: validation.errors, warnings: validation.warnings });
    }
    const relativePaths = (() => {
      try {
        return JSON.parse(req.body.relativePaths || '[]');
      } catch {
        return [];
      }
    })();
    const scans = await Promise.all(files.map(virusScanFile));
    const infected = scans.map((x, i) => ({ scan: x, file: files[i] })).filter((x) => x.scan.status === 'infected');
    if (infected.length)
      return res.status(400).json({
        message: 'Upload blocked by virus scanner',
        errors: infected.map((x) => ({
          name: x.file.originalname,
          message: x.scan.message || 'Infected file detected',
        })),
      });
    const results = await svc.uploadCloudMany(files, folder, {
      ...processingOptions(req.body),
      purpose,
      context: { purpose, uploaded_by: String(req.user?._id || '') },
      concurrency: req.body.concurrency,
    });
    const uploaded = [],
      failed = [];
    for (let i = 0; i < results.length; i++) {
      const x = results[i],
        file = files[i],
        started = Date.now();
      if (x.ok) {
        const asset = await saveCloudAsset({
          file,
          result: x.result,
          folder,
          purpose,
          relativePath: relativePaths[i] || '',
          user: req.user,
          virusScan: scans[i],
          department: req.body.department || '',
          branch: req.body.branch || '',
        });
        await CloudUploadAttempt.create({
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          folder,
          purpose,
          status: 'success',
          uploadedBy: req.user._id,
          asset: asset._id,
          durationMs: Date.now() - started,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });
        await logCloudAccess({
          asset: asset._id,
          publicId: asset.publicId,
          user: req.user._id,
          action: 'upload',
          success: true,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          version: asset.version,
        });
        uploaded.push({
          ...mapCloudResult(x.result),
          assetId: asset._id,
          file: x.file,
          relativePath: relativePaths[i] || '',
          virusScan: scans[i],
        });
      } else {
        await CloudUploadAttempt.create({
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          folder,
          purpose,
          status: 'failed',
          uploadedBy: req.user._id,
          errorCategory: 'provider',
          errorMessage: x.error,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });
        failed.push({ file: x.file, message: x.error });
      }
    }
    await AuditLog.create({
      user: req.user?._id,
      action: 'CLOUDINARY_FILES_UPLOADED',
      entity: 'Integration',
      description: `Uploaded ${uploaded.length} file(s)`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        folder,
        total: files.length,
        uploaded: uploaded.length,
        failed: failed.length,
        concurrency: Number(req.body.concurrency || 3),
      },
    });
    res.status(failed.length ? 207 : 201).json({
      message: failed.length ? 'Upload completed with some failures' : 'Files uploaded successfully',
      folder,
      total: files.length,
      uploaded,
      failed,
      warnings: validation.warnings,
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const cloudUploadHistory = async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.folder) q.folder = { $regex: req.query.folder, $options: 'i' };
  if (req.query.uploader) q.uploadedBy = req.query.uploader;
  if (req.query.favorite === 'true') q.favorite = true;
  if (req.query.locked === 'true') q.locked = true;
  if (req.query.tag) q.tags = req.query.tag;
  if (req.query.search) q.filename = { $regex: req.query.search, $options: 'i' };
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50))),
    items = await CloudUploadAttempt.find(q)
      .populate('uploadedBy', 'name email role')
      .populate('asset', 'publicId secureUrl folder')
      .sort({ createdAt: -1 })
      .limit(limit);
  res.json(items);
};
export const cloudFailedUploads = async (req, res) =>
  res.json(
    await CloudUploadAttempt.find({ status: { $in: ['failed', 'blocked'] } })
      .populate('uploadedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(200),
  );
export const cloudAssets = async (req, res) => {
  const q = {};
  if (req.query.status === 'all') {
  } else if (req.query.status) q.status = req.query.status;
  else q.status = { $ne: 'deleted' };
  if (req.query.folder) q.folder = { $regex: req.query.folder, $options: 'i' };
  if (req.query.type) q.resourceType = req.query.type;
  if (req.query.uploader) q.uploadedBy = req.query.uploader;
  if (req.query.favorite === 'true') q.favorite = true;
  if (req.query.locked === 'true') q.locked = true;
  if (req.query.tag) q.tags = req.query.tag;
  if (req.query.minSize) q.bytes = { ...(q.bytes || {}), $gte: Number(req.query.minSize) * 1048576 };
  if (req.query.maxSize) q.bytes = { ...(q.bytes || {}), $lte: Number(req.query.maxSize) * 1048576 };
  if (req.query.dateFrom || req.query.dateTo)
    q.createdAt = {
      ...(req.query.dateFrom ? { $gte: new Date(req.query.dateFrom) } : {}),
      ...(req.query.dateTo ? { $lte: new Date(req.query.dateTo + 'T23:59:59') } : {}),
    };
  if (req.query.search)
    q.$or = [
      { originalFilename: { $regex: req.query.search, $options: 'i' } },
      { publicId: { $regex: req.query.search, $options: 'i' } },
      { purpose: { $regex: req.query.search, $options: 'i' } },
      { tags: { $regex: req.query.search, $options: 'i' } },
      { notes: { $regex: req.query.search, $options: 'i' } },
      { folder: { $regex: req.query.search, $options: 'i' } },
    ];
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100))),
    page = Math.max(1, Number(req.query.page || 1));
  const items = await CloudAsset.find(q)
    .populate(
      'uploadedBy lastModifiedBy lastAccessedBy copiedFrom lockedBy versions.createdBy versions.approvedBy',
      'name email role originalFilename',
    )
    .sort(
      req.query.sort === 'name'
        ? { originalFilename: 1 }
        : req.query.sort === 'size'
          ? { bytes: -1 }
          : { createdAt: -1 },
    )
    .skip((page - 1) * limit)
    .limit(limit);
  res.json(items);
};
export const cloudDownload = async (req, res) => {
  let asset;
  try {
    asset = await CloudAsset.findById(req.params.id);
    if (!asset || asset.status === 'deleted') throw Object.assign(new Error('Asset not found'), { status: 404 });
    ensureCloudAction(req, 'download', asset.folder);
    const remote = await axios.get(asset.secureUrl, {
      responseType: 'arraybuffer',
      timeout: Number(process.env.CLOUDINARY_DOWNLOAD_TIMEOUT_MS || 30000),
    });
    asset.downloadCount = (asset.downloadCount || 0) + 1;
    asset.lastAccessedBy = req.user._id;
    asset.lastAccessedAt = new Date();
    await asset.save();
    await logCloudAccess({
      asset: asset._id,
      publicId: asset.publicId,
      user: req.user._id,
      action: 'download',
      success: true,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      version: asset.version,
      metadata: { folder: asset.folder, filename: asset.originalFilename },
    });
    res.setHeader('Content-Type', asset.mimeType || remote.headers['content-type'] || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalFilename || 'download')}`,
    );
    res.send(Buffer.from(remote.data));
  } catch (e) {
    await logCloudAccess({
      asset: asset?._id,
      publicId: asset?.publicId,
      user: req.user?._id,
      action: 'download',
      success: false,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      error: e.message,
    });
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const cloudAccessHistory = async (req, res) => {
  const q = {};
  if (req.query.action) q.action = req.query.action;
  if (req.query.success !== '') q.success = req.query.success === 'true';
  res.json(
    await CloudAccessLog.find(q)
      .populate('user', 'name email role')
      .populate('asset', 'originalFilename secureUrl folder')
      .sort({ createdAt: -1 })
      .limit(Math.min(500, Number(req.query.limit || 100))),
  );
};
export const cloudAnalytics = async (req, res) => {
  const [summary, byFolder, byUploader, dailyUploads, dailyDownloads, largest] = await Promise.all([
    CloudAsset.aggregate([
      { $match: { status: { $ne: 'deleted' } } },
      {
        $group: {
          _id: null,
          totalAssets: { $sum: 1 },
          totalBytes: { $sum: '$bytes' },
          images: { $sum: { $cond: [{ $eq: ['$resourceType', 'image'] }, 1, 0] } },
          documents: { $sum: { $cond: [{ $ne: ['$resourceType', 'image'] }, 1, 0] } },
        },
      },
    ]),
    CloudAsset.aggregate([
      { $match: { status: { $ne: 'deleted' } } },
      {
        $group: {
          _id: '$folder',
          count: { $sum: 1 },
          bytes: { $sum: '$bytes' },
          downloads: { $sum: '$downloadCount' },
        },
      },
      { $sort: { bytes: -1 } },
      { $limit: 20 },
    ]),
    CloudAsset.aggregate([
      { $match: { status: { $ne: 'deleted' } } },
      { $group: { _id: '$uploadedBy', count: { $sum: 1 }, bytes: { $sum: '$bytes' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ]),
    CloudAsset.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          bytes: { $sum: '$bytes' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    CloudAccessLog.aggregate([
      { $match: { action: 'download', success: true, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    CloudAsset.find({ status: { $ne: 'deleted' } })
      .sort({ bytes: -1 })
      .limit(10)
      .select('originalFilename bytes folder downloadCount secureUrl')
      .lean(),
  ]);
  let providerUsage = null;
  try {
    providerUsage = await svc.cloudinaryUsage();
  } catch {}
  const s = summary[0] || { totalAssets: 0, totalBytes: 0, images: 0, documents: 0 };
  res.json({
    summary: {
      ...s,
      videos: 0,
      remainingQuotaBytes: Math.max(0, Number(process.env.CLOUDINARY_ACCOUNT_QUOTA_MB || 0) * 1048576 - s.totalBytes),
    },
    byFolder,
    topUploaders: byUploader.map((x) => ({
      user: x.user ? { id: x.user._id, name: x.user.name, email: x.user.email } : null,
      count: x.count,
      bytes: x.bytes,
    })),
    dailyUploads,
    dailyDownloads,
    largest,
    providerUsage,
    generatedAt: new Date(),
  });
};
export const cloudFolderStats = async (req, res) => {
  const rows = await CloudAsset.aggregate([
    { $match: { status: { $ne: 'deleted' } } },
    {
      $group: {
        _id: '$folder',
        count: { $sum: 1 },
        bytes: { $sum: '$bytes' },
        images: { $sum: { $cond: [{ $eq: ['$resourceType', 'image'] }, 1, 0] } },
      },
    },
    { $sort: { bytes: -1 } },
  ]);
  const quota = Number(process.env.CLOUDINARY_FOLDER_QUOTA_MB || 2048) * 1048576;
  res.json({
    quotaBytes: quota,
    folders: rows.map((x) => ({
      folder: x._id || 'unknown',
      count: x.count,
      bytes: x.bytes,
      images: x.images,
      quotaPercent: quota ? Math.round((x.bytes * 100) / quota) : 0,
      overQuota: x.bytes > quota,
    })),
  });
};
export const archiveOldCloudAssets = async (req, res) => {
  const days = Math.max(1, Number(req.body.days || process.env.CLOUDINARY_ARCHIVE_AFTER_DAYS || 180)),
    cutoff = new Date(Date.now() - days * 86400000);
  const result = await CloudAsset.updateMany(
    { status: 'active', createdAt: { $lt: cutoff }, purpose: { $ne: 'company' } },
    { $set: { status: 'archived', archivedAt: new Date() } },
  );
  await AuditLog.create({
    user: req.user?._id,
    action: 'CLOUDINARY_ASSETS_ARCHIVED',
    entity: 'Integration',
    description: `Archived ${result.modifiedCount} old asset(s)`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { days, cutoff },
  });
  res.json({ message: 'Archive completed', days, archived: result.modifiedCount });
};
export const deleteUpload = async (req, res) => {
  const asset = await CloudAsset.findOne({ publicId: req.body.publicId });
  ensureCloudAction(req, 'delete', asset?.folder || '');
  const result = await svc.deleteCloud(req.body.publicId, req.body.resourceType);
  if (asset) {
    asset.status = 'deleted';
    asset.deletedAt = new Date();
    asset.lastModifiedBy = req.user._id;
    await asset.save();
  }
  await logCloudAccess({
    asset: asset?._id,
    publicId: req.body.publicId,
    user: req.user._id,
    action: 'delete',
    success: true,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    version: asset?.version,
  });
  await AuditLog.create({
    user: req.user?._id,
    action: 'CLOUDINARY_FILE_DELETED',
    entity: 'Integration',
    description: `Deleted ${req.body.publicId}`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { publicId: req.body.publicId, resourceType: req.body.resourceType },
  });
  res.json(result);
};

const safeCloudSegment = (value) =>
  String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
const assetOr404 = async (id) => {
  const asset = await CloudAsset.findById(id);
  if (!asset) {
    const e = new Error('Cloud asset not found');
    e.status = 404;
    throw e;
  }
  return asset;
};
const cloudAudit = async (req, asset, action, description, before = {}, after = {}) => {
  await logCloudAccess({
    asset: asset?._id,
    publicId: asset?.publicId,
    user: req.user?._id,
    action,
    success: true,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    version: asset?.version,
    metadata: { before, after },
  });
  await AuditLog.create({
    user: req.user?._id,
    action: `CLOUDINARY_${action.toUpperCase().replace(/-/g, '_')}`,
    entity: 'CloudAsset',
    entityId: asset?._id,
    description,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    before,
    after,
  });
};
const assertUnlocked = (asset, user) => {
  if (
    asset.locked &&
    String(asset.lockedBy || '') !== String(user?._id || '') &&
    !['admin', 'super-admin'].includes(user?.role)
  ) {
    const e = new Error('File is locked by another user');
    e.status = 423;
    throw e;
  }
};
const snapshotVersion = (asset, user) => ({
  publicId: asset.publicId,
  secureUrl: asset.secureUrl,
  version: asset.version,
  folder: asset.folder,
  originalFilename: asset.originalFilename,
  createdAt: new Date(),
  createdBy: user?._id,
});
export const updateCloudAssetMetadata = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    assertUnlocked(asset, req.user);
    const before = {
      favorite: asset.favorite,
      tags: asset.tags,
      notes: asset.notes,
      retentionUntil: asset.retentionUntil,
      legalHold: asset.legalHold,
    };
    if (req.body.favorite !== undefined) asset.favorite = Boolean(req.body.favorite);
    if (Array.isArray(req.body.tags))
      asset.tags = [...new Set(req.body.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    if (req.body.notes !== undefined) asset.notes = String(req.body.notes || '').slice(0, 4000);
    if (req.body.retentionUntil !== undefined)
      asset.retentionUntil = req.body.retentionUntil ? new Date(req.body.retentionUntil) : undefined;
    if (req.body.legalHold !== undefined) {
      if (!['admin', 'super-admin'].includes(req.user.role))
        return res.status(403).json({ message: 'Only administrators can change legal hold' });
      asset.legalHold = Boolean(req.body.legalHold);
    }
    asset.lastModifiedBy = req.user._id;
    await asset.save();
    await cloudAudit(req, asset, 'metadata-update', `Updated metadata for ${asset.originalFilename}`, before, {
      favorite: asset.favorite,
      tags: asset.tags,
      notes: asset.notes,
      retentionUntil: asset.retentionUntil,
      legalHold: asset.legalHold,
    });
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const lockCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    if (
      asset.locked &&
      String(asset.lockedBy) !== String(req.user._id) &&
      !['admin', 'super-admin'].includes(req.user.role)
    )
      return res.status(423).json({ message: 'File is already locked' });
    asset.locked = true;
    asset.lockedBy = req.user._id;
    asset.lockedAt = new Date();
    await asset.save();
    await cloudAudit(req, asset, 'lock', `Locked ${asset.originalFilename}`);
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const unlockCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    if (
      asset.locked &&
      String(asset.lockedBy) !== String(req.user._id) &&
      !['admin', 'super-admin'].includes(req.user.role)
    )
      return res.status(403).json({ message: 'Only lock owner or administrator can unlock' });
    asset.locked = false;
    asset.lockedBy = undefined;
    asset.lockedAt = undefined;
    await asset.save();
    await cloudAudit(req, asset, 'unlock', `Unlocked ${asset.originalFilename}`);
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const cloudAssetVersions = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'download', asset.folder);
    res.json((asset.versions || []).slice().reverse());
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const restoreCloudAssetVersion = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    assertUnlocked(asset, req.user);
    const version = asset.versions.id(req.params.versionId);
    if (!version) return res.status(404).json({ message: 'Version not found' });
    const before = snapshotVersion(asset, req.user);
    const result = await svc.copyCloud(
      version.secureUrl,
      `${version.folder}/${safeCloudSegment(version.originalFilename)}-restored-${Date.now()}`,
      asset.resourceType,
    );
    asset.versions = [...(asset.versions || []), before].slice(-30);
    asset.publicId = result.public_id;
    asset.secureUrl = result.secure_url;
    asset.version = result.version;
    asset.folder = version.folder;
    asset.originalFilename = version.originalFilename;
    asset.lastModifiedBy = req.user._id;
    await asset.save();
    await cloudAudit(req, asset, 'version-restore', `Restored previous version of ${asset.originalFilename}`);
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const bulkCopyCloudAssets = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [],
      folder = String(req.body.folder || '')
        .replace(/[^a-zA-Z0-9/_-]/g, '')
        .replace(/^\/+|\/+$/g, '');
    if (!ids.length || !folder) return res.status(400).json({ message: 'ids and destination folder are required' });
    ensureCloudAction(req, 'upload', folder);
    const results = [];
    for (const id of ids.slice(0, 100)) {
      const source = await assetOr404(id);
      ensureCloudAction(req, 'download', source.folder);
      const r = await svc.copyCloud(
        source.secureUrl,
        `${folder}/${safeCloudSegment(source.originalFilename)}-copy-${Date.now()}-${results.length}`,
        source.resourceType,
      );
      results.push(
        await CloudAsset.create({
          publicId: r.public_id,
          secureUrl: r.secure_url,
          resourceType: r.resource_type || source.resourceType,
          format: r.format || source.format,
          bytes: r.bytes || source.bytes,
          width: r.width || source.width,
          height: r.height || source.height,
          originalFilename: `Copy of ${source.originalFilename}`,
          mimeType: source.mimeType,
          purpose: source.purpose,
          folder,
          status: 'active',
          copiedFrom: source._id,
          uploadedBy: req.user._id,
          ownerRole: req.user.role,
          lastModifiedBy: req.user._id,
          version: r.version,
        }),
      );
    }
    await cloudAudit(req, null, 'bulk-copy', `Copied ${results.length} assets`);
    res.status(201).json({ count: results.length, assets: results });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const bulkPermanentDeleteCloudAssets = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const assets = await CloudAsset.find({ _id: { $in: ids }, status: 'deleted' });
    const blocked = assets.filter((a) => a.legalHold || (a.retentionUntil && a.retentionUntil > new Date()));
    if (blocked.length)
      return res.status(409).json({ message: 'Some files are protected by legal hold or retention policy' });
    for (const asset of assets) {
      try {
        await svc.deleteCloud(asset.publicId, asset.resourceType);
      } catch (e) {
        if (e.http_code !== 404) throw e;
      }
      await asset.deleteOne();
    }
    await cloudAudit(req, null, 'bulk-permanent-delete', `Permanently deleted ${assets.length} assets`);
    res.json({ success: true, count: assets.length });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const renameCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    assertUnlocked(asset, req.user);
    asset.versions = [...(asset.versions || []), snapshotVersion(asset, req.user)].slice(-30);
    const base = safeCloudSegment(req.body.name);
    if (!base) return res.status(400).json({ message: 'Valid new file name is required' });
    const old = { publicId: asset.publicId, originalFilename: asset.originalFilename };
    const prefix = asset.publicId.split('/').slice(0, -1).join('/'),
      newPublicId = `${prefix}/${base}`;
    const result = await svc.renameCloud(asset.publicId, newPublicId, asset.resourceType);
    asset.previousPublicIds = [...(asset.previousPublicIds || []), asset.publicId].slice(-20);
    asset.publicId = result.public_id;
    asset.secureUrl = result.secure_url || asset.secureUrl;
    asset.originalFilename =
      req.body.keepExtension === false
        ? base
        : `${base}${asset.originalFilename?.includes('.') ? '.' + asset.originalFilename.split('.').pop() : ''}`;
    asset.version = result.version || asset.version;
    asset.lastModifiedBy = req.user._id;
    await asset.save();
    await cloudAudit(req, asset, 'rename', `Renamed ${old.originalFilename} to ${asset.originalFilename}`, old, {
      publicId: asset.publicId,
      originalFilename: asset.originalFilename,
    });
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const moveCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    assertUnlocked(asset, req.user);
    asset.versions = [...(asset.versions || []), snapshotVersion(asset, req.user)].slice(-30);
    const folder = String(req.body.folder || '')
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .replace(/^\/+|\/+$/g, '');
    if (!folder) return res.status(400).json({ message: 'Destination folder is required' });
    ensureCloudAction(req, 'upload', folder);
    const old = { publicId: asset.publicId, folder: asset.folder };
    const basename = asset.publicId.split('/').pop(),
      newPublicId = `${folder}/${basename}`;
    const result = await svc.renameCloud(asset.publicId, newPublicId, asset.resourceType);
    asset.previousPublicIds = [...(asset.previousPublicIds || []), asset.publicId].slice(-20);
    asset.publicId = result.public_id;
    asset.secureUrl = result.secure_url || asset.secureUrl;
    asset.folder = folder;
    asset.version = result.version || asset.version;
    asset.lastModifiedBy = req.user._id;
    await asset.save();
    await cloudAudit(req, asset, 'move', `Moved ${asset.originalFilename} to /${folder}`, old, {
      publicId: asset.publicId,
      folder,
    });
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const copyCloudAsset = async (req, res) => {
  try {
    const source = await assetOr404(req.params.id);
    ensureCloudAction(req, 'download', source.folder);
    const folder = String(req.body.folder || source.folder)
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .replace(/^\/+|\/+$/g, '');
    ensureCloudAction(req, 'upload', folder);
    const name = safeCloudSegment(req.body.name || `${source.originalFilename || 'copy'}-copy-${Date.now()}`),
      newPublicId = `${folder}/${name}`;
    const result = await svc.copyCloud(source.secureUrl, newPublicId, source.resourceType);
    const copy = await CloudAsset.create({
      publicId: result.public_id,
      secureUrl: result.secure_url,
      resourceType: result.resource_type || source.resourceType,
      format: result.format || source.format,
      bytes: result.bytes || source.bytes,
      width: result.width || source.width,
      height: result.height || source.height,
      originalFilename: req.body.filename || `Copy of ${source.originalFilename}`,
      mimeType: source.mimeType,
      purpose: source.purpose,
      folder,
      relativePath: source.relativePath,
      sha256: source.sha256,
      processing: source.processing,
      virusScan: source.virusScan,
      status: 'active',
      copiedFrom: source._id,
      uploadedBy: req.user._id,
      ownerRole: req.user.role,
      department: req.body.department || source.department,
      branch: req.body.branch || source.branch,
      lastModifiedBy: req.user._id,
      version: result.version,
    });
    await cloudAudit(
      req,
      copy,
      'copy',
      `Copied ${source.originalFilename}`,
      { sourceId: source._id, sourcePublicId: source.publicId },
      { copyId: copy._id, publicId: copy.publicId, folder },
    );
    res.status(201).json(copy);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const softDeleteCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'delete', asset.folder);
    if (asset.status === 'deleted') return res.json(asset);
    const before = { status: asset.status };
    asset.status = 'deleted';
    asset.softDeletedAt = new Date();
    asset.deletedAt = new Date();
    asset.lastModifiedBy = req.user._id;
    await asset.save();
    await cloudAudit(req, asset, 'soft-delete', `Soft deleted ${asset.originalFilename}`, before, {
      status: 'deleted',
    });
    res.json(asset);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const restoreCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'upload', asset.folder);
    await svc.cloudResource(asset.publicId, asset.resourceType);
    const before = { status: asset.status };
    asset.status = 'active';
    asset.restoredAt = new Date();
    asset.deletedAt = undefined;
    asset.softDeletedAt = undefined;
    asset.archivedAt = undefined;
    asset.lastModifiedBy = req.user._id;
    await asset.save();
    await cloudAudit(req, asset, 'restore', `Restored ${asset.originalFilename}`, before, { status: 'active' });
    res.json(asset);
  } catch (e) {
    res
      .status(e.http_code === 404 ? 410 : e.status || 500)
      .json({ message: e.http_code === 404 ? 'Cloud file is missing and cannot be restored' : e.message });
  }
};
export const permanentDeleteCloudAsset = async (req, res) => {
  try {
    const asset = await assetOr404(req.params.id);
    ensureCloudAction(req, 'delete', asset.folder);
    if (asset.legalHold) return res.status(409).json({ message: 'File is under legal hold' });
    if (asset.retentionUntil && asset.retentionUntil > new Date())
      return res.status(409).json({ message: 'File retention period has not expired' });
    const before = asset.toObject();
    let providerResult;
    try {
      providerResult = await svc.deleteCloud(asset.publicId, asset.resourceType);
    } catch (e) {
      if (e.http_code !== 404) throw e;
    }
    await cloudAudit(req, asset, 'permanent-delete', `Permanently deleted ${asset.originalFilename}`, before, {
      providerResult,
    });
    await asset.deleteOne();
    res.json({ success: true, providerResult });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};
export const cloudSyncScan = async (req, res) => {
  try {
    ensureCloudAction(req, 'download', 'hmn');
    const dbAssets = await CloudAsset.find({ status: { $ne: 'deleted' } }).lean(),
      cloud = await svc.listCloudResources('hmn');
    const dbMap = new Map(dbAssets.map((x) => [x.publicId, x])),
      cloudMap = new Map(cloud.map((x) => [x.public_id, x]));
    const missingCloud = dbAssets
      .filter((x) => !cloudMap.has(x.publicId))
      .map((x) => ({ _id: x._id, publicId: x.publicId, filename: x.originalFilename, folder: x.folder }));
    const missingDatabase = cloud
      .filter((x) => !dbMap.has(x.public_id))
      .map((x) => ({
        publicId: x.public_id,
        secureUrl: x.secure_url,
        resourceType: x.resource_type,
        format: x.format,
        bytes: x.bytes,
        width: x.width,
        height: x.height,
        folder: x.asset_folder || x.public_id.split('/').slice(0, -1).join('/'),
      }));
    await logCloudAccess({
      user: req.user._id,
      action: 'sync-scan',
      success: true,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        databaseAssets: dbAssets.length,
        cloudAssets: cloud.length,
        missingCloud: missingCloud.length,
        missingDatabase: missingDatabase.length,
      },
    });
    res.json({
      databaseAssets: dbAssets.length,
      cloudAssets: cloud.length,
      missingCloud,
      missingDatabase,
      healthy: missingCloud.length === 0 && missingDatabase.length === 0,
      scannedAt: new Date(),
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};

export const cloudSyncReconcile = async (req, res) => {
  try {
    ensureCloudAction(req, 'delete', 'hmn');

    const dbAssets = await CloudAsset.find({ status: { $ne: 'deleted' } }).lean(),
      cloud = await svc.listCloudResources('hmn'),
      dbMap = new Map(dbAssets.map((x) => [x.publicId, x])),
      cloudMap = new Map(cloud.map((x) => [x.public_id, x]));
    let markedMissing = 0,
      imported = 0;
    if (req.body.markMissing !== false) {
      const ids = dbAssets.filter((x) => !cloudMap.has(x.publicId)).map((x) => x._id);
      if (ids.length) {
        const r = await CloudAsset.updateMany(
          { _id: { $in: ids } },
          {
            $set: { status: 'deleted', deletedAt: new Date(), softDeletedAt: new Date(), lastModifiedBy: req.user._id },
          },
        );
        markedMissing = r.modifiedCount;
      }
    }
    if (req.body.importOrphans === true) {
      for (const x of cloud.filter((x) => !dbMap.has(x.public_id))) {
        await CloudAsset.create({
          publicId: x.public_id,
          secureUrl: x.secure_url,
          resourceType: x.resource_type,
          format: x.format,
          bytes: x.bytes,
          width: x.width,
          height: x.height,
          originalFilename: x.original_filename || x.public_id.split('/').pop(),
          mimeType: x.resource_type === 'image' ? `image/${x.format || 'jpeg'}` : 'application/octet-stream',
          purpose: 'reconciled',
          folder: x.asset_folder || x.public_id.split('/').slice(0, -1).join('/'),
          status: 'active',
          uploadedBy: req.user._id,
          ownerRole: req.user.role,
          lastModifiedBy: req.user._id,
          version: x.version,
        });
        imported++;
      }
    }
    await logCloudAccess({
      user: req.user._id,
      action: 'sync-reconcile',
      success: true,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { markedMissing, imported },
    });
    res.json({ success: true, markedMissing, imported });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};

export const email = async (req, res) =>
  res.json({ success: true, messageId: (await svc.sendEmail(req.body)).messageId });
export const sms = async (req, res) => res.json({ success: true, result: await svc.sendSms(req.body) });
export const whatsapp = async (req, res) => res.json({ success: true, result: await svc.sendWhatsApp(req.body) });
export const distance = async (req, res) => res.json(await svc.mapsDistance(req.body));
export const geocode = async (req, res) => res.json(await svc.mapsGeocode(req.body.address));

const parseBool = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
const dateRangeFilter = (from, to) => {
  const q = {};
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  return q;
};
const parseColumns = (value) => {
  const allowed = [
    'name',
    'sku',
    'barcode',
    'qrCode',
    'category',
    'brand',
    'unit',
    'supplier',
    'warehouse',
    'purchasePrice',
    'salePrice',
    'wholesalePrice',
    'retailPrice',
    'tax',
    'availableStock',
    'minimumStock',
    'stockValue',
    'expiryDate',
    'active',
    'createdAt',
    'image',
    'batchNos',
    'lotNos',
  ];
  const requested = String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return requested.length
    ? requested.filter((x) => allowed.includes(x))
    : allowed.filter((x) => !['image', 'batchNos', 'lotNos'].includes(x));
};
const buildProductFilter = async (req) => {
  const q = { ...dateRangeFilter(req.query.from, req.query.to) };
  if (req.query.category) q.category = req.query.category;
  if (req.query.brand) q.brand = new RegExp(escapeRegex(req.query.brand), 'i');
  if (req.query.supplier && mongoose.isValidObjectId(req.query.supplier)) q.supplier = req.query.supplier;
  if (req.query.warehouse && mongoose.isValidObjectId(req.query.warehouse)) q.warehouse = req.query.warehouse;
  if (req.query.status === 'active') q.active = true;
  if (req.query.status === 'inactive') q.active = false;
  if (parseBool(req.query.lowStock)) q.$expr = { $lte: ['$availableStock', '$minimumStock'] };
  if (parseBool(req.query.outOfStock)) q.availableStock = { $lte: 0 };
  if (req.query.minPrice || req.query.maxPrice)
    q.salePrice = {
      ...(req.query.minPrice ? { $gte: Number(req.query.minPrice) } : {}),
      ...(req.query.maxPrice ? { $lte: Number(req.query.maxPrice) } : {}),
    };
  if (req.query.minStockValue || req.query.maxStockValue)
    q.$expr = {
      ...(q.$expr ? { $and: [q.$expr] } : {}),
      $and: [
        ...(q.$expr?.$and || []),
        ...(req.query.minStockValue
          ? [{ $gte: [{ $multiply: ['$availableStock', '$purchasePrice'] }, Number(req.query.minStockValue)] }]
          : []),
        ...(req.query.maxStockValue
          ? [{ $lte: [{ $multiply: ['$availableStock', '$purchasePrice'] }, Number(req.query.maxStockValue)] }]
          : []),
      ],
    };
  if (req.query.expiry === 'expired') q.expiryDate = { $lt: new Date() };
  if (req.query.expiry === 'soon') {
    const d = new Date();
    d.setDate(d.getDate() + Number(req.query.expiryDays || 30));
    q.expiryDate = { $gte: new Date(), $lte: d };
  }
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    q.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { brand: rx }, { category: rx }];
  }
  if (req.query.batch || req.query.lot) {
    const bq = {};
    if (req.query.batch) bq.batchNo = new RegExp(escapeRegex(req.query.batch), 'i');
    if (req.query.lot) bq.lotNo = new RegExp(escapeRegex(req.query.lot), 'i');
    const ids = await ProductBatch.distinct('product', bq);
    q._id = { $in: ids };
  }
  return q;
};
const productRowsForExport = async (req) => {
  const rows = await Product.find(await buildProductFilter(req))
    .populate('supplier', 'name company phone')
    .populate('warehouse', 'name code')
    .sort({ name: 1 })
    .lean();
  const ids = rows.map((x) => x._id);
  const batches = ids.length ? await ProductBatch.find({ product: { $in: ids } }).lean() : [];
  const byProduct = new Map();
  for (const b of batches) {
    const key = String(b.product);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(b);
  }
  return rows.map((x) => ({ ...x, _batches: byProduct.get(String(x._id)) || [] }));
};
const productExportRows = (rows, columns) =>
  rows.map((x) => {
    const full = {
      name: x.name,
      sku: x.sku || '',
      barcode: x.barcode || '',
      qrCode: x.qrCode || '',
      category: x.category || '',
      brand: x.brand || '',
      unit: x.unit || '',
      supplier: x.supplier?.name || x.supplier?.company || '',
      warehouse: x.warehouse?.name || '',
      purchasePrice: x.purchasePrice || 0,
      salePrice: x.salePrice || 0,
      wholesalePrice: x.wholesalePrice || 0,
      retailPrice: x.retailPrice || 0,
      tax: x.tax || 0,
      availableStock: x.availableStock || 0,
      minimumStock: x.minimumStock || 0,
      stockValue: Number(x.availableStock || 0) * Number(x.purchasePrice || 0),
      expiryDate: x.expiryDate ? new Date(x.expiryDate).toISOString().slice(0, 10) : '',
      active: x.active !== false,
      createdAt: x.createdAt ? new Date(x.createdAt).toISOString() : '',
      image: x.image || x.images?.[0] || '',
      batchNos: (x._batches || [])
        .map((b) => b.batchNo)
        .filter(Boolean)
        .join(', '),
      lotNos: (x._batches || [])
        .map((b) => b.lotNo)
        .filter(Boolean)
        .join(', '),
    };
    return Object.fromEntries(columns.map((k) => [k, full[k] ?? '']));
  });
const xmlEscape = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const rowsToXml = (rows) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<products>\n' +
  rows
    .map(
      (r) =>
        '  <product>\n' +
        Object.entries(r)
          .map(([k, v]) => `    <${k}>${xmlEscape(v)}</${k}>`)
          .join('\n') +
        '\n  </product>',
    )
    .join('\n') +
  '\n</products>';
const pdfOptions = (req) => ({
  size: 'A4',
  layout: req.query.orientation === 'landscape' ? 'landscape' : 'portrait',
  margin: 36,
  bufferPages: true,
  ...(req.query.pdfPassword
    ? {
        userPassword: String(req.query.pdfPassword),
        ownerPassword: crypto.randomBytes(12).toString('hex'),
        permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false },
      }
    : {}),
});
const streamPdf = (res, filename, title, req) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  const doc = new PDFDocument(pdfOptions(req));
  doc.pipe(res);
  doc
    .fontSize(28)
    .fillColor('#166534')
    .opacity(0.08)
    .rotate(-28, { origin: [300, 400] })
    .text(String(req.query.watermark || 'HMN AGRI TRADE'), 80, 330, { width: 500, align: 'center' })
    .rotate(28, { origin: [300, 400] })
    .opacity(1);
  doc
    .fontSize(18)
    .fillColor('#0f172a')
    .text(title, { align: 'center' })
    .fontSize(9)
    .fillColor('#64748b')
    .text(`Generated ${new Date().toLocaleString()} by ${req.user?.name || req.user?.email || 'HMN ERP'}`, {
      align: 'center',
    })
    .moveDown();
  return doc;
};
const imageBuffer = async (url) => {
  if (!url) return null;
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000, maxContentLength: 4 * 1024 * 1024 });
    return Buffer.from(r.data);
  } catch {
    return null;
  }
};
const addPageNumbers = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor('#64748b')
      .text(`Page ${i + 1} of ${range.count}`, 36, doc.page.height - 28, {
        align: 'center',
        width: doc.page.width - 72,
      });
  }
};
const buildProductsPdfBuffer = async (req, rows, data) =>
  new Promise(async (resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument(pdfOptions(req));
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(24).fillColor('#166534').text('HMN Agri Trade', { align: 'center' });
      doc.fontSize(16).fillColor('#0f172a').text('Product Export', { align: 'center' }).moveDown();
      const totalStock = rows.reduce((a, x) => a + Number(x.availableStock || 0), 0),
        totalValue = rows.reduce((a, x) => a + Number(x.availableStock || 0) * Number(x.purchasePrice || 0), 0);
      doc.roundedRect(36, doc.y, doc.page.width - 72, 60, 8).fillAndStroke('#f0fdf4', '#bbf7d0');
      doc
        .fillColor('#166534')
        .fontSize(11)
        .text(
          `Products: ${rows.length}    Total stock: ${totalStock.toLocaleString()}    Inventory value: PKR ${totalValue.toLocaleString()}`,
          48,
          doc.y + 18,
        );
      doc.moveDown(4);
      for (let i = 0; i < rows.length; i++) {
        const x = rows[i],
          d = data[i];
        if (doc.y > doc.page.height - 130) doc.addPage();
        const top = doc.y;
        let left = 36;
        if (parseBool(req.query.includeImages)) {
          const img = await imageBuffer(x.image || x.images?.[0]);
          if (img) {
            try {
              doc.image(img, left, top, { fit: [55, 55] });
              left += 65;
            } catch {}
          }
        }
        doc
          .fillColor('#0f172a')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(`${i + 1}. ${d.name || x.name} (${d.sku || x.sku || 'No SKU'})`, left, top, {
            width: doc.page.width - left - 36,
          });
        doc
          .font('Helvetica')
          .fillColor('#475569')
          .fontSize(8)
          .text(
            `Category: ${d.category ?? x.category} | Brand: ${(d.brand ?? x.brand) || '-'} | Stock: ${d.availableStock ?? x.availableStock} ${d.unit ?? x.unit} | Buy: ${d.purchasePrice ?? x.purchasePrice} | Sell: ${d.salePrice ?? x.salePrice}`,
            left,
            top + 16,
            { width: doc.page.width - left - 36 },
          );
        doc.text(
          `Warehouse: ${(d.warehouse ?? x.warehouse?.name) || '-'} | Supplier: ${(d.supplier ?? x.supplier?.name) || '-'} | Status: ${x.active === false ? 'Inactive' : 'Active'}`,
          left,
          top + 30,
          { width: doc.page.width - left - 36 },
        );
        doc.y = Math.max(doc.y, top + 66);
        doc
          .moveTo(36, doc.y)
          .lineTo(doc.page.width - 36, doc.y)
          .stroke('#e2e8f0');
        doc.moveDown(0.5);
      }
      addPageNumbers(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
export const exportProducts = async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const columns = parseColumns(req.query.columns);
  const rows = await productRowsForExport(req);
  const data = productExportRows(rows, columns);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'xlsx') {
    const buffer = await svc.formattedWorkbookBuffer(data, 'Products');
    res.setHeader('Content-Disposition', `attachment; filename=products-${stamp}.xlsx`);
    return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
  }
  if (format === 'csv') {
    const buffer = await svc.workbookBuffer(data, 'Products', 'csv');
    res.setHeader('Content-Disposition', `attachment; filename=products-${stamp}.csv`);
    return res.type('text/csv').send(buffer);
  }
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename=products-${stamp}.json`);
    return res
      .type('application/json')
      .send(
        Buffer.from(
          JSON.stringify(
            { summary: { count: rows.length, generatedAt: new Date().toISOString() }, products: data },
            null,
            2,
          ),
        ),
      );
  }
  if (format === 'xml') {
    res.setHeader('Content-Disposition', `attachment; filename=products-${stamp}.xml`);
    return res.type('application/xml').send(rowsToXml(data));
  }
  if (format === 'pdf') {
    const buffer = await buildProductsPdfBuffer(req, rows, data);
    res.setHeader('Content-Disposition', `attachment; filename=products-${stamp}.pdf`);
    return res.type('application/pdf').send(buffer);
  }
  if (format === 'zip') {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=products-export-${stamp}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => res.destroy(err));
    archive.pipe(res);
    archive.append(await svc.formattedWorkbookBuffer(data, 'Products'), { name: 'products.xlsx' });
    archive.append(await svc.workbookBuffer(data, 'Products', 'csv'), { name: 'products.csv' });
    archive.append(Buffer.from(JSON.stringify(data, null, 2)), { name: 'products.json' });
    archive.append(Buffer.from(rowsToXml(data)), { name: 'products.xml' });
    archive.append(await buildProductsPdfBuffer(req, rows, data), { name: 'products.pdf' });
    await archive.finalize();
    return;
  }
  return res.status(400).json({ message: 'Format must be xlsx, csv, pdf, json, xml or zip' });
};
const labelLayout = (value) =>
  ({
    a4_21: { cols: 3, rows: 7, w: 174, h: 105 },
    a4_24: { cols: 3, rows: 8, w: 174, h: 90 },
    a4_12: { cols: 2, rows: 6, w: 261, h: 120 },
  })[value] || { cols: 2, rows: 6, w: 261, h: 120 };
export const exportProductLabels = async (req, res) => {
  const type = req.params.type === 'qr' ? 'qr' : 'barcode';
  const rows = await productRowsForExport(req);
  const stamp = new Date().toISOString().slice(0, 10),
    layout = labelLayout(req.query.layout),
    size = Math.min(160, Math.max(40, Number(req.query.size || 90)));
  const title = type === 'qr' ? 'HMN Product QR Labels' : 'HMN Product Barcode Labels';
  const doc = streamPdf(res, `product-${type}-labels-${stamp}.pdf`, title, req);
  let index = 0;
  for (const x of rows) {
    const value = type === 'qr' ? x.qrCode || `HMN:PRODUCT:${x._id}` : x.barcode || x.sku || String(x._id);
    let img;
    try {
      img =
        type === 'qr'
          ? await QRCode.toBuffer(value, { width: size * 2, margin: 1 })
          : await bwipjs.toBuffer({
              bcid: 'code128',
              text: value,
              scale: 2,
              height: Math.max(8, Math.round(size / 8)),
              includetext: true,
              textxalign: 'center',
            });
    } catch {
      continue;
    }
    const slot = index % (layout.cols * layout.rows);
    if (index > 0 && slot === 0) doc.addPage();
    const col = slot % layout.cols,
      row = Math.floor(slot / layout.cols),
      xPos = 36 + col * layout.w,
      yPos = 76 + row * layout.h;
    doc.roundedRect(xPos + 3, yPos + 3, layout.w - 6, layout.h - 6, 6).stroke('#cbd5e1');
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#0f172a')
      .text(x.name, xPos + 8, yPos + 8, { width: layout.w - 16, align: 'center' });
    const maxW = layout.w - 24,
      maxH = layout.h - 35;
    doc.image(img, xPos + 12, yPos + 27, { fit: [Math.min(maxW, size * 1.5), Math.min(maxH, size)], align: 'center' });
    index++;
  }
  addPageNumbers(doc);
  doc.end();
};

export const createBackup = async (req, res) => {
  const record = await backupSvc.createBackup({
    provider: req.body.provider || 'local',
    createdBy: req.user._id,
    reason: 'manual',
  });
  res.status(201).json(record);
};
export const backups = async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)),
    limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const filter = {};
  if (req.query.provider) filter.provider = req.query.provider;
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    BackupRecord.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BackupRecord.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
};
export const backupSchedule = async (req, res) => res.json(backupSvc.schedulerStatus());
export const downloadBackup = async (req, res) => {
  const rec = await BackupRecord.findById(req.params.id);
  if (!rec) return res.status(404).json({ message: 'Backup not found' });
  const buffer = await backupSvc.readBackupRecord(rec);
  res.setHeader('Content-Disposition', `attachment; filename="${rec.name}"`);
  res.type('application/json').send(buffer);
};
export const verifyBackup = async (req, res) => {
  const rec = await BackupRecord.findById(req.params.id);
  if (!rec) return res.status(404).json({ message: 'Backup not found' });
  res.json({ ok: true, record: await backupSvc.verifyRecord(rec) });
};
export const previewRestore = async (req, res) => {
  const rec = await BackupRecord.findById(req.params.id);
  if (!rec) return res.status(404).json({ message: 'Backup not found' });
  res.json(await backupSvc.previewRestore(rec));
};
export const restoreBackup = async (req, res) => {
  const rec = await BackupRecord.findById(req.params.id);
  if (!rec) return res.status(404).json({ message: 'Backup not found' });
  if (req.body.confirm !== rec.name)
    return res.status(400).json({ message: 'Type the exact backup file name in confirm' });
  const record = await backupSvc.restoreRecord(rec, { collections: req.body.collections, createdBy: req.user._id });
  res.json({ message: 'Backup restored safely. A pre-restore safety backup was created.', record });
};
export const cleanupBackups = async (req, res) =>
  res.json(
    await backupSvc.cleanupOldBackups({
      retentionDays: Number(req.body.retentionDays || process.env.BACKUP_RETENTION_DAYS || 30),
      keepMinimum: Number(req.body.keepMinimum || process.env.BACKUP_KEEP_MINIMUM || 5),
    }),
  );
export const deleteBackup = async (req, res) => {
  const rec = await BackupRecord.findById(req.params.id);
  if (!rec) return res.status(404).json({ message: 'Backup not found' });
  await backupSvc.deleteBackupRecord(rec);
  res.json({ success: true });
};
export const exportEntity = async (req, res) => {
  const Model = entities[req.params.entity];
  if (!Model) return res.status(400).json({ message: 'Unsupported entity' });
  const rows = await Model.find().lean();
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const buffer = await svc.workbookBuffer(rows, req.params.entity, format);
  res.setHeader('Content-Disposition', `attachment; filename=${req.params.entity}.${format}`);
  res
    .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(buffer);
};
export const importEntity = async (req, res) => {
  const Model = entities[req.params.entity];
  if (!Model) return res.status(400).json({ message: 'Unsupported entity' });
  if (!req.file) return res.status(400).json({ message: 'Spreadsheet required' });
  const rows = (await svc.parseWorkbook(req.file.buffer)).map(clean);
  const errors = [];
  const valid = [];
  rows.forEach((row, i) => {
    if (['customers', 'suppliers', 'products'].includes(req.params.entity) && !row.name)
      errors.push({ row: i + 2, message: 'name is required' });
    else valid.push(row);
  });
  if (req.body.dryRun === 'true')
    return res.json({ total: rows.length, valid: valid.length, errors, preview: valid.slice(0, 10) });
  const inserted = valid.length ? await Model.insertMany(valid, { ordered: false }) : [];
  res.status(201).json({ inserted: inserted.length, errors });
};
export const createPayment = async (req, res) => {
  const reference = `PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  let external,
    status = 'pending',
    metadata = req.body.metadata || {};
  if (req.body.gateway === 'stripe') {
    external = await svc.stripeCreate({
      amount: req.body.amount,
      currency: req.body.currency || 'pkr',
      metadata: { reference, ...metadata },
    });
    status = external.status === 'succeeded' ? 'paid' : 'requires_action';
  }
  const item = await PaymentTransaction.create({
    ...req.body,
    reference,
    externalId: external?.id,
    status,
    metadata: { ...metadata, clientSecret: external?.client_secret },
    createdBy: req.user._id,
  });
  res.status(201).json(item);
};
export const payments = async (req, res) =>
  res.json(await PaymentTransaction.find().sort({ createdAt: -1 }).limit(200));
export const refund = async (req, res) => {
  const item = await PaymentTransaction.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Payment not found' });
  if (item.gateway === 'stripe') await svc.stripeRefund(item.externalId, req.body.amount);
  item.status = 'refunded';
  item.refundedAt = new Date();
  await item.save();
  res.json(item);
};
export const paymentWebhook = async (req, res) => {
  const gateway = req.params.gateway;
  const payload = req.body;
  const externalId = payload?.data?.object?.id || payload?.payment_id || payload?.transactionId;
  const item = externalId ? await PaymentTransaction.findOne({ externalId }) : null;
  if (item) {
    item.webhookPayload = payload;
    const type = payload.type || payload.status;
    if (/success|succeeded|paid/i.test(type)) item.status = 'paid';
    if (/fail|cancel/i.test(type)) item.status = 'failed';
    await item.save();
  }
  res.json({ received: true, gateway });
};
export const webhookList = async (req, res) => res.json(await WebhookEndpoint.find().sort({ createdAt: -1 }));
export const webhookCreate = async (req, res) =>
  res.status(201).json(
    await WebhookEndpoint.create({
      ...req.body,
      secret: req.body.secret || crypto.randomBytes(24).toString('hex'),
      createdBy: req.user._id,
    }),
  );
export const webhookUpdate = async (req, res) =>
  res.json(await WebhookEndpoint.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }));
export const webhookDelete = async (req, res) => {
  await WebhookEndpoint.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};
export const webhookTest = async (req, res) => {
  const ep = await WebhookEndpoint.findById(req.params.id);
  if (!ep) return res.status(404).json({ message: 'Endpoint not found' });
  const delivery = await WebhookDelivery.create({
    endpoint: ep._id,
    event: 'integration.test',
    payload: { message: 'HMN webhook test', at: new Date() },
  });
  try {
    const r = await svc.deliverWebhook(ep, 'integration.test', delivery.payload);
    delivery.attempts = 1;
    delivery.responseStatus = r.status;
    delivery.responseBody = String(JSON.stringify(r.data)).slice(0, 2000);
    delivery.status = r.status >= 200 && r.status < 300 ? 'success' : 'failed';
  } catch (e) {
    delivery.attempts = 1;
    delivery.status = 'failed';
    delivery.lastError = e.message;
    delivery.nextRetryAt = new Date(Date.now() + 60000);
  }
  await delivery.save();
  res.json(delivery);
};
export const webhookLogs = async (req, res) =>
  res.json(await WebhookDelivery.find().populate('endpoint', 'name url').sort({ createdAt: -1 }).limit(200));
export const webhookRetry = async (req, res) => {
  const d = await WebhookDelivery.findById(req.params.id).populate('endpoint');
  if (!d) return res.status(404).json({ message: 'Delivery not found' });
  const r = await svc.deliverWebhook(d.endpoint, d.event, d.payload);
  d.attempts += 1;
  d.responseStatus = r.status;
  d.responseBody = String(JSON.stringify(r.data)).slice(0, 2000);
  d.status = r.status >= 200 && r.status < 300 ? 'success' : 'failed';
  await d.save();
  res.json(d);
};
export const incomingWebhook = async (req, res) => {
  const apiKey = req.get('x-api-key');
  if (!process.env.INTEGRATION_API_KEY || apiKey !== process.env.INTEGRATION_API_KEY)
    return res.status(401).json({ message: 'Invalid API key' });
  await AuditLog.create({
    action: 'INCOMING_WEBHOOK',
    entity: req.params.source,
    description: 'Incoming integration webhook',
    ip: req.ip,
    path: req.originalUrl,
    after: req.body,
  });
  res.json({ received: true });
};
