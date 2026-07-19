import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Counter, Customer } from '../models/index.js';
import { normalizeCnic, normalizeEmail, normalizePhone } from '../validators/customer.js';

await connectDB();
const customers = await Customer.find({}).sort({ createdAt: 1, _id: 1 });
const usedPhone = new Set(),
  usedCnic = new Set(),
  usedEmail = new Set();
let seq = 0,
  updated = 0;
const conflicts = [];
for (const customer of customers) {
  seq += 1;
  const set = {};
  const unset = {};
  if (!customer.customerCode) set.customerCode = `CUS-${String(seq).padStart(6, '0')}`;
  const phone = normalizePhone(customer.phone);
  if (phone) {
    if (usedPhone.has(phone)) {
      conflicts.push({ id: String(customer._id), type: 'phone', value: phone });
      set.normalizedPhone = `DUP-${customer._id}-${phone}`;
    } else {
      set.normalizedPhone = phone;
      usedPhone.add(phone);
    }
  }
  const cnic = customer.cnic ? normalizeCnic(customer.cnic) : undefined;
  if (cnic) {
    if (usedCnic.has(cnic)) {
      conflicts.push({ id: String(customer._id), type: 'cnic', value: cnic });
      unset.normalizedCnic = 1;
    } else {
      set.normalizedCnic = cnic;
      usedCnic.add(cnic);
    }
  }
  const email = customer.email ? normalizeEmail(customer.email) : undefined;
  if (email) {
    if (usedEmail.has(email)) {
      conflicts.push({ id: String(customer._id), type: 'email', value: email });
      unset.normalizedEmail = 1;
    } else {
      set.normalizedEmail = email;
      usedEmail.add(email);
    }
  }
  if (customer.isDeleted === undefined) set.isDeleted = false;
  if (customer.registrationDate === undefined) set.registrationDate = customer.createdAt || new Date();
  if (customer.tags === undefined) set.tags = [];
  await Customer.updateOne(
    { _id: customer._id },
    { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
  );
  updated++;
}
await Counter.findByIdAndUpdate('customerCode', { $max: { seq } }, { upsert: true, new: true });
console.log(JSON.stringify({ updated, total: customers.length, conflicts }, null, 2));
await mongoose.disconnect();
