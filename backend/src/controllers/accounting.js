import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  Account,
  JournalEntry,
  GeneralLedgerEntry,
  FiscalYear,
  AccountingPeriod,
  CostCenter,
  Department,
  Project,
  Branch,
  JournalTemplate,
  RecurringJournal,
} from '../models/accounting.js';
import {
  accountCreateSchema,
  accountUpdateSchema,
  openingBalanceAdjustmentSchema,
  journalCreateSchema,
  journalUpdateSchema,
  fiscalYearSchema,
  periodSchema,
  parse,
} from '../validation/accounting.js';
import {
  postJournal,
  reverseJournal,
  nextJournalNo,
  assertBalanced,
  resolveOpenPeriod,
} from '../services/postingEngine.js';
import { buildGeneralLedger, getLedgerDrilldown } from '../services/generalLedgerService.js';
const n = (v) => Number(v || 0);
const round = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
function normalBalance(type) {
  return ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
}
function fail(res, e) {
  return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
}
function auditContext(req) {
  return { requestId: req.requestId, ip: req.ip, userAgent: req.get('user-agent') };
}
function journalTransitionAllowed(from, to) {
  return (
    {
      draft: ['pending-approval'],
      'pending-approval': ['approved', 'rejected'],
      approved: ['posted', 'rejected'],
      rejected: ['draft'],
      posted: ['reversed'],
      reversed: [],
    }[from] || []
  ).includes(to);
}
async function recalcHierarchy(account, session) {
  const parent = account.parent ? await Account.findById(account.parent).session(session) : null;
  account.level = parent ? parent.level + 1 : 0;
  account.path = parent ? [...(parent.path || []), parent._id] : [];
  await account.save({ session });
  const children = await Account.find({ parent: account._id, isDeleted: false }).session(session);
  for (const child of children) await recalcHierarchy(child, session);
}
async function validateParent({ accountId, parentId, type, session }) {
  if (!parentId) return null;
  if (accountId && String(parentId) === String(accountId))
    throw Object.assign(new Error('Account cannot be its own parent'), { statusCode: 422, code: 'ACCOUNT_CYCLE' });
  const parent = await Account.findOne({ _id: parentId, isDeleted: false }).session(session);
  if (!parent)
    throw Object.assign(new Error('Parent account not found'), { statusCode: 422, code: 'PARENT_ACCOUNT_INVALID' });
  if (parent.type !== type)
    throw Object.assign(new Error('Parent and child account types must match'), {
      statusCode: 422,
      code: 'ACCOUNT_TYPE_MISMATCH',
    });
  if (accountId && (parent.path || []).some((x) => String(x) === String(accountId)))
    throw Object.assign(new Error('Selected parent is a descendant of this account'), {
      statusCode: 422,
      code: 'ACCOUNT_CYCLE',
    });
  return parent;
}
function enforceControlRules(body, current = {}) {
  const isControl = body.isControlAccount ?? current.isControlAccount ?? false;
  if (isControl) {
    body.allowManualPosting = false;
    if (!body.controlAccountKey && !current.controlAccountKey)
      throw Object.assign(new Error('Control account key is required'), {
        statusCode: 422,
        code: 'CONTROL_ACCOUNT_KEY_REQUIRED',
      });
  } else if (body.controlAccountKey === undefined && current.controlAccountKey) body.controlAccountKey = undefined;
}
export async function listAccounts(req, res) {
  const page = Math.max(1, n(req.query.page) || 1),
    limit = Math.min(200, Math.max(1, n(req.query.limit) || 50)),
    filter = { isDeleted: req.query.deleted === 'true' };
  for (const k of ['type', 'subtype', 'category', 'reportingGroup', 'active', 'parent', 'isControlAccount'])
    if (req.query[k] !== undefined && req.query[k] !== '') filter[k] = req.query[k];
  if (req.query.search)
    filter.$or = ['code', 'name', 'systemKey', 'category', 'reportingGroup', 'description'].map((k) => ({
      [k]: { $regex: req.query.search, $options: 'i' },
    }));
  const sort = { displayOrder: 1, reportingSequence: 1, code: 1, _id: 1 };
  const [items, total] = await Promise.all([
    Account.find(filter)
      .populate('parent', 'code name type active')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Account.countDocuments(filter),
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
export async function accountTree(req, res) {
  const filter = { isDeleted: req.query.deleted === 'true' };
  if (req.query.includeInactive !== 'true') filter.active = true;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  const rows = await Account.find(filter).sort({ displayOrder: 1, reportingSequence: 1, code: 1 }).lean();
  const byParent = new Map();
  for (const a of rows) {
    const key = String(a.parent || 'root');
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push({ ...a, children: [] });
  }
  const build = (parent) => (byParent.get(parent) || []).map((x) => ({ ...x, children: build(String(x._id)) }));
  res.json(build('root'));
}
export async function createAccount(req, res) {
  let body;
  try {
    body = parse(accountCreateSchema, req.body);
    enforceControlRules(body);
  } catch (e) {
    return fail(res, e);
  }
  if (
    await Account.exists({
      $or: [{ code: body.code.toUpperCase() }, { normalizedName: body.name.toLowerCase() }],
      isDeleted: false,
    })
  )
    return res.status(409).json({ message: 'Account code or name already exists', code: 'ACCOUNT_DUPLICATE' });
  const s = await mongoose.startSession();
  let doc;
  try {
    await s.withTransaction(async () => {
      const parent = await validateParent({ parentId: body.parent, type: body.type, session: s });
      const path = parent ? [...(parent.path || []), parent._id] : [],
        level = parent ? parent.level + 1 : 0;
      [doc] = await Account.create(
        [
          {
            ...body,
            code: body.code.toUpperCase(),
            normalizedName: body.name.toLowerCase(),
            normalBalance: normalBalance(body.type),
            parent: parent?._id || null,
            path,
            level,
            currentBalance: 0,
            createdBy: req.user._id,
          },
        ],
        { session: s },
      );
      if (body.openingBalance) {
        const equity = await Account.findOne({ systemKey: 'owner-equity', active: true, isDeleted: false }).session(s);
        if (!equity)
          throw Object.assign(new Error('Owner Equity system account missing'), {
            statusCode: 500,
            code: 'SYSTEM_ACCOUNT_MISSING',
          });
        const debit = doc.normalBalance === 'debit' ? Math.abs(body.openingBalance) : 0,
          credit = doc.normalBalance === 'credit' ? Math.abs(body.openingBalance) : 0;
        await postJournal(
          {
            date: new Date(),
            type: 'opening',
            narration: `Opening balance for ${doc.code} ${doc.name}`,
            reference: `OPEN-${doc.code}`,
            sourceType: 'Account',
            sourceId: doc._id,
            sourceEvent: 'opening-balance',
            lines: [
              { account: doc._id, debit, credit },
              { account: equity._id, debit: credit, credit: debit },
            ],
          },
          { session: s, userId: req.user._id },
        );
      }
    });
    res.status(201).json(doc);
  } catch (e) {
    return fail(res, e);
  } finally {
    await s.endSession();
  }
}
export async function updateAccount(req, res) {
  let body;
  try {
    body = parse(accountUpdateSchema, req.body);
  } catch (e) {
    return fail(res, e);
  }
  const s = await mongoose.startSession();
  try {
    let doc;
    await s.withTransaction(async () => {
      doc = await Account.findOne({ _id: req.params.id, isDeleted: false }).session(s);
      if (!doc) throw Object.assign(new Error('Account not found'), { statusCode: 404 });
      if (doc.systemKey && body.type && body.type !== doc.type)
        throw Object.assign(new Error('System account type cannot be changed'), {
          statusCode: 409,
          code: 'SYSTEM_ACCOUNT_IMMUTABLE',
        });
      if (
        doc.isControlAccount &&
        body.isControlAccount === false &&
        (await GeneralLedgerEntry.exists({ account: doc._id }).session(s))
      )
        throw Object.assign(new Error('Control account with ledger activity cannot be converted'), {
          statusCode: 409,
          code: 'CONTROL_ACCOUNT_IN_USE',
        });
      if (body.name) {
        body.normalizedName = body.name.toLowerCase();
        if (
          await Account.exists({
            _id: { $ne: doc._id },
            normalizedName: body.normalizedName,
            isDeleted: false,
          }).session(s)
        )
          throw Object.assign(new Error('Account name already exists'), { statusCode: 409, code: 'ACCOUNT_DUPLICATE' });
      }
      const finalType = body.type || doc.type;
      const finalParent = body.parent === undefined ? doc.parent : body.parent;
      await validateParent({ accountId: doc._id, parentId: finalParent, type: finalType, session: s });
      enforceControlRules(body, doc);
      Object.assign(doc, body, { updatedBy: req.user._id });
      if (body.type) doc.normalBalance = normalBalance(body.type);
      await recalcHierarchy(doc, s);
    });
    res.json(doc);
  } catch (e) {
    return fail(res, e);
  } finally {
    await s.endSession();
  }
}
export async function removeAccount(req, res) {
  const doc = await Account.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Account not found' });
  if (doc.systemKey || doc.isControlAccount)
    return res
      .status(409)
      .json({ message: 'System/control account cannot be deleted', code: 'CONTROL_ACCOUNT_PROTECTED' });
  if (
    (await Account.exists({ parent: doc._id, isDeleted: false })) ||
    (await GeneralLedgerEntry.exists({ account: doc._id }))
  )
    return res.status(409).json({ message: 'Account has children or ledger activity', code: 'ACCOUNT_IN_USE' });
  doc.isDeleted = true;
  doc.active = false;
  doc.deletedAt = new Date();
  doc.deletedBy = req.user._id;
  await doc.save();
  res.json({ success: true });
}
export async function restoreAccount(req, res) {
  const s = await mongoose.startSession();
  try {
    let doc;
    await s.withTransaction(async () => {
      doc = await Account.findOne({ _id: req.params.id, isDeleted: true }).session(s);
      if (!doc) throw Object.assign(new Error('Deleted account not found'), { statusCode: 404 });
      if (
        await Account.exists({
          _id: { $ne: doc._id },
          isDeleted: false,
          $or: [{ code: doc.code }, { normalizedName: doc.normalizedName }],
        }).session(s)
      )
        throw Object.assign(new Error('Active account already uses this code or name'), {
          statusCode: 409,
          code: 'ACCOUNT_RESTORE_DUPLICATE',
        });
      const parent = await validateParent({ accountId: doc._id, parentId: doc.parent, type: doc.type, session: s });
      if (doc.parent && !parent)
        throw Object.assign(new Error('Parent account is not available'), {
          statusCode: 422,
          code: 'PARENT_ACCOUNT_INVALID',
        });
      doc.isDeleted = false;
      doc.active = true;
      doc.deletedAt = undefined;
      doc.deletedBy = undefined;
      doc.updatedBy = req.user._id;
      await recalcHierarchy(doc, s);
    });
    res.json(doc);
  } catch (e) {
    return fail(res, e);
  } finally {
    await s.endSession();
  }
}
export async function setAccountStatus(req, res) {
  const active = req.body.active;
  if (typeof active !== 'boolean') return res.status(422).json({ message: 'active must be true or false' });
  const doc = await Account.findOne({ _id: req.params.id, isDeleted: false });
  if (!doc) return res.status(404).json({ message: 'Account not found' });
  if (!active && doc.systemKey)
    return res.status(409).json({ message: 'System account cannot be deactivated', code: 'SYSTEM_ACCOUNT_PROTECTED' });
  if (!active && (await Account.exists({ parent: doc._id, isDeleted: false, active: true })))
    return res.status(409).json({ message: 'Deactivate active child accounts first', code: 'ACTIVE_CHILD_ACCOUNTS' });
  doc.active = active;
  doc.updatedBy = req.user._id;
  await doc.save();
  res.json(doc);
}
export async function adjustOpeningBalance(req, res) {
  let body;
  try {
    body = parse(openingBalanceAdjustmentSchema, req.body);
  } catch (e) {
    return fail(res, e);
  }
  const s = await mongoose.startSession();
  try {
    let doc, journal;
    await s.withTransaction(async () => {
      doc = await Account.findOne({ _id: req.params.id, isDeleted: false, active: true }).session(s);
      if (!doc) throw Object.assign(new Error('Active account not found'), { statusCode: 404 });
      const difference = round(body.newOpeningBalance - doc.openingBalance);
      if (difference === 0)
        throw Object.assign(new Error('New opening balance is unchanged'), {
          statusCode: 422,
          code: 'OPENING_BALANCE_UNCHANGED',
        });
      const equity = await Account.findOne({ systemKey: 'owner-equity', active: true, isDeleted: false }).session(s);
      if (!equity)
        throw Object.assign(new Error('Owner Equity system account missing'), {
          statusCode: 500,
          code: 'SYSTEM_ACCOUNT_MISSING',
        });
      const increases = difference > 0,
        amount = Math.abs(difference);
      const debit = (doc.normalBalance === 'debit') === increases ? amount : 0,
        credit = debit ? 0 : amount;
      journal = await postJournal(
        {
          date: body.date || new Date(),
          type: 'adjustment',
          narration: `Opening balance adjustment for ${doc.code}: ${body.reason}`,
          reference: body.reference || `OPEN-ADJ-${doc.code}-${Date.now()}`,
          sourceType: 'Account',
          sourceId: doc._id,
          sourceEvent: `opening-adjustment-${Date.now()}`,
          lines: [
            { account: doc._id, debit, credit },
            { account: equity._id, debit: credit, credit: debit },
          ],
          metadata: {
            previousOpeningBalance: doc.openingBalance,
            newOpeningBalance: body.newOpeningBalance,
            reason: body.reason,
          },
        },
        { session: s, userId: req.user._id },
      );
      doc.openingBalance = body.newOpeningBalance;
      doc.updatedBy = req.user._id;
      await doc.save({ session: s });
    });
    res.json({ account: doc, journal });
  } catch (e) {
    return fail(res, e);
  } finally {
    await s.endSession();
  }
}

export async function listJournals(req, res) {
  const page = Math.max(1, n(req.query.page) || 1),
    limit = Math.min(200, Math.max(1, n(req.query.limit) || 25)),
    filter = {};
  for (const k of ['type', 'status', 'sourceType', 'fiscalYear', 'accountingPeriod', 'createdBy'])
    if (req.query[k]) filter[k] = req.query[k];
  if (req.query.search)
    filter.$or = [
      { journalNo: { $regex: req.query.search, $options: 'i' } },
      { narration: { $regex: req.query.search, $options: 'i' } },
      { reference: { $regex: req.query.search, $options: 'i' } },
      { referenceDocumentNo: { $regex: req.query.search, $options: 'i' } },
    ];
  if (req.query.dateFrom || req.query.dateTo)
    filter.date = {
      ...(req.query.dateFrom && { $gte: new Date(req.query.dateFrom) }),
      ...(req.query.dateTo && { $lte: new Date(`${req.query.dateTo}T23:59:59.999Z`) }),
    };
  const sortWhitelist = { date: 1, journalNo: 1, status: 1, type: 1, totalDebit: 1, createdAt: 1 };
  const sortBy = sortWhitelist[req.query.sortBy] ? req.query.sortBy : 'date',
    direction = req.query.sortOrder === 'asc' ? 1 : -1;
  const [items, total, summary] = await Promise.all([
    JournalEntry.find(filter)
      .populate('createdBy submittedBy approvedBy rejectedBy postedBy reversedBy', 'name email')
      .sort({ [sortBy]: direction, _id: direction })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JournalEntry.countDocuments(filter),
    JournalEntry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          debit: { $sum: '$totalDebit' },
          credit: { $sum: '$totalCredit' },
        },
      },
    ]),
  ]);
  res.json({ items, summary, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
export async function createJournal(req, res) {
  let body;
  try {
    body = parse(journalCreateSchema, req.body);
  } catch (e) {
    return fail(res, e);
  }
  try {
    assertBalanced(body.lines);
    await resolveOpenPeriod(body.date || new Date());
    if (body.idempotencyKey && (await JournalEntry.exists({ idempotencyKey: body.idempotencyKey })))
      return res.status(409).json({ message: 'Duplicate journal submission', code: 'JOURNAL_IDEMPOTENCY_CONFLICT' });
    const accountIds = [...new Set(body.lines.map((l) => String(l.account)))];
    const accounts = await Account.find({ _id: { $in: accountIds }, active: true, isDeleted: false });
    if (accounts.length !== accountIds.length)
      return res
        .status(422)
        .json({ message: 'One or more journal accounts are invalid or inactive', code: 'ACCOUNT_INVALID' });
    for (const a of accounts) {
      if (!a.allowManualPosting || a.isControlAccount)
        return res.status(409).json({
          message: `Manual posting not allowed for ${a.code}`,
          code: a.isControlAccount ? 'CONTROL_ACCOUNT_POSTING_PROHIBITED' : 'MANUAL_POSTING_DISABLED',
        });
    }
    const doc = await JournalEntry.create({
      ...body,
      journalNo: await nextJournalNo(),
      status: 'draft',
      totalDebit: round(body.lines.reduce((s, l) => s + n(l.debit), 0)),
      totalCredit: round(body.lines.reduce((s, l) => s + n(l.credit), 0)),
      lines: body.lines.map((l) => {
        const a = accounts.find((x) => String(x._id) === String(l.account));
        return { ...l, accountCode: a.code, accountName: a.name };
      }),
      createdBy: req.user._id,
      approvalHistory: [{ action: 'updated', by: req.user._id, at: new Date(), ...auditContext(req) }],
    });
    res.status(201).json(doc);
  } catch (e) {
    return fail(res, e);
  }
}
export async function updateJournal(req, res) {
  let body;
  try {
    body = parse(journalUpdateSchema, req.body);
  } catch (e) {
    return fail(res, e);
  }
  const doc = await JournalEntry.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  if (!['draft', 'rejected'].includes(doc.status))
    return res.status(409).json({ message: 'Only draft or rejected journal can be edited', code: 'JOURNAL_IMMUTABLE' });
  if (String(doc.createdBy) !== String(req.user._id) && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Only maker can edit this journal' });
  const before = doc.toObject();
  Object.assign(doc, body, {
    updatedBy: req.user._id,
    status: 'draft',
    approvalLevel: 0,
    approvedAt: undefined,
    approvedBy: undefined,
    rejectedAt: undefined,
    rejectedBy: undefined,
    rejectionReason: undefined,
  });
  if (body.lines) {
    const accountIds = [...new Set(body.lines.map((l) => String(l.account)))];
    const accounts = await Account.find({ _id: { $in: accountIds }, active: true, isDeleted: false });
    if (accounts.length !== accountIds.length)
      return res
        .status(422)
        .json({ message: 'One or more journal accounts are invalid or inactive', code: 'ACCOUNT_INVALID' });
    assertBalanced(body.lines);
    doc.lines = body.lines.map((l) => {
      const a = accounts.find((x) => String(x._id) === String(l.account));
      if (!a) throw Object.assign(new Error('Invalid account'), { statusCode: 422 });
      if (!a.allowManualPosting || a.isControlAccount)
        throw Object.assign(new Error(`Manual posting not allowed for ${a.code}`), { statusCode: 409 });
      return { ...l, accountCode: a.code, accountName: a.name };
    });
    doc.totalDebit = round(body.lines.reduce((s, l) => s + n(l.debit), 0));
    doc.totalCredit = round(body.lines.reduce((s, l) => s + n(l.credit), 0));
  }
  doc.approvalHistory.push({ action: 'updated', by: req.user._id, before, after: body, ...auditContext(req) });
  await doc.save();
  res.json(doc);
}
export async function deleteJournal(req, res) {
  const doc = await JournalEntry.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  if (!['draft', 'rejected'].includes(doc.status))
    return res
      .status(409)
      .json({ message: 'Only draft or rejected journal can be deleted', code: 'JOURNAL_IMMUTABLE' });
  if (String(doc.createdBy) !== String(req.user._id) && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Only maker can delete this journal' });
  await doc.deleteOne();
  res.json({ success: true });
}
export async function submitJournal(req, res) {
  const doc = await JournalEntry.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  if (!journalTransitionAllowed(doc.status, 'pending-approval'))
    return res.status(409).json({ message: 'Journal cannot be submitted', code: 'JOURNAL_STATE_INVALID' });
  doc.status = 'pending-approval';
  doc.submittedAt = new Date();
  doc.submittedBy = req.user._id;
  doc.approvalHistory.push({ action: 'submitted', by: req.user._id, ...auditContext(req) });
  await doc.save();
  res.json(doc);
}
export async function approveJournal(req, res) {
  const doc = await JournalEntry.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  if (doc.status !== 'pending-approval') return res.status(409).json({ message: 'Journal is not pending approval' });
  if (String(doc.createdBy) === String(req.user._id))
    return res.status(409).json({ message: 'Maker cannot approve own journal', code: 'MAKER_CHECKER_VIOLATION' });
  doc.approvalLevel += 1;
  doc.approvalHistory.push({
    action: 'approved',
    level: doc.approvalLevel,
    by: req.user._id,
    reason: req.body.reason,
    ...auditContext(req),
  });
  if (doc.approvalLevel >= doc.requiredApprovalLevel) {
    doc.status = 'approved';
    doc.approvedAt = new Date();
    doc.approvedBy = req.user._id;
  }
  await doc.save();
  res.json(doc);
}
export async function rejectJournal(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(422).json({ message: 'Rejection reason is required' });
  const doc = await JournalEntry.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  if (!['pending-approval', 'approved'].includes(doc.status))
    return res.status(409).json({ message: 'Journal cannot be rejected' });
  if (String(doc.createdBy) === String(req.user._id))
    return res.status(409).json({ message: 'Maker cannot reject own journal' });
  doc.status = 'rejected';
  doc.rejectionReason = reason;
  doc.rejectedAt = new Date();
  doc.rejectedBy = req.user._id;
  doc.approvalHistory.push({ action: 'rejected', by: req.user._id, reason, ...auditContext(req) });
  await doc.save();
  res.json(doc);
}
export async function postApprovedJournal(req, res) {
  const doc = await JournalEntry.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  if (doc.status !== 'approved') return res.status(409).json({ message: 'Only approved journal can be posted' });
  if (String(doc.createdBy) === String(req.user._id))
    return res.status(409).json({ message: 'Maker cannot post own journal', code: 'MAKER_CHECKER_VIOLATION' });
  try {
    const posted = await postJournal(doc.toObject(), { userId: req.user._id, existingJournalId: doc._id });
    res.json(posted);
  } catch (e) {
    return fail(res, e);
  }
}
export async function journalDetail(req, res) {
  const doc = await JournalEntry.findById(req.params.id)
    .populate('lines.account', 'code name type')
    .populate('createdBy submittedBy approvedBy rejectedBy postedBy reversedBy', 'name email')
    .populate('fiscalYear accountingPeriod');
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  res.json(doc);
}
export async function journalTimeline(req, res) {
  const doc = await JournalEntry.findById(req.params.id).select(
    'journalNo status approvalHistory createdAt updatedAt postedAt reversedAt',
  );
  if (!doc) return res.status(404).json({ message: 'Journal not found' });
  res.json({
    journalNo: doc.journalNo,
    status: doc.status,
    events: [
      { action: 'created', at: doc.createdAt },
      ...doc.approvalHistory.map((x) => x.toObject()),
      ...(doc.postedAt ? [{ action: 'posted', at: doc.postedAt }] : []),
      ...(doc.reversedAt ? [{ action: 'reversed', at: doc.reversedAt }] : []),
    ],
  });
}
export async function reverse(req, res) {
  try {
    const doc = await reverseJournal(req.params.id, { userId: req.user._id, reason: req.body.reason });
    res.json(doc);
  } catch (e) {
    return fail(res, e);
  }
}
function glFilter(q) {
  const f = {};
  for (const k of [
    'account',
    'sourceType',
    'sourceId',
    'partyType',
    'party',
    'warehouse',
    'product',
    'costCenter',
    'department',
    'project',
    'branch',
    'isReversal',
  ])
    if (q[k] !== undefined) f[k] = q[k];
  if (q.dateFrom || q.dateTo)
    f.date = { ...(q.dateFrom && { $gte: new Date(q.dateFrom) }), ...(q.dateTo && { $lte: new Date(q.dateTo) }) };
  return f;
}
async function statementData(accountId, q) {
  const account = await Account.findById(accountId).lean();
  if (!account) throw Object.assign(new Error('Account not found'), { statusCode: 404 });
  const from = q.dateFrom ? new Date(q.dateFrom) : null,
    to = q.dateTo ? new Date(q.dateTo) : new Date();
  const before = from
    ? await GeneralLedgerEntry.aggregate([
        { $match: { account: new mongoose.Types.ObjectId(accountId), date: { $lt: from } } },
        { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      ])
    : [];
  let balance = round(
    account.openingBalance +
      (account.normalBalance === 'debit'
        ? n(before[0]?.debit) - n(before[0]?.credit)
        : n(before[0]?.credit) - n(before[0]?.debit)),
  );
  const filter = { account: account._id, date: { ...(from && { $gte: from }), $lte: to } };
  const rows = await GeneralLedgerEntry.find(filter).sort({ date: 1, _id: 1 }).lean();
  const items = rows.map((r) => {
    balance = round(balance + (account.normalBalance === 'debit' ? r.debit - r.credit : r.credit - r.debit));
    return { ...r, runningBalance: balance };
  });
  return {
    account,
    openingBalance: from
      ? round(
          account.openingBalance +
            (account.normalBalance === 'debit'
              ? n(before[0]?.debit) - n(before[0]?.credit)
              : n(before[0]?.credit) - n(before[0]?.debit)),
        )
      : account.openingBalance,
    closingBalance: balance,
    items,
  };
}
export async function accountStatement(req, res) {
  try {
    res.json(await statementData(req.params.id, req.query));
  } catch (e) {
    return fail(res, e);
  }
}
export async function generalLedger(req, res) {
  try {
    res.json(await buildGeneralLedger(req.query));
  } catch (e) {
    return fail(res, e);
  }
}
export async function ledgerDrilldown(req, res) {
  try {
    res.json(await getLedgerDrilldown(req.params.id));
  } catch (e) {
    return fail(res, e);
  }
}
export async function sourceDrilldown(req, res) {
  const entries = await GeneralLedgerEntry.find({ sourceType: req.params.sourceType, sourceId: req.params.sourceId })
    .populate('account', 'code name')
    .populate('journal')
    .sort({ date: 1, _id: 1 });
  res.json({ entries });
}
function pdfResponse(res, title, rows) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
  const doc = new PDFDocument({ margin: 36 });
  doc.pipe(res);
  doc.fontSize(18).text(title);
  doc.moveDown();
  for (const row of rows) doc.fontSize(9).text(row);
  doc.end();
}
export async function journalPdf(req, res) {
  const j = await JournalEntry.findById(req.params.id).populate('lines.account', 'code name');
  if (!j) return res.status(404).json({ message: 'Journal not found' });
  pdfResponse(res, `Journal ${j.journalNo}`, [
    `Date: ${j.date.toISOString().slice(0, 10)}`,
    `Status: ${j.status}`,
    `Narration: ${j.narration}`,
    ...j.lines.map((l) => `${l.accountCode} ${l.accountName} | Dr ${l.debit.toFixed(2)} | Cr ${l.credit.toFixed(2)}`),
    `Total Debit: ${j.totalDebit.toFixed(2)} | Total Credit: ${j.totalCredit.toFixed(2)}`,
  ]);
}
async function excelResponse(res, name, headers, rows) {
  const wb = new ExcelJS.Workbook(),
    ws = wb.addWorksheet(name);
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
export async function journalExcel(req, res) {
  const j = await JournalEntry.findById(req.params.id);
  if (!j) return res.status(404).json({ message: 'Journal not found' });
  await excelResponse(
    res,
    j.journalNo,
    ['Account code', 'Account name', 'Description', 'Debit', 'Credit'],
    j.lines.map((l) => [l.accountCode, l.accountName, l.description || '', l.debit, l.credit]),
  );
}
export async function journalCsv(req, res) {
  const j = await JournalEntry.findById(req.params.id);
  if (!j) return res.status(404).json({ message: 'Journal not found' });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${j.journalNo}.csv"`);
  res.send(
    [
      'Account Code,Account Name,Description,Debit,Credit',
      ...j.lines.map((l) =>
        [l.accountCode, JSON.stringify(l.accountName), JSON.stringify(l.description || ''), l.debit, l.credit].join(
          ',',
        ),
      ),
    ].join('\n'),
  );
}
export async function glPdf(req, res) {
  const rows = await GeneralLedgerEntry.find(glFilter(req.query)).sort({ date: 1, _id: 1 }).limit(5000).lean();
  pdfResponse(
    res,
    'General Ledger',
    rows.map(
      (r) =>
        `${r.date.toISOString().slice(0, 10)} | ${r.journalNo} | ${r.accountCode} | Dr ${r.debit.toFixed(2)} | Cr ${r.credit.toFixed(2)}${r.isReversal ? ' | REVERSAL' : ''}`,
    ),
  );
}
export async function glExcel(req, res) {
  const rows = await GeneralLedgerEntry.find(glFilter(req.query)).sort({ date: 1, _id: 1 }).limit(100000).lean();
  await excelResponse(
    res,
    'general-ledger',
    ['Date', 'Journal', 'Account', 'Description', 'Debit', 'Credit', 'Reversal'],
    rows.map((r) => [r.date, r.journalNo, r.accountCode, r.description, r.debit, r.credit, r.isReversal]),
  );
}
export async function glCsv(req, res) {
  const rows = await GeneralLedgerEntry.find(glFilter(req.query)).sort({ date: 1, _id: 1 }).limit(100000).lean();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="general-ledger.csv"');
  res.send(
    [
      'Date,Journal,Account,Description,Debit,Credit,Reversal',
      ...rows.map((r) =>
        [
          r.date.toISOString(),
          r.journalNo,
          r.accountCode,
          JSON.stringify(r.description || ''),
          r.debit,
          r.credit,
          r.isReversal,
        ].join(','),
      ),
    ].join('\n'),
  );
}
export async function statementPdf(req, res) {
  try {
    const d = await statementData(req.params.id, req.query);
    pdfResponse(res, `Account Statement ${d.account.code}`, [
      `Opening: ${d.openingBalance.toFixed(2)}`,
      ...d.items.map(
        (r) =>
          `${r.date.toISOString().slice(0, 10)} | ${r.journalNo} | Dr ${r.debit.toFixed(2)} | Cr ${r.credit.toFixed(2)} | Bal ${r.runningBalance.toFixed(2)}`,
      ),
      `Closing: ${d.closingBalance.toFixed(2)}`,
    ]);
  } catch (e) {
    return fail(res, e);
  }
}
export async function statementExcel(req, res) {
  try {
    const d = await statementData(req.params.id, req.query);
    await excelResponse(
      res,
      `statement-${d.account.code}`,
      ['Date', 'Journal', 'Description', 'Debit', 'Credit', 'Running Balance'],
      d.items.map((r) => [r.date, r.journalNo, r.description, r.debit, r.credit, r.runningBalance]),
    );
  } catch (e) {
    return fail(res, e);
  }
}
export async function reconcileBalances(req, res) {
  const accounts = await Account.find({ isDeleted: false }).lean();
  const grouped = await GeneralLedgerEntry.aggregate([
    { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const sumsByAccount = new Map(grouped.map((x) => [String(x._id), x]));
  const results = accounts.map((a) => {
    const sums = sumsByAccount.get(String(a._id)) || {};
    const expected = round(
      a.openingBalance +
        (a.normalBalance === 'debit' ? n(sums.debit) - n(sums.credit) : n(sums.credit) - n(sums.debit)),
    );
    const drift = round(expected - a.currentBalance);
    return { account: a._id, code: a.code, current: a.currentBalance, expected, drift };
  });
  if (req.body.apply === true) {
    const operations = results
      .filter((x) => x.drift !== 0)
      .map((x) => ({ updateOne: { filter: { _id: x.account }, update: { $set: { currentBalance: x.expected } } } }));
    if (operations.length) await Account.bulkWrite(operations, { ordered: false });
  }
  res.json({ applied: req.body.apply === true, results });
}
export async function createFiscalYear(req, res) {
  let b;
  try {
    b = parse(fiscalYearSchema, req.body);
  } catch (e) {
    return fail(res, e);
  }
  const fy = await FiscalYear.create({ ...b, createdBy: req.user._id });
  const periods = [];
  let cursor = new Date(fy.startDate);
  while (cursor <= fy.endDate) {
    const start = new Date(cursor),
      end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    if (end > fy.endDate) end.setTime(fy.endDate.getTime());
    periods.push({
      fiscalYear: fy._id,
      name: start.toLocaleString('en', { month: 'long', year: 'numeric' }),
      startDate: start,
      endDate: end,
      createdBy: req.user._id,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  await AccountingPeriod.insertMany(periods);
  res.status(201).json({ fiscalYear: fy, periods });
}
export async function listFiscalYears(req, res) {
  res.json(await FiscalYear.find().sort({ startDate: -1 }).lean());
}
export async function listPeriods(req, res) {
  const filter = req.query.fiscalYear ? { fiscalYear: req.query.fiscalYear } : {};
  res.json(await AccountingPeriod.find(filter).populate('fiscalYear', 'name').sort({ startDate: 1 }).lean());
}
export async function createPeriod(req, res) {
  let b;
  try {
    b = parse(periodSchema, req.body);
  } catch (e) {
    return fail(res, e);
  }
  res.status(201).json(await AccountingPeriod.create({ ...b, createdBy: req.user._id }));
}
export async function changePeriodStatus(req, res) {
  const status = req.body.status;
  if (!['open', 'locked', 'closed'].includes(status)) return res.status(422).json({ message: 'Invalid period status' });
  const p = await AccountingPeriod.findById(req.params.id);
  if (!p) return res.status(404).json({ message: 'Period not found' });
  p.status = status;
  p.lockedAt = status === 'open' ? undefined : new Date();
  p.lockedBy = status === 'open' ? undefined : req.user._id;
  p.lockReason = req.body.reason;
  await p.save();
  res.json(p);
}
const dimensionModels = { 'cost-centers': CostCenter, departments: Department, projects: Project, branches: Branch };
export async function listDimensions(req, res) {
  const M = dimensionModels[req.params.kind];
  if (!M) return res.status(404).json({ message: 'Dimension not found' });
  res.json(await M.find().sort({ code: 1 }).lean());
}
export async function createDimension(req, res) {
  const M = dimensionModels[req.params.kind];
  if (!M) return res.status(404).json({ message: 'Dimension not found' });
  const code = String(req.body.code || '')
      .trim()
      .toUpperCase(),
    name = String(req.body.name || '').trim();
  if (!code || !name) return res.status(422).json({ message: 'Code and name are required' });
  res.status(201).json(await M.create({ code, name, description: req.body.description, createdBy: req.user._id }));
}
export async function listTemplates(req, res) {
  res.json(await JournalTemplate.find({ active: true }).sort({ name: 1 }).lean());
}
export async function createTemplate(req, res) {
  res.status(201).json(await JournalTemplate.create({ ...req.body, createdBy: req.user._id }));
}
export async function listRecurring(req, res) {
  res.json(await RecurringJournal.find().populate('template').sort({ nextRunAt: 1 }).lean());
}
export async function createRecurring(req, res) {
  res.status(201).json(await RecurringJournal.create({ ...req.body, createdBy: req.user._id }));
}
