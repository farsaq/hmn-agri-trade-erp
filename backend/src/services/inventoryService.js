import mongoose from 'mongoose';
import { Product } from '../models/index.js';
import { WarehouseStock, ProductBatch } from '../models/operations.js';
import { InventoryMovement } from '../models/enterprise.js';
const n = (v) => Number(v || 0);
export async function recalculateProductStock(productId, { session } = {}) {
  const rows = await WarehouseStock.find({ product: productId })
    .session(session || null)
    .lean();
  const totals = rows.reduce(
    (a, r) => {
      a.physical += n(r.quantity);
      a.reserved += n(r.reserved);
      return a;
    },
    { physical: 0, reserved: 0 },
  );
  const product = await Product.findByIdAndUpdate(
    productId,
    { $set: { availableStock: Math.max(0, totals.physical - totals.reserved), reservedQuantity: totals.reserved } },
    { new: true, session },
  );
  return {
    product,
    physical: totals.physical,
    reserved: totals.reserved,
    available: Math.max(0, totals.physical - totals.reserved),
  };
}
export async function adjustStock(
  {
    productId,
    warehouseId,
    batchId,
    quantity,
    type = 'adjustment',
    reason,
    reference,
    createdBy,
    allowNegative = false,
    unitCost,
  },
  { session } = {},
) {
  const qty = n(quantity);
  if (!qty)
    throw Object.assign(new Error('Stock quantity is required'), { statusCode: 422, code: 'STOCK_QUANTITY_INVALID' });
  const filter = { product: productId, warehouse: warehouseId, batch: batchId || null };
  let row = await WarehouseStock.findOne(filter).session(session || null);
  if (!row) row = new WarehouseStock({ ...filter, quantity: 0, reserved: 0, averageCost: n(unitCost) });
  const next = n(row.quantity) + qty;
  if (next < 0 && !allowNegative)
    throw Object.assign(new Error('Insufficient warehouse stock'), {
      statusCode: 409,
      code: 'NEGATIVE_STOCK_PREVENTED',
      details: { current: n(row.quantity), requested: qty },
    });
  if (qty > 0 && unitCost != null) {
    const oldValue = n(row.quantity) * n(row.averageCost),
      newValue = qty * n(unitCost);
    row.averageCost = next > 0 ? (oldValue + newValue) / next : n(unitCost);
  }
  row.quantity = next;
  await row.save({ session });
  if (batchId) {
    const batch = await ProductBatch.findById(batchId).session(session || null);
    if (!batch || String(batch.product) !== String(productId))
      throw Object.assign(new Error('Invalid product batch'), { statusCode: 422, code: 'PRODUCT_BATCH_INVALID' });
    batch.quantity = Math.max(0, n(batch.quantity) + qty);
    batch.status =
      batch.quantity <= 0 ? 'depleted' : batch.expiryDate && batch.expiryDate < new Date() ? 'expired' : 'active';
    await batch.save({ session });
  }
  await InventoryMovement.create(
    [{ product: productId, warehouse: warehouseId, type, quantity: qty, reason, reference, createdBy }],
    { session },
  );
  return recalculateProductStock(productId, { session });
}
export async function withInventoryTransaction(work) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
