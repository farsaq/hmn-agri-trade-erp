import { connectDB, disconnectDB } from '../config/db.js';
import { Product, Customer, Supplier, Ledger } from '../models/index.js';
import { WarehouseStock } from '../models/operations.js';
const n = (v) => Number(v || 0);
await connectDB();
const issues = { productStock: [], customerBalances: [], supplierBalances: [] };
for (const p of await Product.find({ isDeleted: { $ne: true } }).lean()) {
  const rows = await WarehouseStock.find({ product: p._id }).lean();
  const actual = rows.reduce((s, r) => s + n(r.quantity), 0);
  if (Math.abs(actual - n(p.availableStock)) > 0.0001)
    issues.productStock.push({ id: p._id, stored: n(p.availableStock), actual });
}
for (const [Model, partyModel, key] of [
  [Customer, 'Customer', 'customerBalances'],
  [Supplier, 'Supplier', 'supplierBalances'],
]) {
  for (const party of await Model.find({ isDeleted: { $ne: true } }).lean()) {
    const rows = await Ledger.find({ party: party._id, partyModel }).lean();
    const actual = rows.reduce((s, r) => s + n(r.debit) - n(r.credit), 0);
    if (Math.abs(actual - n(party.currentBalance)) > 0.01)
      issues[key].push({ id: party._id, stored: n(party.currentBalance), actual });
  }
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), issues }, null, 2));
await disconnectDB();
