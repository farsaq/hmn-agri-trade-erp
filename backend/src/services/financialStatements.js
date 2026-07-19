import mongoose from 'mongoose';
import { Account, GeneralLedgerEntry } from '../models/accounting.js';

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const signedBalance = (account, debit, credit) =>
  round(account.normalBalance === 'debit' ? debit - credit : credit - debit);

export function normalizeDateRange(query = {}) {
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
  if (dateFrom && Number.isNaN(dateFrom.getTime()))
    throw Object.assign(new Error('Invalid dateFrom'), { statusCode: 422, code: 'ACCOUNTING_INVALID_DATE' });
  if (Number.isNaN(dateTo.getTime()))
    throw Object.assign(new Error('Invalid dateTo'), { statusCode: 422, code: 'ACCOUNTING_INVALID_DATE' });
  dateTo.setHours(23, 59, 59, 999);
  return { dateFrom, dateTo };
}

async function aggregateEntries({ dateFrom, dateTo, accountIds }) {
  const match = { date: { $lte: dateTo } };
  if (dateFrom) match.date.$gte = dateFrom;
  if (accountIds?.length) match.account = { $in: accountIds.map((id) => new mongoose.Types.ObjectId(id)) };
  return GeneralLedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
}

export async function balancesAsOf(dateTo, { includeInactive = false } = {}) {
  const accounts = await Account.find({ isDeleted: false, ...(includeInactive ? {} : { active: true }) })
    .sort({ code: 1 })
    .lean();
  const sums = await aggregateEntries({ dateTo });
  const map = new Map(sums.map((row) => [String(row._id), row]));
  return accounts.map((account) => {
    const row = map.get(String(account._id)) || { debit: 0, credit: 0 };
    const balance = round(Number(account.openingBalance || 0) + signedBalance(account, row.debit, row.credit));
    return { ...account, debit: round(row.debit), credit: round(row.credit), balance };
  });
}

export async function activityForRange(dateFrom, dateTo) {
  const accounts = await Account.find({ isDeleted: false, active: true }).sort({ code: 1 }).lean();
  const sums = await aggregateEntries({ dateFrom, dateTo });
  const map = new Map(sums.map((row) => [String(row._id), row]));
  return accounts.map((account) => {
    const row = map.get(String(account._id)) || { debit: 0, credit: 0 };
    return {
      ...account,
      debit: round(row.debit),
      credit: round(row.credit),
      balance: signedBalance(account, row.debit, row.credit),
    };
  });
}

export function groupByType(rows) {
  const grouped = { asset: [], liability: [], equity: [], income: [], expense: [] };
  for (const row of rows) grouped[row.type]?.push(row);
  return grouped;
}

export function sumBalances(rows) {
  return round(rows.reduce((sum, row) => sum + Number(row.balance || 0), 0));
}

export function calculateRatios({ assets = [], liabilities = [], equity = [], income = [], expenses = [] }) {
  const currentAssets = sumBalances(
    assets.filter(
      (a) =>
        ['cash', 'bank', 'accounts-receivable', 'inventory', 'current-asset'].includes(
          String(a.subtype || '').toLowerCase(),
        ) || /^1[1-4]/.test(String(a.code || '')),
    ),
  );
  const currentLiabilities = sumBalances(
    liabilities.filter(
      (a) =>
        ['accounts-payable', 'tax-payable', 'current-liability'].includes(String(a.subtype || '').toLowerCase()) ||
        /^2[1-2]/.test(String(a.code || '')),
    ),
  );
  const totalAssets = sumBalances(assets);
  const totalLiabilities = sumBalances(liabilities);
  const totalEquity = sumBalances(equity);
  const revenue = sumBalances(income);
  const totalExpenses = sumBalances(expenses);
  const netProfit = round(revenue - totalExpenses);
  return {
    currentRatio: currentLiabilities ? round(currentAssets / currentLiabilities) : null,
    debtToEquity: totalEquity ? round(totalLiabilities / totalEquity) : null,
    debtRatio: totalAssets ? round(totalLiabilities / totalAssets) : null,
    netProfitMargin: revenue ? round((netProfit / revenue) * 100) : null,
    returnOnAssets: totalAssets ? round((netProfit / totalAssets) * 100) : null,
    returnOnEquity: totalEquity ? round((netProfit / totalEquity) * 100) : null,
    workingCapital: round(currentAssets - currentLiabilities),
    currentAssets,
    currentLiabilities,
    totalAssets,
    totalLiabilities,
    totalEquity,
    revenue,
    totalExpenses,
    netProfit,
  };
}

export function statementRowsForExport(statement) {
  const rows = [];
  const pushSection = (name, items = []) => {
    rows.push([name, '', '']);
    for (const item of items) rows.push([item.code, item.name, item.balance]);
    rows.push(['', `Total ${name}`, sumBalances(items)]);
  };
  if (statement.assets) pushSection('Assets', statement.assets);
  if (statement.liabilities) pushSection('Liabilities', statement.liabilities);
  if (statement.equity) pushSection('Equity', statement.equity);
  if (statement.income) pushSection('Income', statement.income);
  if (statement.expenses) pushSection('Expenses', statement.expenses);
  return rows;
}
