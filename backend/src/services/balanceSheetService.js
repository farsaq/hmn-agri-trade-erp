import mongoose from 'mongoose';
import { Account, GeneralLedgerEntry } from '../models/accounting.js';
import { generateProfitLoss } from './profitLossService.js';

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const asDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime()))
    throw Object.assign(new Error('Invalid report date'), { statusCode: 422, code: 'ACCOUNTING_INVALID_DATE' });
  date.setHours(23, 59, 59, 999);
  return date;
};
const objectId = (value) => (value && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);
const normalAmount = (account, debit, credit) =>
  round(account.normalBalance === 'debit' ? debit - credit : credit - debit);

function dimensionMatch(query) {
  const match = {};
  for (const key of ['branch', 'warehouse', 'costCenter', 'department', 'project']) {
    const id = objectId(query[key]);
    if (id) match[key] = id;
  }
  if (query.excludeReversals === 'true') match.isReversal = { $ne: true };
  return match;
}

function accountFilter(query) {
  const filter = { isDeleted: false, type: { $in: ['asset', 'liability', 'equity'] } };
  if (query.includeInactive !== 'true') filter.active = true;
  if (query.type && ['asset', 'liability', 'equity'].includes(query.type)) filter.type = query.type;
  if (query.category) filter.category = query.category;
  if (query.reportingGroup) filter.reportingGroup = query.reportingGroup;
  if (query.search)
    filter.$or = [
      { code: { $regex: String(query.search), $options: 'i' } },
      { name: { $regex: String(query.search), $options: 'i' } },
    ];
  return filter;
}

function classification(account) {
  const text = `${account.subtype || ''} ${account.category || ''} ${account.reportingGroup || ''}`.toLowerCase();
  if (account.type === 'equity') return 'equity';
  return /current|cash|bank|receivable|inventory|payable|short.?term/.test(text) &&
    !/non.?current|long.?term|fixed/.test(text)
    ? 'current'
    : 'nonCurrent';
}

async function balancesAt(accounts, dateTo, query) {
  const ids = accounts.map((a) => a._id);
  if (!ids.length) return [];
  const sums = await GeneralLedgerEntry.aggregate([
    { $match: { account: { $in: ids }, date: { $lte: dateTo }, ...dimensionMatch(query) } },
    { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, entries: { $sum: 1 } } },
  ]);
  const map = new Map(sums.map((row) => [String(row._id), row]));
  return accounts
    .map((account) => {
      const activity = map.get(String(account._id)) || { debit: 0, credit: 0, entries: 0 };
      const amount = round(
        Number(account.openingBalance || 0) + normalAmount(account, activity.debit, activity.credit),
      );
      return {
        accountId: account._id,
        code: account.code,
        name: account.name,
        type: account.type,
        subtype: account.subtype || '',
        category: account.category || 'Uncategorized',
        reportingGroup: account.reportingGroup || account.category || 'Other',
        parent: account.parent,
        level: account.level || 0,
        displayOrder: account.displayOrder || 0,
        reportingSequence: account.reportingSequence || 0,
        classification: classification(account),
        balance: amount,
        entries: activity.entries,
      };
    })
    .filter((row) => query.includeZero === 'true' || row.balance !== 0);
}

function groups(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.reportingGroup || row.category || 'Other';
    if (!map.has(key)) map.set(key, { name: key, items: [], total: 0 });
    const group = map.get(key);
    group.items.push(row);
    group.total = round(group.total + row.balance);
  }
  return [...map.values()].map((group) => ({
    ...group,
    items: group.items.sort(
      (a, b) =>
        a.reportingSequence - b.reportingSequence || a.displayOrder - b.displayOrder || a.code.localeCompare(b.code),
    ),
  }));
}

function section(rows) {
  const current = rows.filter((x) => x.classification === 'current');
  const nonCurrent = rows.filter((x) => x.classification === 'nonCurrent');
  return {
    items: rows,
    groups: groups(rows),
    current,
    nonCurrent,
    currentTotal: round(current.reduce((s, x) => s + x.balance, 0)),
    nonCurrentTotal: round(nonCurrent.reduce((s, x) => s + x.balance, 0)),
    total: round(rows.reduce((s, x) => s + x.balance, 0)),
  };
}

export async function generateBalanceSheet(query = {}) {
  const dateTo = asDate(query.dateTo);
  const comparativeDate = query.comparativeDate ? asDate(query.comparativeDate) : null;
  const accounts = await Account.find(accountFilter(query))
    .sort({ reportingSequence: 1, displayOrder: 1, code: 1 })
    .lean();
  const [rows, comparativeRows, pl] = await Promise.all([
    balancesAt(accounts, dateTo, query),
    comparativeDate ? balancesAt(accounts, comparativeDate, query) : Promise.resolve([]),
    generateProfitLoss({
      ...query,
      dateFrom: query.fiscalYearStart || `${dateTo.getFullYear()}-01-01`,
      dateTo: dateTo.toISOString(),
    }),
  ]);
  const assets = section(rows.filter((x) => x.type === 'asset'));
  const liabilities = section(rows.filter((x) => x.type === 'liability'));
  const equityRows = rows.filter((x) => x.type === 'equity');
  const retainedEarnings = round(pl.netProfit);
  const equity = section(equityRows);
  equity.retainedEarnings = retainedEarnings;
  equity.total = round(equity.total + retainedEarnings);
  const liabilitiesAndEquity = round(liabilities.total + equity.total);
  const difference = round(assets.total - liabilitiesAndEquity);

  const comparative = comparativeDate
    ? {
        date: comparativeDate,
        rows: comparativeRows,
        totalAssets: round(comparativeRows.filter((x) => x.type === 'asset').reduce((s, x) => s + x.balance, 0)),
        totalLiabilities: round(
          comparativeRows.filter((x) => x.type === 'liability').reduce((s, x) => s + x.balance, 0),
        ),
        totalEquity: round(comparativeRows.filter((x) => x.type === 'equity').reduce((s, x) => s + x.balance, 0)),
      }
    : null;

  return {
    success: true,
    meta: { name: 'Balance Sheet', dateTo, comparativeDate, generatedAt: new Date(), currency: 'PKR' },
    assets,
    liabilities,
    equity,
    currentEarnings: retainedEarnings,
    totalAssets: assets.total,
    totalLiabilities: liabilities.total,
    totalEquity: equity.total,
    liabilitiesAndEquity,
    difference,
    balanced: Math.abs(difference) < 0.01,
    comparative,
    percentages: {
      currentAssets: assets.total ? round((assets.currentTotal / assets.total) * 100) : 0,
      currentLiabilities: liabilities.total ? round((liabilities.currentTotal / liabilities.total) * 100) : 0,
      debtToAssets: assets.total ? round((liabilities.total / assets.total) * 100) : 0,
      equityToAssets: assets.total ? round((equity.total / assets.total) * 100) : 0,
    },
    filters: { ...query, dateTo: dateTo.toISOString(), comparativeDate: comparativeDate?.toISOString() || null },
  };
}
