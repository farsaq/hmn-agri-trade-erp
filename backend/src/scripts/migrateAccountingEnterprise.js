import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import {
  FiscalYear,
  AccountingPeriod,
  Account,
  CostCenter,
  Department,
  Project,
  Branch,
} from '../models/accounting.js';
await connectDB();
const now = new Date();
let fy = await FiscalYear.findOne({ startDate: { $lte: now }, endDate: { $gte: now } });
if (!fy) {
  const start = new Date(now.getFullYear(), 0, 1),
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  fy = await FiscalYear.create({
    name: String(now.getFullYear()),
    startDate: start,
    endDate: end,
    status: 'open',
    baseCurrency: 'PKR',
  });
  const periods = [];
  for (let m = 0; m < 12; m++) {
    const s = new Date(now.getFullYear(), m, 1),
      e = new Date(now.getFullYear(), m + 1, 0, 23, 59, 59, 999);
    periods.push({
      fiscalYear: fy._id,
      name: s.toLocaleString('en', { month: 'long', year: 'numeric' }),
      startDate: s,
      endDate: e,
      status: 'open',
    });
  }
  await AccountingPeriod.insertMany(periods);
}
for (const [M, code, name] of [
  [CostCenter, 'CC-GEN', 'General'],
  [Department, 'DEP-GEN', 'General'],
  [Project, 'PRJ-GEN', 'General'],
  [Branch, 'BR-HQ', 'Head Office'],
])
  await M.updateOne({ code }, { $setOnInsert: { code, name, active: true } }, { upsert: true });
const owner = await Account.findOne({ systemKey: 'owner-equity' });
if (owner) await Account.updateOne({ _id: owner._id }, { $set: { allowManualPosting: true, isControlAccount: false } });
console.log(
  JSON.stringify(
    { fiscalYear: fy.name, periods: await AccountingPeriod.countDocuments({ fiscalYear: fy._id }), dimensions: 4 },
    null,
    2,
  ),
);
await mongoose.disconnect();
