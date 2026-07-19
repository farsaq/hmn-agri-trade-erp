import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Account } from '../models/accounting.js';
const accounts = [
  ['1000', 'Assets', 'asset', null, 'assets'],
  ['1100', 'Cash', 'asset', '1000', 'cash'],
  ['1200', 'Bank', 'asset', '1000', 'bank'],
  ['1300', 'Accounts Receivable', 'asset', '1000', 'accounts-receivable'],
  ['1400', 'Inventory', 'asset', '1000', 'inventory'],
  ['2000', 'Liabilities', 'liability', null, 'liabilities'],
  ['2100', 'Accounts Payable', 'liability', '2000', 'accounts-payable'],
  ['2200', 'Tax Payable', 'liability', '2000', 'tax-payable'],
  ['3000', 'Equity', 'equity', null, 'equity'],
  ['3100', 'Owner Equity', 'equity', '3000', 'owner-equity'],
  ['3200', 'Retained Earnings', 'equity', '3000', 'retained-earnings'],
  ['4000', 'Income', 'income', null, 'income'],
  ['4100', 'Sales Revenue', 'income', '4000', 'sales-revenue'],
  ['4200', 'Other Income', 'income', '4000', 'other-income'],
  ['5000', 'Expenses', 'expense', null, 'expenses'],
  ['5100', 'Cost of Goods Sold', 'expense', '5000', 'cost-of-goods-sold'],
  ['5200', 'Operating Expenses', 'expense', '5000', 'operating-expenses'],
];
await connectDB();
const map = new Map();
for (const [code, name, type, parentCode, systemKey] of accounts) {
  const parent = parentCode ? map.get(parentCode) : null;
  const path = parent ? [...(parent.path || []), parent._id] : [];
  const doc = await Account.findOneAndUpdate(
    { code },
    {
      $setOnInsert: {
        code,
        name,
        normalizedName: name.toLowerCase(),
        type,
        parent: parent ? parent._id : null,
        path,
        level: parent ? parent.level + 1 : 0,
        normalBalance: ['asset', 'expense'].includes(type) ? 'debit' : 'credit',
        systemKey,
        currency: 'PKR',
        active: true,
        allowManualPosting: !['accounts-receivable', 'accounts-payable'].includes(systemKey),
        isControlAccount: ['accounts-receivable', 'accounts-payable', 'inventory'].includes(systemKey),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  map.set(code, doc);
}
console.log(
  JSON.stringify({ seeded: accounts.length, total: await Account.countDocuments({ isDeleted: false }) }, null, 2),
);
await mongoose.disconnect();
