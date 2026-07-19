import mongoose from 'mongoose';
import { Account, JournalEntry, GeneralLedgerEntry, FiscalYear, AccountingPeriod } from '../models/accounting.js';
import { Counter } from '../models/index.js';
const round = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
function fail(message, code = 'ACCOUNTING_POSTING_ERROR', statusCode = 422) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}
export async function nextJournalNo(session) {
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate(
    { _id: `journal-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session },
  );
  return `JV-${year}-${String(c.seq).padStart(6, '0')}`;
}
export async function getSystemAccount(systemKey, session) {
  const account = await Account.findOne({ systemKey, active: true, isDeleted: false }).session(session || null);
  if (!account) throw fail(`System account is missing: ${systemKey}`, 'SYSTEM_ACCOUNT_MISSING', 500);
  return account;
}
export function assertBalanced(lines, precision = 2) {
  const factor = 10 ** precision;
  const r = (n) => Math.round((Number(n || 0) + Number.EPSILON) * factor) / factor;
  const debit = r(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const credit = r(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  if (debit <= 0 || debit !== credit)
    throw fail(`Journal is not balanced. Debit=${debit}, Credit=${credit}`, 'JOURNAL_NOT_BALANCED');
  return { totalDebit: debit, totalCredit: credit };
}
export async function resolveOpenPeriod(date, session) {
  const d = new Date(date || Date.now());
  const fy = await FiscalYear.findOne({ startDate: { $lte: d }, endDate: { $gte: d }, status: 'open' }).session(
    session || null,
  );
  if (!fy) throw fail('No open fiscal year exists for journal date', 'FISCAL_YEAR_NOT_OPEN', 409);
  const period = await AccountingPeriod.findOne({
    fiscalYear: fy._id,
    startDate: { $lte: d },
    endDate: { $gte: d },
  }).session(session || null);
  if (!period) throw fail('No accounting period exists for journal date', 'ACCOUNTING_PERIOD_MISSING', 409);
  if (period.status !== 'open') throw fail('Accounting period is locked or closed', 'ACCOUNTING_PERIOD_LOCKED', 409);
  return { fiscalYear: fy, period };
}
async function validateAccounts(input, session) {
  const ids = input.lines.map((l) => l.account);
  const accounts = await Account.find({ _id: { $in: ids }, active: true, isDeleted: false }).session(session);
  const map = new Map(accounts.map((a) => [String(a._id), a]));
  if (map.size !== new Set(ids.map(String)).size)
    throw fail('One or more accounts are invalid or inactive', 'ACCOUNT_INVALID');
  const manual = ['manual', 'adjustment', 'opening'].includes(input.type);
  if (manual) {
    for (const a of accounts) {
      if (!a.allowManualPosting) throw fail(`Manual posting is disabled for ${a.code}`, 'MANUAL_POSTING_DISABLED', 409);
      if (a.isControlAccount)
        throw fail(
          `Direct manual posting to control account ${a.code} is prohibited`,
          'CONTROL_ACCOUNT_POSTING_PROHIBITED',
          409,
        );
    }
  }
  return map;
}
export async function postJournal(input, { session, userId, existingJournalId } = {}) {
  const own = !session;
  const s = session || (await mongoose.startSession());
  let result;
  try {
    const run = async () => {
      if (input.sourceType && input.sourceId) {
        const existing = await JournalEntry.findOne({
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEvent: input.sourceEvent || 'posted',
        }).session(s);
        if (existing && String(existing._id) !== String(existingJournalId || '')) {
          result = existing;
          return;
        }
      }
      if (input.idempotencyKey) {
        const existing = await JournalEntry.findOne({ idempotencyKey: input.idempotencyKey }).session(s);
        if (existing && String(existing._id) !== String(existingJournalId || '')) {
          result = existing;
          return;
        }
      }
      const { fiscalYear, period } = await resolveOpenPeriod(input.date || new Date(), s);
      const map = await validateAccounts(input, s);
      const exchangeRate = Number(input.exchangeRate || 1);
      const currency = (input.currency || fiscalYear.baseCurrency || 'PKR').toUpperCase();
      const baseCurrency = (input.baseCurrency || fiscalYear.baseCurrency || 'PKR').toUpperCase();
      const lines = input.lines.map((l) => {
        const a = map.get(String(l.account));
        return {
          ...l,
          account: a._id,
          accountCode: a.code,
          accountName: a.name,
          debit: round(l.debit),
          credit: round(l.credit),
          foreignDebit: round(l.foreignDebit || (currency !== baseCurrency ? Number(l.debit || 0) / exchangeRate : 0)),
          foreignCredit: round(
            l.foreignCredit || (currency !== baseCurrency ? Number(l.credit || 0) / exchangeRate : 0),
          ),
        };
      });
      const totals = assertBalanced(lines);
      let journal;
      if (existingJournalId) {
        journal = await JournalEntry.findById(existingJournalId).session(s);
        if (!journal) throw fail('Journal not found', 'JOURNAL_NOT_FOUND', 404);
        if (!['approved', 'draft', 'pending-approval'].includes(journal.status))
          throw fail('Journal cannot be posted in current status', 'JOURNAL_STATE_INVALID', 409);
        Object.assign(journal, {
          date: input.date || journal.date,
          type: input.type || journal.type,
          narration: input.narration || journal.narration,
          reference: input.reference || journal.reference,
          referenceDocumentNo: input.referenceDocumentNo || journal.referenceDocumentNo,
          lines,
          ...totals,
          status: 'posted',
          postedAt: new Date(),
          postedBy: userId,
          fiscalYear: fiscalYear._id,
          accountingPeriod: period._id,
          currency,
          baseCurrency,
          exchangeRate,
          metadata: input.metadata || journal.metadata,
        });
        journal.approvalHistory.push({ action: 'posted', by: userId, at: new Date() });
        await journal.save({ session: s });
      } else {
        [journal] = await JournalEntry.create(
          [
            {
              journalNo: await nextJournalNo(s),
              date: input.date || new Date(),
              type: input.type,
              narration: input.narration,
              reference: input.reference,
              referenceDocumentNo: input.referenceDocumentNo,
              idempotencyKey: input.idempotencyKey,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              sourceEvent: input.sourceEvent || 'posted',
              lines,
              ...totals,
              status: 'posted',
              postedAt: new Date(),
              postedBy: userId,
              createdBy: userId,
              fiscalYear: fiscalYear._id,
              accountingPeriod: period._id,
              currency,
              baseCurrency,
              exchangeRate,
              metadata: input.metadata,
              approvalHistory: [{ action: 'posted', by: userId, at: new Date() }],
            },
          ],
          { session: s },
        );
      }
      const gl = journal.lines.map((l) => ({
        journal: journal._id,
        journalLineId: l._id,
        journalNo: journal.journalNo,
        date: journal.date,
        account: l.account,
        accountCode: l.accountCode,
        description: l.description || journal.narration,
        debit: l.debit,
        credit: l.credit,
        foreignDebit: l.foreignDebit,
        foreignCredit: l.foreignCredit,
        currency,
        baseCurrency,
        exchangeRate,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        isReversal: journal.type === 'reversal',
        reversalOfJournal: journal.reversalOf,
        partyType: l.partyType,
        party: l.party,
        warehouse: l.warehouse,
        product: l.product,
        costCenter: l.costCenter,
        department: l.department,
        project: l.project,
        branch: l.branch,
        createdBy: userId,
      }));
      await GeneralLedgerEntry.insertMany(gl, { session: s });
      for (const l of journal.lines) {
        const a = map.get(String(l.account));
        const delta = a.normalBalance === 'debit' ? round(l.debit - l.credit) : round(l.credit - l.debit);
        await Account.updateOne({ _id: a._id }, { $inc: { currentBalance: delta } }, { session: s });
      }
      result = journal;
    };
    if (own) await s.withTransaction(run);
    else await run();
    return result;
  } finally {
    if (own) await s.endSession();
  }
}
export async function reverseJournal(journalId, { session, userId, reason } = {}) {
  const own = !session;
  const s = session || (await mongoose.startSession());
  let reversal;
  try {
    const run = async () => {
      const original = await JournalEntry.findById(journalId).session(s);
      if (!original || original.status !== 'posted')
        throw fail('Only posted journal can be reversed', 'JOURNAL_NOT_REVERSIBLE', 409);
      await resolveOpenPeriod(new Date(), s);
      reversal = await postJournal(
        {
          date: new Date(),
          type: 'reversal',
          narration: `Reversal: ${original.narration}`,
          reference: `REV-${original.journalNo}`,
          sourceType: 'JournalEntry',
          sourceId: original._id,
          sourceEvent: 'reversal',
          lines: original.lines.map((l) => ({
            account: l.account,
            debit: l.credit,
            credit: l.debit,
            foreignDebit: l.foreignCredit,
            foreignCredit: l.foreignDebit,
            description: reason || 'Journal reversal',
            partyType: l.partyType,
            party: l.party,
            warehouse: l.warehouse,
            product: l.product,
            costCenter: l.costCenter,
            department: l.department,
            project: l.project,
            branch: l.branch,
          })),
          currency: original.currency,
          baseCurrency: original.baseCurrency,
          exchangeRate: original.exchangeRate,
          metadata: { reversalOf: original._id, reason },
        },
        { session: s, userId },
      );
      original.status = 'reversed';
      original.reversedByJournal = reversal._id;
      original.reversedBy = userId;
      original.reversedAt = new Date();
      original.reversalReason = reason;
      original.approvalHistory.push({ action: 'reversed', by: userId, reason, at: new Date() });
      await original.save({ session: s });
    };
    if (own) await s.withTransaction(run);
    else await run();
    return reversal;
  } finally {
    if (own) await s.endSession();
  }
}
export async function autoPost(kind, doc, { session, userId, event = 'posted' } = {}) {
  const amount = round(doc.totalAmount || doc.grandTotal || doc.total || doc.amount);
  if (amount <= 0) throw fail('Automatic posting amount must be positive');
  let debitKey, creditKey, type, narration, partyType, party;
  if (kind === 'sale') {
    debitKey = 'accounts-receivable';
    creditKey = 'sales-revenue';
    type = 'sale';
    narration = `Sale ${doc.invoiceNo}`;
    partyType = 'customer';
    party = doc.customer;
  } else if (kind === 'purchase') {
    debitKey = 'inventory';
    creditKey = 'accounts-payable';
    type = 'purchase';
    narration = `Purchase ${doc.purchaseNo}`;
    partyType = 'supplier';
    party = doc.supplier;
  } else if (kind === 'customer-receipt') {
    debitKey = doc.method === 'bank' ? 'bank' : 'cash';
    creditKey = 'accounts-receivable';
    type = 'receipt';
    narration = `Customer receipt ${doc.paymentNo}`;
    partyType = 'customer';
    party = doc.party;
  } else if (kind === 'supplier-payment') {
    debitKey = 'accounts-payable';
    creditKey = doc.method === 'bank' ? 'bank' : 'cash';
    type = 'payment';
    narration = `Supplier payment ${doc.paymentNo}`;
    partyType = 'supplier';
    party = doc.party;
  } else if (kind === 'expense') {
    debitKey = 'operating-expenses';
    creditKey = doc.paymentMethod === 'bank' ? 'bank' : 'cash';
    type = 'expense';
    narration = `Expense ${doc.expenseNo}`;
  } else throw fail(`Unsupported automatic posting type: ${kind}`);
  const [dr, cr] = await Promise.all([getSystemAccount(debitKey, session), getSystemAccount(creditKey, session)]);
  return postJournal(
    {
      type,
      narration,
      sourceType: doc.constructor?.modelName || kind,
      sourceId: doc._id,
      sourceEvent: event,
      lines: [
        { account: dr._id, debit: amount, credit: 0, partyType, party, warehouse: doc.warehouse },
        { account: cr._id, debit: 0, credit: amount, partyType, party, warehouse: doc.warehouse },
      ],
      metadata: { automatic: true, kind },
    },
    { session, userId },
  );
}
