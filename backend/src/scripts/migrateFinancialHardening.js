import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Sale, Purchase, Expense } from '../models/index.js';
import { Payment } from '../models/transactions.js';
import { CashAccount } from '../models/financial.js';

await connectDB();
const result = { sales: 0, purchases: 0, payments: 0, expenses: 0, accounts: 0 };
for await (const sale of Sale.find({})) {
  let changed = false;
  if (!sale.deliveryStatus) {
    sale.deliveryStatus =
      sale.status === 'draft' ? 'unfulfilled' : sale.status === 'cancelled' ? 'cancelled' : 'fulfilled';
    changed = true;
  }
  if (!Array.isArray(sale.stateHistory) || sale.stateHistory.length === 0) {
    sale.stateHistory = [{ state: sale.status, at: sale.createdAt || new Date() }];
    changed = true;
  }
  for (const item of sale.items || [])
    if (!item.baseQuantity && item.quantity) {
      item.baseQuantity = item.quantity;
      changed = true;
    }
  if (changed) {
    await sale.save({ validateBeforeSave: false });
    result.sales++;
  }
}
for await (const purchase of Purchase.find({})) {
  let changed = false;
  if (!Array.isArray(purchase.stateHistory) || purchase.stateHistory.length === 0) {
    purchase.stateHistory = [{ state: purchase.status, at: purchase.createdAt || new Date() }];
    changed = true;
  }
  for (const item of purchase.items || [])
    if (!item.baseQuantity && item.quantity) {
      item.baseQuantity = item.quantity;
      changed = true;
    }
  if (changed) {
    await purchase.save({ validateBeforeSave: false });
    result.purchases++;
  }
}
for await (const payment of Payment.find({})) {
  if (!Array.isArray(payment.statusHistory) || payment.statusHistory.length === 0) {
    payment.statusHistory = [{ status: payment.status, at: payment.createdAt || new Date(), by: payment.createdBy }];
    await payment.save({ validateBeforeSave: false });
    result.payments++;
  }
}
for await (const expense of Expense.find({})) {
  let changed = false;
  if (expense.totalAmount == null) {
    expense.totalAmount = Number(expense.amount || 0) + Number(expense.taxAmount || 0);
    changed = true;
  }
  if (!Array.isArray(expense.approvalHistory)) {
    expense.approvalHistory = [];
    changed = true;
  }
  if (changed) {
    await expense.save({ validateBeforeSave: false });
    result.expenses++;
  }
}
for (const account of [
  { accountCode: 'CASH-MAIN', name: 'Main Cash', type: 'cash' },
  { accountCode: 'BANK-MAIN', name: 'Main Bank', type: 'bank' },
]) {
  const r = await CashAccount.updateOne(
    { accountCode: account.accountCode },
    { $setOnInsert: { ...account, currency: 'PKR', balance: 0, active: true } },
    { upsert: true },
  );
  if (r.upsertedCount) result.accounts++;
}
console.log(JSON.stringify(result, null, 2));
await mongoose.disconnect();
