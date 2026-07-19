import { Sale, Purchase, Customer, Supplier, Ledger } from '../models/index.js';
import { Payment } from '../models/transactions.js';
import { CashAccount, AccountEntry } from '../models/financial.js';

export const number = (v) => Number(v || 0);
export const saleTransitions = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['fulfilled', 'cancelled'],
  fulfilled: ['partial', 'paid', 'cancelled'],
  partial: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};
export const purchaseTransitions = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['received', 'cancelled'],
  received: ['cancelled'],
  cancelled: [],
};
export function assertTransition(map, from, to, code = 'STATE_TRANSITION_INVALID') {
  if (!(map[from] || []).includes(to))
    throw Object.assign(new Error(`Transition ${from} -> ${to} is not allowed`), { statusCode: 409, code });
}
export function assertPaymentCompatibility(body) {
  const receipt = body.direction === 'receipt';
  if (receipt && (body.partyType !== 'customer' || (body.allocations || []).some((x) => x.documentType !== 'sale')))
    throw Object.assign(new Error('Customer receipts can only allocate to sales'), {
      statusCode: 422,
      code: 'PAYMENT_DIRECTION_PARTY_MISMATCH',
    });
  if (
    !receipt &&
    (body.partyType !== 'supplier' || (body.allocations || []).some((x) => x.documentType !== 'purchase'))
  )
    throw Object.assign(new Error('Supplier payments can only allocate to purchases'), {
      statusCode: 422,
      code: 'PAYMENT_DIRECTION_PARTY_MISMATCH',
    });
}
export async function validatePaymentDocuments(body, session) {
  assertPaymentCompatibility(body);
  for (const a of body.allocations || []) {
    if (a.documentType === 'sale') {
      const doc = await Sale.findById(a.document).session(session);
      if (!doc || String(doc.customer) !== String(body.party))
        throw Object.assign(new Error('Sale does not belong to payment customer'), {
          statusCode: 422,
          code: 'PAYMENT_PARTY_DOCUMENT_MISMATCH',
        });
      if (['draft', 'cancelled'].includes(doc.status))
        throw Object.assign(new Error('Sale cannot receive payment in current state'), {
          statusCode: 409,
          code: 'SALE_NOT_PAYABLE',
        });
      if (number(a.amount) > number(doc.remaining))
        throw Object.assign(new Error('Sale allocation exceeds remaining amount'), {
          statusCode: 409,
          code: 'SALE_ALLOCATION_INVALID',
        });
    } else {
      const doc = await Purchase.findById(a.document).session(session);
      if (!doc || String(doc.supplier) !== String(body.party))
        throw Object.assign(new Error('Purchase does not belong to payment supplier'), {
          statusCode: 422,
          code: 'PAYMENT_PARTY_DOCUMENT_MISMATCH',
        });
      if (['draft', 'cancelled'].includes(doc.status))
        throw Object.assign(new Error('Purchase cannot receive payment in current state'), {
          statusCode: 409,
          code: 'PURCHASE_NOT_PAYABLE',
        });
      if (number(a.amount) > number(doc.remaining))
        throw Object.assign(new Error('Purchase allocation exceeds remaining amount'), {
          statusCode: 409,
          code: 'PURCHASE_ALLOCATION_INVALID',
        });
    }
  }
}
export async function postAccount(
  { accountId, type, amount, description, referenceType, referenceId, userId, reversalOf },
  session,
) {
  if (!accountId) return null;
  const delta = type === 'debit' ? number(amount) : -number(amount);
  const account = await CashAccount.findOneAndUpdate(
    { _id: accountId, active: true },
    { $inc: { balance: delta } },
    { new: true, session },
  );
  if (!account)
    throw Object.assign(new Error('Cash/bank account not found or inactive'), {
      statusCode: 422,
      code: 'ACCOUNT_NOT_AVAILABLE',
    });
  const [entry] = await AccountEntry.create(
    [
      {
        account: account._id,
        type,
        amount,
        description,
        referenceType,
        referenceId,
        balanceAfter: account.balance,
        reversalOf,
        createdBy: userId,
      },
    ],
    { session },
  );
  return entry;
}
export async function reversePartyLedger({ payment, user: _user, session }) {
  const Model = payment.partyType === 'customer' ? Customer : Supplier;
  const party = await Model.findByIdAndUpdate(
    payment.party,
    { $inc: { currentBalance: number(payment.amount) } },
    { new: true, session },
  );
  const [entry] = await Ledger.create(
    [
      {
        partyType: payment.partyType,
        party: payment.party,
        partyModel: payment.partyType === 'customer' ? 'Customer' : 'Supplier',
        type: 'credit',
        amount: payment.amount,
        description: `Reversal ${payment.paymentNo}`,
        referenceType: 'payment-reversal',
        referenceId: payment._id,
        balanceAfter: party?.currentBalance,
      },
    ],
    { session },
  );
  return entry;
}
export async function lockPaymentForReversal(id, session) {
  const payment = await Payment.findOneAndUpdate(
    { _id: id, status: { $nin: ['reversed', 'cancelled'] } },
    { $set: { status: 'reversal-processing' } },
    { new: true, session },
  );
  if (!payment)
    throw Object.assign(new Error('Payment already reversed or unavailable'), {
      statusCode: 409,
      code: 'PAYMENT_REVERSAL_CONFLICT',
    });
  return payment;
}
