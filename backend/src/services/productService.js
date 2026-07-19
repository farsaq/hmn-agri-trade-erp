import mongoose from 'mongoose';
import { Product, Counter, Sale, Purchase } from '../models/index.js';
import { ProductBatch, WarehouseStock, SaleReturn } from '../models/operations.js';
import { InventoryMovement } from '../models/enterprise.js';
import {
  validateProduct,
  normalizeProductIdentity,
  buildProductQuery,
  PRODUCT_SORT_FIELDS,
} from '../validators/product.js';
import { adjustStock, recalculateProductStock } from './inventoryService.js';
async function code(session) {
  const c = await Counter.findByIdAndUpdate(
    'productCode',
    { $inc: { seq: 1 } },
    { $setOnInsert: { seq: 0 }, new: true, upsert: true, session },
  );
  return `PRD-${String(c.seq).padStart(6, '0')}`;
}
export async function listProducts(q) {
  const page = Math.max(1, Number(q.page) || 1),
    limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const query = buildProductQuery(q);
  if (q.warehouse) {
    const ids = await WarehouseStock.distinct('product', { warehouse: q.warehouse });
    query._id = { $in: ids };
  }
  const sortField = PRODUCT_SORT_FIELDS.has(q.sortBy) ? q.sortBy : 'createdAt',
    sortDir = q.sortOrder === 'asc' ? 1 : -1;
  const [items, total] = await Promise.all([
    Product.find(query)
      .populate('supplier', 'name company')
      .populate('warehouse', 'name code')
      .sort({ [sortField]: sortDir, _id: sortDir })
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(query),
  ]);
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1,
    },
    sort: { field: sortField, order: sortDir === 1 ? 'asc' : 'desc' },
  };
}
export async function createProduct(input, user) {
  const data = normalizeProductIdentity(validateProduct(input));
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const existing = await Product.findOne({
        $or: [
          { normalizedSku: data.normalizedSku },
          ...(data.normalizedBarcode ? [{ normalizedBarcode: data.normalizedBarcode }] : []),
        ],
      }).session(session);
      if (existing)
        throw Object.assign(new Error('SKU or barcode already exists'), {
          statusCode: 409,
          code: 'PRODUCT_DUPLICATE_IDENTITY',
        });
      const product = (
        await Product.create([{ ...data, productCode: await code(session), availableStock: 0, createdBy: user?._id }], {
          session,
        })
      )[0];
      if (Number(data.openingStock) > 0) {
        if (!data.warehouse)
          throw Object.assign(new Error('Warehouse is required for opening stock'), {
            statusCode: 422,
            code: 'PRODUCT_OPENING_WAREHOUSE_REQUIRED',
          });
        await adjustStock(
          {
            productId: product._id,
            warehouseId: data.warehouse,
            quantity: Number(data.openingStock),
            type: 'stock-in',
            reason: 'Opening stock',
            reference: 'product-opening',
            createdBy: user?._id,
            unitCost: data.purchasePrice,
          },
          { session },
        );
      }
      return Product.findById(product._id).session(session);
    });
  } finally {
    await session.endSession();
  }
}
export async function updateProduct(id, input, user) {
  const data = normalizeProductIdentity(validateProduct(input, { partial: true }));
  delete data.openingStock;
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: id, isDeleted: false }).session(session);
      if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
      if (data.normalizedSku || data.normalizedBarcode) {
        const clauses = [];
        if (data.normalizedSku) clauses.push({ normalizedSku: data.normalizedSku });
        if (data.normalizedBarcode) clauses.push({ normalizedBarcode: data.normalizedBarcode });
        const duplicate = await Product.findOne({ _id: { $ne: id }, $or: clauses }).session(session);
        if (duplicate)
          throw Object.assign(new Error('SKU or barcode already exists'), {
            statusCode: 409,
            code: 'PRODUCT_DUPLICATE_IDENTITY',
          });
      }
      const priceChanged = ['purchasePrice', 'salePrice', 'wholesalePrice', 'retailPrice', 'minimumSalePrice'].some(
        (k) => data[k] !== undefined && Number(data[k]) !== Number(product[k]),
      );
      if (priceChanged)
        product.priceHistory.push({
          effectiveFrom: data.priceEffectiveFrom || new Date(),
          purchasePrice: data.purchasePrice ?? product.purchasePrice,
          salePrice: data.salePrice ?? product.salePrice,
          wholesalePrice: data.wholesalePrice ?? product.wholesalePrice,
          retailPrice: data.retailPrice ?? product.retailPrice,
          minimumSalePrice: data.minimumSalePrice ?? product.minimumSalePrice,
          changedBy: user?._id,
          reason: input.priceChangeReason || 'Product update',
        });
      Object.assign(product, data, { updatedBy: user?._id });
      await product.save({ session });
      return product;
    });
  } finally {
    await session.endSession();
  }
}
export async function softDeleteProduct(id, user) {
  const [sales, purchases, batches, stocks, movements] = await Promise.all([
    Sale.countDocuments({ 'items.product': id }),
    Purchase.countDocuments({ 'items.product': id }),
    ProductBatch.countDocuments({ product: id }),
    WarehouseStock.countDocuments({ product: id, quantity: { $gt: 0 } }),
    InventoryMovement.countDocuments({ product: id }),
  ]);
  if (sales || purchases || batches || stocks || movements)
    throw Object.assign(new Error('Product has inventory or transaction history and cannot be deleted'), {
      statusCode: 409,
      code: 'PRODUCT_DELETE_BLOCKED',
      details: { sales, purchases, batches, stocks, movements },
    });
  const p = await Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: user?._id, active: false } },
    { new: true },
  );
  if (!p) throw Object.assign(new Error('Product not found'), { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  return p;
}
export async function restoreProduct(id, user) {
  const p = await Product.findOneAndUpdate(
    { _id: id, isDeleted: true },
    { $set: { isDeleted: false, active: true, updatedBy: user?._id }, $unset: { deletedAt: 1, deletedBy: 1 } },
    { new: true },
  );
  if (!p) throw Object.assign(new Error('Deleted product not found'), { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  return p;
}
export async function detail(id) {
  const product = await Product.findById(id).populate('supplier', 'name company').populate('warehouse', 'name code');
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  const [stocks, batches, purchases, sales, returns, movements] = await Promise.all([
    WarehouseStock.find({ product: id }).populate('warehouse', 'name code').populate('batch', 'batchNo expiryDate'),
    ProductBatch.find({ product: id }).sort({ expiryDate: 1 }),
    Purchase.find({ 'items.product': id }).sort({ date: -1 }).limit(100),
    Sale.find({ 'items.product': id }).sort({ date: -1 }).limit(100),
    SaleReturn.find({ 'items.product': id }).sort({ createdAt: -1 }).limit(100),
    InventoryMovement.find({ product: id }).sort({ createdAt: -1 }).limit(250),
  ]);
  const purchased = purchases.reduce(
      (a, x) =>
        a + x.items.filter((i) => String(i.product) === String(id)).reduce((b, i) => b + Number(i.quantity || 0), 0),
      0,
    ),
    sold = sales.reduce(
      (a, x) =>
        a + x.items.filter((i) => String(i.product) === String(id)).reduce((b, i) => b + Number(i.quantity || 0), 0),
      0,
    );
  return {
    product,
    stocks,
    batches,
    purchases,
    sales,
    returns,
    movements,
    summary: {
      purchased,
      sold,
      revenue: sales.reduce(
        (a, x) =>
          a + x.items.filter((i) => String(i.product) === String(id)).reduce((b, i) => b + Number(i.amount || 0), 0),
        0,
      ),
      estimatedGrossProfit: sales.reduce(
        (a, x) =>
          a +
          x.items
            .filter((i) => String(i.product) === String(id))
            .reduce(
              (b, i) => b + (Number(i.rate || 0) - Number(product.purchasePrice || 0)) * Number(i.quantity || 0),
              0,
            ),
        0,
      ),
      warehouseValue: stocks.reduce((a, x) => a + Number(x.quantity || 0) * Number(x.averageCost || 0), 0),
    },
  };
}
export async function reconcileStock(id) {
  return recalculateProductStock(id);
}
