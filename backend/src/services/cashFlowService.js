import mongoose from 'mongoose';
import { Account, FiscalYear, GeneralLedgerEntry } from '../models/accounting.js';

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const asObjectId = (value) => (value && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);
const endOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};
const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const operatingTypes = new Set([
  'sale',
  'purchase',
  'receipt',
  'payment',
  'expense',
  'sales-return',
  'purchase-return',
  'payroll',
  'tax',
  'customer-receipt',
  'supplier-payment',
]);
const investingTypes = new Set([
  'asset-purchase',
  'asset-sale',
  'investment',
  'investment-purchase',
  'investment-sale',
]);
const financingTypes = new Set(['capital', 'owner-capital', 'loan', 'loan-repayment', 'dividend', 'drawings']);

function classify(sourceType = '', description = '') {
  const source = String(sourceType || '')
    .trim()
    .toLowerCase();
  const text = String(description || '').toLowerCase();
  if (investingTypes.has(source) || /(fixed asset|equipment|vehicle|property|investment)/.test(text))
    return 'investing';
  if (financingTypes.has(source) || /(capital|loan|dividend|drawings|owner contribution)/.test(text))
    return 'financing';
  if (operatingTypes.has(source)) return 'operating';
  return 'operating';
}

function validateDate(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw Object.assign(new Error(`Invalid ${name}`), { statusCode: 422, code: 'ACCOUNTING_INVALID_DATE' });
  return date;
}

async function resolveRange(query = {}) {
  let dateFrom = query.dateFrom ? validateDate(query.dateFrom, 'dateFrom') : null;
  let dateTo = query.dateTo ? validateDate(query.dateTo, 'dateTo') : new Date();
  let fiscalYear = null;
  if (query.fiscalYear) {
    const id = asObjectId(query.fiscalYear);
    if (!id)
      throw Object.assign(new Error('Invalid fiscalYear'), { statusCode: 422, code: 'ACCOUNTING_INVALID_FISCAL_YEAR' });
    fiscalYear = await FiscalYear.findById(id).lean();
    if (!fiscalYear)
      throw Object.assign(new Error('Fiscal year not found'), {
        statusCode: 404,
        code: 'ACCOUNTING_FISCAL_YEAR_NOT_FOUND',
      });
    dateFrom ||= new Date(fiscalYear.startDate);
    dateTo = query.dateTo ? dateTo : new Date(fiscalYear.endDate);
  }
  dateFrom ||= new Date(dateTo.getFullYear(), 0, 1);
  dateFrom = startOfDay(dateFrom);
  dateTo = endOfDay(dateTo);
  if (dateFrom > dateTo)
    throw Object.assign(new Error('dateFrom must be before dateTo'), {
      statusCode: 422,
      code: 'ACCOUNTING_INVALID_DATE_RANGE',
    });
  return { dateFrom, dateTo, fiscalYear };
}

function dimensionMatch(query = {}) {
  const match = {};
  for (const key of ['branch', 'warehouse', 'costCenter', 'department', 'project']) {
    if (!query[key]) continue;
    const id = asObjectId(query[key]);
    if (!id) throw Object.assign(new Error(`Invalid ${key}`), { statusCode: 422, code: 'ACCOUNTING_INVALID_FILTER' });
    match[key] = id;
  }
  if (query.sourceType) match.sourceType = query.sourceType;
  if (String(query.excludeReversals ?? 'true') === 'true') match.isReversal = { $ne: true };
  return match;
}

async function cashAccounts(query = {}) {
  const filter = {
    isDeleted: false,
    ...(String(query.includeInactive || 'false') === 'true' ? {} : { active: true }),
    $or: [
      { systemKey: { $in: ['cash', 'bank', 'cash-in-hand', 'bank-account'] } },
      { subtype: { $in: ['cash', 'bank', 'cash-in-hand', 'bank-account', 'cash-equivalent'] } },
      { name: /cash|bank/i },
    ],
  };
  if (query.cashAccount) {
    const id = asObjectId(query.cashAccount);
    if (!id)
      throw Object.assign(new Error('Invalid cashAccount'), { statusCode: 422, code: 'ACCOUNTING_INVALID_FILTER' });
    filter._id = id;
  }
  return Account.find(filter).sort({ code: 1 }).lean();
}

async function openingBalance(accountIds, dateFrom, extraMatch) {
  if (!accountIds.length) return 0;
  const rows = await GeneralLedgerEntry.aggregate([
    { $match: { account: { $in: accountIds }, date: { $lt: dateFrom }, ...extraMatch } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  return round((rows[0]?.debit || 0) - (rows[0]?.credit || 0));
}

function summarize(items) {
  return round(items.reduce((sum, item) => sum + item.amount, 0));
}

async function generatePeriod(query = {}) {
  const { dateFrom, dateTo, fiscalYear } = await resolveRange(query);
  const accounts = await cashAccounts(query);
  const accountIds = accounts.map((account) => account._id);
  const extraMatch = dimensionMatch(query);
  const openingCashBalance = await openingBalance(accountIds, dateFrom, extraMatch);
  const entries = accountIds.length
    ? await GeneralLedgerEntry.find({
        account: { $in: accountIds },
        date: { $gte: dateFrom, $lte: dateTo },
        ...extraMatch,
      })
        .sort({ date: 1, journalNo: 1, _id: 1 })
        .lean()
    : [];

  const accountMap = new Map(accounts.map((account) => [String(account._id), account]));
  const sections = { operating: [], investing: [], financing: [] };
  const search = String(query.search || '')
    .trim()
    .toLowerCase();
  for (const entry of entries) {
    const account = accountMap.get(String(entry.account));
    const amount = round(Number(entry.debit || 0) - Number(entry.credit || 0));
    if (!amount && String(query.includeZero || 'false') !== 'true') continue;
    const item = {
      id: entry._id,
      date: entry.date,
      journal: entry.journal,
      journalNo: entry.journalNo,
      description: entry.description || '',
      sourceType: entry.sourceType || '',
      sourceId: entry.sourceId,
      accountId: entry.account,
      accountCode: entry.accountCode || account?.code || '',
      accountName: account?.name || '',
      debit: round(entry.debit),
      credit: round(entry.credit),
      amount,
      direction: amount >= 0 ? 'inflow' : 'outflow',
    };
    if (
      search &&
      !`${item.journalNo} ${item.description} ${item.sourceType} ${item.accountCode} ${item.accountName}`
        .toLowerCase()
        .includes(search)
    )
      continue;
    sections[classify(item.sourceType, item.description)].push(item);
  }

  const totals = {
    operating: summarize(sections.operating),
    investing: summarize(sections.investing),
    financing: summarize(sections.financing),
  };
  const netCashFlow = round(totals.operating + totals.investing + totals.financing);
  const closingCashBalance = round(openingCashBalance + netCashFlow);
  const actualClosingCashBalance = await openingBalance(accountIds, new Date(dateTo.getTime() + 1), extraMatch);
  const reconciliationDifference = round(closingCashBalance - actualClosingCashBalance);
  return {
    meta: {
      name: 'Cash Flow Statement',
      method: query.method === 'indirect' ? 'indirect' : 'direct',
      dateFrom,
      dateTo,
      fiscalYear: fiscalYear ? { id: fiscalYear._id, name: fiscalYear.name } : null,
      generatedAt: new Date(),
      currency: 'PKR',
      filters: {
        branch: query.branch || null,
        warehouse: query.warehouse || null,
        costCenter: query.costCenter || null,
        department: query.department || null,
        project: query.project || null,
        sourceType: query.sourceType || null,
      },
    },
    cashAccounts: accounts.map((account) => ({ id: account._id, code: account.code, name: account.name })),
    openingCashBalance,
    sections,
    operating: sections.operating,
    investing: sections.investing,
    financing: sections.financing,
    totals,
    netCashFlow,
    closingCashBalance,
    actualClosingCashBalance,
    reconciliationDifference,
    reconciled: Math.abs(reconciliationDifference) < 0.01,
    inflows: round(entries.reduce((sum, entry) => sum + Number(entry.debit || 0), 0)),
    outflows: round(entries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0)),
    transactionCount: sections.operating.length + sections.investing.length + sections.financing.length,
  };
}

export async function generateCashFlow(query = {}) {
  const current = await generatePeriod(query);
  if (!query.comparativeFrom && !query.comparativeTo) return current;
  if (!query.comparativeFrom || !query.comparativeTo)
    throw Object.assign(new Error('comparativeFrom and comparativeTo are both required'), {
      statusCode: 422,
      code: 'ACCOUNTING_INVALID_COMPARATIVE_RANGE',
    });
  const previous = await generatePeriod({
    ...query,
    dateFrom: query.comparativeFrom,
    dateTo: query.comparativeTo,
    comparativeFrom: undefined,
    comparativeTo: undefined,
    fiscalYear: undefined,
  });
  const variance = (value) => ({
    amount: round(value[0] - value[1]),
    percentage: value[1] ? round(((value[0] - value[1]) / Math.abs(value[1])) * 100) : null,
  });
  return {
    ...current,
    comparative: previous,
    variance: {
      operating: variance([current.totals.operating, previous.totals.operating]),
      investing: variance([current.totals.investing, previous.totals.investing]),
      financing: variance([current.totals.financing, previous.totals.financing]),
      netCashFlow: variance([current.netCashFlow, previous.netCashFlow]),
      closingCashBalance: variance([current.closingCashBalance, previous.closingCashBalance]),
    },
  };
}
