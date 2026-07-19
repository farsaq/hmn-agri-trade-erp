import 'dotenv/config';
import { connectDB } from '../config/db.js';
import { Warehouse, Unit } from '../models/enterprise.js';
import { Counter } from '../models/index.js';
import { normalizeName, normalizeSymbol } from '../validators/warehouseUnit.js';
import { seedDefaultUnits } from '../services/warehouseUnitService.js';
await connectDB();
const conflicts = [];
let updated = 0;
const warehouses = await Warehouse.find().sort({ _id: 1 });
let seq = 0;
for (const w of warehouses) {
  seq++;
  const normalizedName = normalizeName(w.name),
    code = w.code || `WH-${String(seq).padStart(3, '0')}`,
    warehouseCode = w.warehouseCode || `WH-${String(seq).padStart(6, '0')}`;
  const conflict = await Warehouse.findOne({
    _id: { $ne: w._id },
    $or: [{ normalizedName }, { code }, { warehouseCode }],
  });
  if (conflict) {
    conflicts.push({ id: String(w._id), name: w.name, reason: 'duplicate name/code' });
    continue;
  }
  await Warehouse.updateOne(
    { _id: w._id },
    {
      $set: {
        normalizedName,
        code,
        warehouseCode,
        type: w.type || 'branch',
        managerName: w.managerName || w.manager || '',
        isDeleted: Boolean(w.isDeleted),
        assignedUsers: w.assignedUsers || [],
      },
    },
  );
  updated++;
}
await Counter.findByIdAndUpdate('warehouseCode', { $max: { seq } }, { upsert: true });
const seeded = await seedDefaultUnits();
const units = await Unit.find();
for (const u of units)
  await Unit.updateOne(
    { _id: u._id },
    { $set: { normalizedName: normalizeName(u.name), normalizedSymbol: normalizeSymbol(u.symbol) } },
  );
console.log(
  JSON.stringify(
    {
      warehouses: { updated, total: warehouses.length, conflicts },
      units: { seeded: seeded.length, total: await Unit.countDocuments() },
    },
    null,
    2,
  ),
);
process.exit(conflicts.length ? 2 : 0);
