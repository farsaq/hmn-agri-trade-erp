import mongoose from 'mongoose';
import { Account, GeneralLedgerEntry } from '../models/accounting.js';

const number = (value) => Number(value || 0);
const round = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const asDate = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
};
const balanceEffect = (normalBalance, debit, credit) =>
  normalBalance === 'credit' ? number(credit) - number(debit) : number(debit) - number(credit);

async function descendantAccountIds(accountId) {
  const root = await Account.findOne({ _id: accountId, isDeleted: false }).lean();
  if (!root) {
    const error = new Error('Account not found');
    error.statusCode = 404;
    throw error;
  }
  const rows = await Account.find({ isDeleted: false }, { _id: 1, parent: 1 }).lean();
  const children = new Map();
  for (const row of rows) {
    const key = String(row.parent || 'root');
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(row._id);
  }
  const ids = [root._id];
  const queue = [root._id];
  while (queue.length) {
    const current = queue.shift();
    for (const child of children.get(String(current)) || []) {
      ids.push(child);
      queue.push(child);
    }
  }
  return { root, ids };
}

function buildDimensionFilters(query) {
  const filter = {};
  for (const key of ['costCenter', 'department', 'project', 'branch', 'warehouse', 'product', 'party']) {
    if (query[key] && mongoose.isValidObjectId(query[key])) filter[key] = query[key];
  }
  if (query.partyType) filter.partyType = query.partyType;
  if (query.sourceType) filter.sourceType = query.sourceType;
  if (query.reversal === 'only') filter.isReversal = true;
  if (query.reversal === 'exclude') filter.isReversal = { $ne: true };
  return filter;
}

export async function buildGeneralLedger(query = {}) {
  const page = Math.max(1, number(query.page) || 1);
  const limit = Math.min(500, Math.max(1, number(query.limit) || 50));
  const dateFrom = asDate(query.dateFrom || query.from);
  const dateTo = asDate(query.dateTo || query.to, true);
  const filter = buildDimensionFilters(query);
  let selectedAccount = null;

  if (query.account && mongoose.isValidObjectId(query.account)) {
    const hierarchy = await descendantAccountIds(query.account);
    selectedAccount = hierarchy.root;
    filter.account = query.includeChildren === 'true' ? { $in: hierarchy.ids } : hierarchy.root._id;
  }
  if (query.accountCode) filter.accountCode = String(query.accountCode).trim().toUpperCase();
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = dateFrom;
    if (dateTo) filter.date.$lte = dateTo;
  }
  if (query.journalNo) filter.journalNo = { $regex: String(query.journalNo).trim(), $options: 'i' };
  if (query.search) {
    const search = String(query.search).trim();
    filter.$or = [
      { journalNo: { $regex: search, $options: 'i' } },
      { accountCode: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const openingFilter = { ...filter };
  delete openingFilter.$or;
  delete openingFilter.date;
  if (dateFrom) openingFilter.date = { $lt: dateFrom };
  else openingFilter._id = { $exists: false };

  const [openingRows, periodTotals, total, rawItems] = await Promise.all([
    GeneralLedgerEntry.aggregate([
      { $match: openingFilter },
      { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]),
    GeneralLedgerEntry.aggregate([
      { $match: filter },
      { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]),
    GeneralLedgerEntry.countDocuments(filter),
    GeneralLedgerEntry.find(filter)
      .populate('account', 'code name type normalBalance parent level')
      .populate('journal', 'status type reference sourceType sourceId reversalOf reversedByJournal')
      .sort({ date: 1, journalNo: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const openingByAccount = new Map(openingRows.map((row) => [String(row._id), row]));
  const accountIds = [...new Set(rawItems.map((row) => String(row.account?._id || row.account)))];
  const accounts = accountIds.length
    ? await Account.find({ _id: { $in: accountIds } }, 'normalBalance openingBalance').lean()
    : [];
  const accountMap = new Map(accounts.map((account) => [String(account._id), account]));

  const carriedBalances = new Map();
  for (const accountId of accountIds) {
    const account = accountMap.get(accountId);
    const opening = openingByAccount.get(accountId) || { debit: 0, credit: 0 };
    carriedBalances.set(
      accountId,
      round(number(account?.openingBalance) + balanceEffect(account?.normalBalance, opening.debit, opening.credit)),
    );
  }

  const items = rawItems.map((row) => {
    const accountId = String(row.account?._id || row.account);
    const account = row.account || accountMap.get(accountId);
    const previous = carriedBalances.get(accountId) || 0;
    const runningBalance = round(previous + balanceEffect(account?.normalBalance, row.debit, row.credit));
    carriedBalances.set(accountId, runningBalance);
    return { ...row, openingBalance: previous, runningBalance };
  });

  const totals = periodTotals[0] || { debit: 0, credit: 0 };
  const selectedOpening = selectedAccount
    ? round(
        number(selectedAccount.openingBalance) +
          balanceEffect(
            selectedAccount.normalBalance,
            openingByAccount.get(String(selectedAccount._id))?.debit,
            openingByAccount.get(String(selectedAccount._id))?.credit,
          ),
      )
    : null;
  const selectedClosing = selectedAccount
    ? round(selectedOpening + balanceEffect(selectedAccount.normalBalance, totals.debit, totals.credit))
    : null;

  return {
    items,
    summary: {
      debit: round(totals.debit),
      credit: round(totals.credit),
      netMovement: round(number(totals.debit) - number(totals.credit)),
      openingBalance: selectedOpening,
      closingBalance: selectedClosing,
    },
    selectedAccount,
    filters: {
      dateFrom: dateFrom?.toISOString() || null,
      dateTo: dateTo?.toISOString() || null,
      includeChildren: query.includeChildren === 'true',
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getLedgerDrilldown(entryId) {
  if (!mongoose.isValidObjectId(entryId)) {
    const error = new Error('Invalid ledger entry id');
    error.statusCode = 422;
    throw error;
  }
  const entry = await GeneralLedgerEntry.findById(entryId)
    .populate('account', 'code name type normalBalance category reportingGroup')
    .populate('journal')
    .populate('costCenter department project branch warehouse product')
    .lean();
  if (!entry) {
    const error = new Error('Ledger entry not found');
    error.statusCode = 404;
    throw error;
  }
  return entry;
}
