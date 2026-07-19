import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Counter, Supplier } from '../models/index.js';
import { identity } from '../services/supplierService.js';
await connectDB();
const suppliers = await Supplier.find().sort({ createdAt: 1 });
let updated = 0,
  conflicts = [];
let seq = await Counter.findById('supplierCode');
let n = seq?.seq || 0;
for (const s of suppliers) {
  try {
    if (!/^SUP-\d{6}$/.test(s.supplierCode || '')) {
      n++;
      s.supplierCode = `SUP-${String(n).padStart(6, '0')}`;
    }
    Object.assign(s, identity(s));
    if (s.isDeleted === undefined) s.isDeleted = false;
    if (!s.registrationDate) s.registrationDate = s.createdAt || new Date();
    await s.save();
    updated++;
  } catch (e) {
    conflicts.push({ id: String(s._id), name: s.name, error: e.message });
  }
}
await Counter.findByIdAndUpdate('supplierCode', { seq: n }, { upsert: true });
console.log(JSON.stringify({ updated, total: suppliers.length, conflicts }, null, 2));
await mongoose.disconnect();
