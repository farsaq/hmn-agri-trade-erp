import { connectDB } from '../config/db.js';
import { Sale, Purchase, Expense, Counter } from '../models/index.js';
await connectDB();
let sales = 0,
  purchases = 0,
  expenses = 0;
for (const s of await Sale.find({ $or: [{ invoiceNo: { $exists: false } }, { invoiceNo: null }] }).sort({
  createdAt: 1,
})) {
  const c = await Counter.findOneAndUpdate(
    { _id: 'sale-invoice' },
    { $inc: { seq: 1 } },
    { $setOnInsert: { seq: 0 }, upsert: true, new: true },
  );
  s.invoiceNo = `INV-${new Date().getFullYear()}-${String(c.seq).padStart(6, '0')}`;
  await s.save();
  sales++;
}
for (const p of await Purchase.find({ $or: [{ purchaseNo: { $exists: false } }, { purchaseNo: null }] }).sort({
  createdAt: 1,
})) {
  const c = await Counter.findOneAndUpdate(
    { _id: 'purchase' },
    { $inc: { seq: 1 } },
    { $setOnInsert: { seq: 0 }, upsert: true, new: true },
  );
  p.purchaseNo = `PUR-${new Date().getFullYear()}-${String(c.seq).padStart(6, '0')}`;
  await p.save();
  purchases++;
}
for (const e of await Expense.find({ $or: [{ expenseNo: { $exists: false } }, { expenseNo: null }] }).sort({
  createdAt: 1,
})) {
  const c = await Counter.findOneAndUpdate(
    { _id: 'expense' },
    { $inc: { seq: 1 } },
    { $setOnInsert: { seq: 0 }, upsert: true, new: true },
  );
  e.expenseNo = `EXP-${new Date().getFullYear()}-${String(c.seq).padStart(6, '0')}`;
  e.totalAmount = Number(e.amount || 0) + Number(e.taxAmount || 0);
  await e.save();
  expenses++;
}
console.log(JSON.stringify({ sales, purchases, expenses }, null, 2));
process.exit(0);
