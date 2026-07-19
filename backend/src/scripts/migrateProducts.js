import { connectDB, disconnectDB } from '../config/db.js';
import { Product, Counter } from '../models/index.js';
import { normalizeProductName, normalizeSku, normalizeBarcode } from '../validators/product.js';
await connectDB();
const products = await Product.find().sort({ _id: 1 });
let updated = 0;
const conflicts = [];
for (const p of products) {
  try {
    if (!p.productCode) {
      const c = await Counter.findByIdAndUpdate(
        'productCode',
        { $inc: { seq: 1 } },
        { $setOnInsert: { seq: 0 }, new: true, upsert: true },
      );
      p.productCode = `PRD-${String(c.seq).padStart(6, '0')}`;
    }
    p.normalizedName = normalizeProductName(p.name);
    p.normalizedSku = normalizeSku(p.sku || p.productCode);
    p.normalizedBarcode = normalizeBarcode(p.barcode);
    p.baseUnit = p.baseUnit || p.unit || 'kg';
    p.purchaseUnit = p.purchaseUnit || p.baseUnit;
    p.saleUnit = p.saleUnit || p.baseUnit;
    p.unit = p.baseUnit;
    p.unitConversions = p.unitConversions?.length
      ? p.unitConversions
      : [{ name: p.baseUnit, symbol: p.baseUnit, ratioToBase: 1, precision: 3 }];
    p.isDeleted = Boolean(p.isDeleted);
    p.openingStock = Math.max(0, Number(p.openingStock || 0));
    await p.save();
    updated++;
  } catch (e) {
    conflicts.push({ id: String(p._id), name: p.name, error: e.message });
  }
}
console.log(JSON.stringify({ updated, total: products.length, conflicts }, null, 2));
await disconnectDB();
