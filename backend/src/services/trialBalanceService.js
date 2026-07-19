import mongoose from 'mongoose';
import { Account, AccountingPeriod, FiscalYear, GeneralLedgerEntry } from '../models/accounting.js';

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const objectId = (value) =>
  value && mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

function validDate(value, name) {
  const date = value ? new Date(value) : null;
  if (date && Number.isNaN(date.getTime()))
    throw Object.assign(new Error(`Invalid ${name}`), { statusCode: 422, code: 'ACCOUNTING_INVALID_DATE' });
  return date;
}

async function resolveRange(query) {
  let dateFrom = validDate(query.dateFrom, 'dateFrom');
  let dateTo = validDate(query.dateTo, 'dateTo') || new Date();
  let fiscalYear = null;
  let period = null;
  if (query.fiscalYear) {
    fiscalYear = await FiscalYear.findById(query.fiscalYear).lean();
    if (!fiscalYear) throw Object.assign(new Error('Fiscal year not found'), { statusCode: 404 });
    dateFrom ||= new Date(fiscalYear.startDate);
    dateTo = query.dateTo ? dateTo : new Date(fiscalYear.endDate);
  }
  if (query.period) {
    period = await AccountingPeriod.findById(query.period).lean();
    if (!period) throw Object.assign(new Error('Accounting period not found'), { statusCode: 404 });
    dateFrom = query.dateFrom ? dateFrom : new Date(period.startDate);
    dateTo = query.dateTo ? dateTo : new Date(period.endDate);
  }
  dateFrom ||= new Date(dateTo.getFullYear(), 0, 1);
  dateFrom.setHours(0, 0, 0, 0);
  dateTo.setHours(23, 59, 59, 999);
  if (dateFrom > dateTo) throw Object.assign(new Error('dateFrom cannot be after dateTo'), { statusCode: 422 });
  return { dateFrom, dateTo, fiscalYear, period };
}

function dimensionMatch(query) {
  const match = {};
  for (const key of ['branch', 'warehouse', 'costCenter', 'department', 'project']) {
    const id = objectId(query[key]);
    if (query[key] && !id) throw Object.assign(new Error(`Invalid ${key}`), { statusCode: 422 });
    if (id) match[key] = id;
  }
  return match;
}

function debitCredit(account, signed) {
  if (account.normalBalance === 'debit')
    return signed >= 0 ? { debit: signed, credit: 0 } : { debit: 0, credit: Math.abs(signed) };
  return signed >= 0 ? { debit: 0, credit: signed } : { debit: Math.abs(signed), credit: 0 };
}

function signed(account, debit, credit) {
  return round(account.normalBalance === 'debit' ? debit - credit : credit - debit);
}

function buildHierarchy(rows) {
  const map = new Map(rows.map((row) => [String(row.accountId), { ...row, children: [] }]));
  const roots = [];
  for (const row of map.values()) {
    const parent = row.parentId && map.get(String(row.parentId));
    if (parent) parent.children.push(row);
    else roots.push(row);
  }
  const sort = (list) =>
    list
      .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code))
      .map((item) => ({ ...item, children: sort(item.children) }));
  return sort(roots);
}

export async function generateTrialBalance(query = {}) {
  const { dateFrom, dateTo, fiscalYear, period } = await resolveRange(query);
  const accountFilter = { isDeleted: false };
  if (query.includeInactive !== 'true') accountFilter.active = true;
  if (query.type) accountFilter.type = query.type;
  if (query.category) accountFilter.category = query.category;
  if (query.reportingGroup) accountFilter.reportingGroup = query.reportingGroup;
  if (query.search)
    accountFilter.$or = [
      { code: { $regex: query.search, $options: 'i' } },
      { name: { $regex: query.search, $options: 'i' } },
    ];
  const accounts = await Account.find(accountFilter).sort({ displayOrder: 1, code: 1 }).lean();
  const ids = accounts.map((account) => account._id);
  const dims = dimensionMatch(query);
  const aggregate = async (date) =>
    GeneralLedgerEntry.aggregate([
      { $match: { account: { $in: ids }, date, ...dims } },
      { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]);
  const [beforeRows, movementRows] = await Promise.all([
    aggregate({ $lt: dateFrom }),
    aggregate({ $gte: dateFrom, $lte: dateTo }),
  ]);
  const before = new Map(beforeRows.map((row) => [String(row._id), row]));
  const movement = new Map(movementRows.map((row) => [String(row._id), row]));
  let rows = accounts.map((account) => {
    const openingEntry = before.get(String(account._id)) || { debit: 0, credit: 0 };
    const current = movement.get(String(account._id)) || { debit: 0, credit: 0 };
    const openingSigned = round(
      Number(account.openingBalance || 0) + signed(account, openingEntry.debit, openingEntry.credit),
    );
    const closingSigned = round(openingSigned + signed(account, current.debit, current.credit));
    const opening = debitCredit(account, openingSigned);
    const closing = debitCredit(account, closingSigned);
    return {
      accountId: account._id,
      code: account.code,
      name: account.name,
      type: account.type,
      category: account.category,
      reportingGroup: account.reportingGroup,
      parentId: account.parent,
      level: account.level || 0,
      displayOrder: account.displayOrder || 0,
      openingDebit: round(opening.debit),
      openingCredit: round(opening.credit),
      periodDebit: round(current.debit),
      periodCredit: round(current.credit),
      closingDebit: round(closing.debit),
      closingCredit: round(closing.credit),
    };
  });
  if (query.zeroBalance !== 'true')
    rows = rows.filter(
      (row) =>
        row.openingDebit ||
        row.openingCredit ||
        row.periodDebit ||
        row.periodCredit ||
        row.closingDebit ||
        row.closingCredit,
    );
  const totals = rows.reduce(
    (sum, row) => ({
      openingDebit: sum.openingDebit + row.openingDebit,
      openingCredit: sum.openingCredit + row.openingCredit,
      periodDebit: sum.periodDebit + row.periodDebit,
      periodCredit: sum.periodCredit + row.periodCredit,
      closingDebit: sum.closingDebit + row.closingDebit,
      closingCredit: sum.closingCredit + row.closingCredit,
    }),
    { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 },
  );
  Object.keys(totals).forEach((key) => {
    totals[key] = round(totals[key]);
  });
  const difference = round(totals.closingDebit - totals.closingCredit);
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(500, Math.max(1, Number(query.limit || 50)));
  const total = rows.length;
  const paged = query.hierarchical === 'true' ? rows : rows.slice((page - 1) * limit, page * limit);
  return {
    meta: { name: 'Trial Balance', dateFrom, dateTo, generatedAt: new Date(), currency: 'PKR', fiscalYear, period },
    items: paged,
    hierarchy: query.hierarchical === 'true' ? buildHierarchy(rows) : undefined,
    totals,
    difference,
    balanced: Math.abs(difference) < 0.01,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    filters: {
      type: query.type || '',
      category: query.category || '',
      reportingGroup: query.reportingGroup || '',
      ...dims,
    },
  };
}
