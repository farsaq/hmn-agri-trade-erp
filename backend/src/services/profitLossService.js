import mongoose from 'mongoose';
import { Account, GeneralLedgerEntry } from '../models/accounting.js';

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const asDate = (value, end = false) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime()))
    throw Object.assign(new Error('Invalid report date'), { statusCode: 422, code: 'ACCOUNTING_INVALID_DATE' });
  if (end) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
};
const objectId = (value) => (value && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);
const normalAmount = (account, debit, credit) =>
  round(account.normalBalance === 'debit' ? debit - credit : credit - debit);

function accountFilters(query) {
  const filter = { isDeleted: false, type: { $in: ['income', 'expense'] } };
  if (String(query.includeInactive) !== 'true') filter.active = true;
  if (query.type && ['income', 'expense'].includes(query.type)) filter.type = query.type;
  if (query.category) filter.category = query.category;
  if (query.reportingGroup) filter.reportingGroup = query.reportingGroup;
  if (query.search)
    filter.$or = [
      { code: { $regex: String(query.search), $options: 'i' } },
      { name: { $regex: String(query.search), $options: 'i' } },
    ];
  return filter;
}

function dimensionMatch(query) {
  const match = {};
  for (const key of ['branch', 'warehouse', 'costCenter', 'department', 'project']) {
    const id = objectId(query[key]);
    if (id) match[key] = id;
  }
  if (query.sourceType) match.sourceType = query.sourceType;
  if (query.excludeReversals === 'true') match.isReversal = { $ne: true };
  return match;
}

async function periodRows(accounts, dateFrom, dateTo, query) {
  const ids = accounts.map((account) => account._id);
  if (!ids.length) return [];
  const match = { account: { $in: ids }, date: { $gte: dateFrom, $lte: dateTo }, ...dimensionMatch(query) };
  const sums = await GeneralLedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, entries: { $sum: 1 } } },
  ]);
  const map = new Map(sums.map((row) => [String(row._id), row]));
  return accounts
    .map((account) => {
      const activity = map.get(String(account._id)) || { debit: 0, credit: 0, entries: 0 };
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
        debit: round(activity.debit),
        credit: round(activity.credit),
        amount: normalAmount(account, activity.debit, activity.credit),
        entries: activity.entries,
      };
    })
    .filter((row) => String(query.includeZero) === 'true' || row.amount !== 0);
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.reportingGroup || row.category || 'Other';
    if (!groups.has(key)) groups.set(key, { name: key, items: [], total: 0 });
    const group = groups.get(key);
    group.items.push(row);
    group.total = round(group.total + row.amount);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort(
        (a, b) =>
          a.reportingSequence - b.reportingSequence || a.displayOrder - b.displayOrder || a.code.localeCompare(b.code),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateProfitLoss(query = {}) {
  const dateTo = asDate(query.dateTo, true);
  const dateFrom = query.dateFrom ? asDate(query.dateFrom) : new Date(dateTo.getFullYear(), 0, 1);
  if (dateFrom > dateTo)
    throw Object.assign(new Error('dateFrom cannot be after dateTo'), {
      statusCode: 422,
      code: 'ACCOUNTING_INVALID_DATE_RANGE',
    });

  const accounts = await Account.find(accountFilters(query))
    .sort({ reportingSequence: 1, displayOrder: 1, code: 1 })
    .lean();
  const rows = await periodRows(accounts, dateFrom, dateTo, query);
  const income = rows.filter((row) => row.type === 'income');
  const expenses = rows.filter((row) => row.type === 'expense');
  const totalIncome = round(income.reduce((sum, row) => sum + row.amount, 0));
  const totalExpenses = round(expenses.reduce((sum, row) => sum + row.amount, 0));
  const netProfit = round(totalIncome - totalExpenses);
  const grossIncome = round(
    income
      .filter((row) => /sales|revenue|trading/i.test(`${row.category} ${row.reportingGroup} ${row.subtype}`))
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const directExpenses = round(
    expenses
      .filter((row) =>
        /cost of sales|cogs|direct|purchase/i.test(`${row.category} ${row.reportingGroup} ${row.subtype}`),
      )
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const grossProfit = round(grossIncome - directExpenses);
  const operatingExpenses = round(totalExpenses - directExpenses);
  const operatingProfit = round(grossProfit - operatingExpenses);

  return {
    success: true,
    meta: { name: 'Profit & Loss', dateFrom, dateTo, generatedAt: new Date(), currency: 'PKR' },
    income,
    expenses,
    incomeGroups: groupRows(income),
    expenseGroups: groupRows(expenses),
    totals: {
      totalIncome,
      grossIncome,
      directExpenses,
      grossProfit,
      operatingExpenses,
      operatingProfit,
      totalExpenses,
      netProfit,
    },
    totalIncome,
    totalExpenses,
    netProfit,
    margins: {
      grossProfitMargin: grossIncome ? round((grossProfit / grossIncome) * 100) : null,
      operatingProfitMargin: totalIncome ? round((operatingProfit / totalIncome) * 100) : null,
      netProfitMargin: totalIncome ? round((netProfit / totalIncome) * 100) : null,
      expenseRatio: totalIncome ? round((totalExpenses / totalIncome) * 100) : null,
    },
    profitable: netProfit >= 0,
    filters: { ...query, dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() },
  };
}
