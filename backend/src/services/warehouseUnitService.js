import mongoose from 'mongoose';
import { Counter, Product, Sale, Purchase, AuditLog } from '../models/index.js';
import { Warehouse, InventoryMovement, Unit, UnitConversionAudit } from '../models/enterprise.js';
import { isGlobalUser } from '../middleware/warehouseAccess.js';
import { aggregateLowStockRows } from './warehouseReportUtils.js';
import { WarehouseStock, ProductBatch, StockReconciliation, StockRequest } from '../models/operations.js';
import {
  parseWarehouse,
  parseUnit,
  WAREHOUSE_SORTS,
  UNIT_SORTS,
  normalizeSymbol,
} from '../validators/warehouseUnit.js';
const err = (message, statusCode, code, details) => Object.assign(new Error(message), { statusCode, code, details });
async function nextCode(key, prefix, session) {
  const c = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { $setOnInsert: { seq: 0 }, new: true, upsert: true, session },
  );
  return `${prefix}-${String(c.seq).padStart(6, '0')}`;
}
const paging = (q) => ({
  page: Math.max(1, Number(q.page) || 1),
  limit: Math.min(100, Math.max(1, Number(q.limit) || 20)),
});
export async function listWarehouses(q, deleted = false, user) {
  const { page, limit } = paging(q);
  const query = { isDeleted: deleted };
  if (user && !isGlobalUser(user)) query['assignedUsers.user'] = user._id;
  if (q.q)
    query.$or = ['name', 'code', 'warehouseCode', 'city', 'district', 'managerName'].map((k) => ({
      [k]: { $regex: String(q.q), $options: 'i' },
    }));
  for (const k of ['type', 'city', 'district']) if (q[k]) query[k] = q[k];
  if (q.active !== undefined) query.active = String(q.active) === 'true';
  if (q.isDefault !== undefined) query.isDefault = String(q.isDefault) === 'true';
  const sortBy = WAREHOUSE_SORTS.has(q.sortBy) ? q.sortBy : 'createdAt',
    sortOrder = q.sortOrder === 'asc' ? 1 : -1;
  const [items, total] = await Promise.all([
    Warehouse.find(query)
      .populate('assignedUsers.user', 'name email role')
      .sort({ [sortBy]: sortOrder, _id: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit),
    Warehouse.countDocuments(query),
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
    sort: { field: sortBy, order: sortOrder === 1 ? 'asc' : 'desc' },
  };
}
export async function createWarehouse(input, user) {
  const data = parseWarehouse(input);
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      if (
        await Warehouse.exists({ $or: [{ code: data.code }, { normalizedName: data.normalizedName }] }).session(session)
      )
        throw err('Warehouse code or name already exists', 409, 'WAREHOUSE_DUPLICATE');
      if (data.isDefault)
        await Warehouse.updateMany({ isDefault: true, isDeleted: false }, { $set: { isDefault: false } }, { session });
      return (
        await Warehouse.create(
          [{ ...data, warehouseCode: await nextCode('warehouseCode', 'WH', session), createdBy: user?._id }],
          { session },
        )
      )[0];
    });
  } finally {
    await session.endSession();
  }
}
export async function updateWarehouse(id, input, user) {
  const data = parseWarehouse(input, { partial: true });
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const w = await Warehouse.findOne({ _id: id, isDeleted: false }).session(session);
      if (!w) throw err('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
      if (data.code || data.normalizedName) {
        const or = [];
        if (data.code) or.push({ code: data.code });
        if (data.normalizedName) or.push({ normalizedName: data.normalizedName });
        if (or.length && (await Warehouse.exists({ _id: { $ne: id }, $or: or }).session(session)))
          throw err('Warehouse code or name already exists', 409, 'WAREHOUSE_DUPLICATE');
      }
      if (data.isDefault)
        await Warehouse.updateMany(
          { _id: { $ne: id }, isDefault: true, isDeleted: false },
          { $set: { isDefault: false } },
          { session },
        );
      Object.assign(w, data, { updatedBy: user?._id });
      return w.save({ session });
    });
  } finally {
    await session.endSession();
  }
}
export async function warehouseDetail(id) {
  const w = await Warehouse.findById(id).populate('assignedUsers.user', 'name email role');
  if (!w) throw err('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  const [stocks, movements, reconciliations, requests, batches] = await Promise.all([
    WarehouseStock.find({ warehouse: id })
      .populate('product', 'name sku productCode minimumStock expiryDate')
      .populate('batch', 'batchNo expiryDate'),
    InventoryMovement.find({ $or: [{ warehouse: id }, { fromWarehouse: id }, { toWarehouse: id }] })
      .populate('product', 'name sku')
      .sort({ createdAt: -1 })
      .limit(300),
    StockReconciliation.find({ warehouse: id }).populate('product', 'name sku').sort({ createdAt: -1 }).limit(200),
    StockRequest.find({ warehouse: id }).populate('product', 'name sku').sort({ createdAt: -1 }).limit(200),
    ProductBatch.find({ _id: { $in: (await WarehouseStock.distinct('batch', { warehouse: id })).filter(Boolean) } })
      .populate('product', 'name sku')
      .sort({ expiryDate: 1 }),
  ]);
  const summary = {
    stockLines: stocks.length,
    totalQuantity: stocks.reduce((a, x) => a + Number(x.quantity || 0), 0),
    reservedQuantity: stocks.reduce((a, x) => a + Number(x.reserved || 0), 0),
    stockValue: stocks.reduce((a, x) => a + Number(x.quantity || 0) * Number(x.averageCost || 0), 0),
    utilizationPercent:
      w.capacity > 0 ? Math.min(100, (stocks.reduce((a, x) => a + Number(x.quantity || 0), 0) / w.capacity) * 100) : 0,
  };
  return { warehouse: w, stocks, movements, reconciliations, requests, batches, summary };
}
export async function deleteWarehouse(id, user) {
  const [stocks, movements, batches, reconciliations, requests, sales, purchases] = await Promise.all([
    WarehouseStock.countDocuments({ warehouse: id, quantity: { $gt: 0 } }),
    InventoryMovement.countDocuments({ $or: [{ warehouse: id }, { fromWarehouse: id }, { toWarehouse: id }] }),
    ProductBatch.countDocuments({
      $or: [
        { warehouse: id },
        { _id: { $in: (await WarehouseStock.distinct('batch', { warehouse: id })).filter(Boolean) } },
      ],
    }),
    StockReconciliation.countDocuments({ warehouse: id }),
    StockRequest.countDocuments({ warehouse: id }),
    Sale.countDocuments({ warehouse: id }),
    Purchase.countDocuments({ warehouse: id }),
  ]);
  if (stocks || movements || batches || reconciliations || requests || sales || purchases)
    throw err('Warehouse has stock or transaction history and cannot be deleted', 409, 'WAREHOUSE_DELETE_BLOCKED', {
      stocks,
      movements,
      batches,
      reconciliations,
      requests,
      sales,
      purchases,
    });
  const w = await Warehouse.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: user?._id, active: false } },
    { new: true },
  );
  if (!w) throw err('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  return w;
}
export async function restoreWarehouse(id, user) {
  const w = await Warehouse.findOneAndUpdate(
    { _id: id, isDeleted: true },
    { $set: { isDeleted: false, active: true, updatedBy: user?._id }, $unset: { deletedAt: 1, deletedBy: 1 } },
    { new: true },
  );
  if (!w) throw err('Deleted warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  return w;
}
export async function warehouseTimeline(id) {
  const d = await warehouseDetail(id);
  const [audits, sales, purchases] = await Promise.all([
    AuditLog.find({ entity: 'Warehouse', entityId: id })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(200),
    Sale.find({ warehouse: id })
      .select('invoiceNo total status createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(100),
    Purchase.find({ warehouse: id })
      .select('invoiceNo total status createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(100),
  ]);
  const events = [
    ...d.movements.map((x) => ({ type: 'inventory-movement', date: x.createdAt, data: x })),
    ...d.reconciliations.map((x) => ({ type: 'reconciliation', date: x.createdAt, data: x })),
    ...d.requests.map((x) => ({ type: 'stock-request', date: x.createdAt, data: x })),
    ...audits.map((x) => ({ type: 'warehouse-audit', date: x.createdAt, data: x })),
    ...sales.map((x) => ({ type: 'sale', date: x.createdAt, data: x })),
    ...purchases.map((x) => ({ type: 'purchase', date: x.createdAt, data: x })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  return { warehouse: d.warehouse, events };
}
export async function warehouseReport(id, kind = 'summary', options = {}) {
  const d = await warehouseDetail(id);
  if (kind === 'low-stock') {
    d.rows = aggregateLowStockRows(d.stocks);
  } else if (kind === 'expiry') {
    const days = Math.min(3650, Math.max(0, Number(options.days) || 30));
    const status = String(options.status || 'expiring');
    const now = new Date(),
      cut = new Date(Date.now() + days * 86400000);
    d.rows = d.batches.filter((x) => {
      if (!x.expiryDate) return false;
      const expiry = new Date(x.expiryDate);
      if (status === 'expired') return expiry < now;
      if (status === 'all') return expiry <= cut;
      return expiry >= now && expiry <= cut;
    });
    d.report = { days, status };
  } else d.rows = d.stocks;
  return d;
}
export async function listUnits(q, deleted = false) {
  const { page, limit } = paging(q);
  const query = { isDeleted: deleted };
  if (q.q)
    query.$or = [
      { name: { $regex: String(q.q), $options: 'i' } },
      { symbol: { $regex: String(q.q), $options: 'i' } },
      { unitCode: { $regex: String(q.q), $options: 'i' } },
    ];
  if (q.category) query.category = q.category;
  if (q.active !== undefined) query.active = String(q.active) === 'true';
  const sortBy = UNIT_SORTS.has(q.sortBy) ? q.sortBy : 'createdAt',
    sortOrder = q.sortOrder === 'asc' ? 1 : -1;
  const [items, total] = await Promise.all([
    Unit.find(query)
      .populate('baseUnit', 'name symbol unitCode')
      .sort({ [sortBy]: sortOrder, _id: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit),
    Unit.countDocuments(query),
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
    sort: { field: sortBy, order: sortOrder === 1 ? 'asc' : 'desc' },
  };
}
export async function unitDetail(id) {
  const u = await Unit.findById(id).populate('baseUnit', 'name symbol unitCode category isBase active');
  if (!u) throw err('Unit not found', 404, 'UNIT_NOT_FOUND');
  const [derived, conversions] = await Promise.all([
    Unit.find({ baseUnit: id, isDeleted: false }).select('unitCode name symbol ratioToBase active'),
    UnitConversionAudit.find({ $or: [{ fromUnit: id }, { toUnit: id }] })
      .sort({ createdAt: -1 })
      .limit(100),
  ]);
  return { unit: u, derivedUnits: derived, recentConversions: conversions };
}
export async function createUnit(input, user) {
  const data = parseUnit(input);
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      if (
        await Unit.exists({
          $or: [{ normalizedName: data.normalizedName }, { normalizedSymbol: data.normalizedSymbol }],
        }).session(session)
      )
        throw err('Unit name or symbol already exists', 409, 'UNIT_DUPLICATE');
      if (data.baseUnit) {
        const base = await Unit.findOne({ _id: data.baseUnit, isDeleted: false, active: true }).session(session);
        if (!base || !base.isBase) throw err('Selected base unit is invalid', 422, 'UNIT_BASE_INVALID');
        if (base.category !== data.category)
          throw err('Derived and base unit categories must match', 422, 'UNIT_CATEGORY_MISMATCH');
      }
      return (
        await Unit.create([{ ...data, unitCode: await nextCode('unitCode', 'UNIT', session), createdBy: user?._id }], {
          session,
        })
      )[0];
    });
  } finally {
    await session.endSession();
  }
}
export async function updateUnit(id, input, user) {
  const data = parseUnit(input, { partial: true });
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const u = await Unit.findOne({ _id: id, isDeleted: false }).session(session);
      if (!u) throw err('Unit not found', 404, 'UNIT_NOT_FOUND');
      const effective = {
        category: data.category ?? u.category,
        isBase: data.isBase ?? u.isBase,
        baseUnit: data.baseUnit === undefined ? u.baseUnit : data.baseUnit,
        ratioToBase: data.ratioToBase ?? u.ratioToBase,
      };
      if (effective.baseUnit && String(effective.baseUnit) === String(id))
        throw err('Unit cannot reference itself', 422, 'UNIT_CIRCULAR_REFERENCE');
      if (data.normalizedName || data.normalizedSymbol) {
        const or = [];
        if (data.normalizedName) or.push({ normalizedName: data.normalizedName });
        if (data.normalizedSymbol) or.push({ normalizedSymbol: data.normalizedSymbol });
        if (or.length && (await Unit.exists({ _id: { $ne: id }, $or: or }).session(session)))
          throw err('Unit name or symbol already exists', 409, 'UNIT_DUPLICATE');
      }
      const children = await Unit.countDocuments({ baseUnit: id, isDeleted: false }).session(session);
      if (u.isBase && effective.isBase === false && children)
        throw err('Base unit has dependent derived units', 409, 'UNIT_HAS_DEPENDENTS', { derivedUnits: children });
      if (effective.isBase) {
        if (effective.baseUnit) throw err('Base unit cannot reference another unit', 422, 'UNIT_BASE_INVALID');
        if (Number(effective.ratioToBase) !== 1) throw err('Base unit ratio must equal 1', 422, 'UNIT_RATIO_INVALID');
        data.baseUnit = null;
        data.ratioToBase = 1;
      } else {
        if (!effective.baseUnit) throw err('Derived unit requires a base unit', 422, 'UNIT_BASE_REQUIRED');
        const base = await Unit.findOne({ _id: effective.baseUnit, isDeleted: false, active: true }).session(session);
        if (!base || !base.isBase) throw err('Selected base unit is invalid or inactive', 422, 'UNIT_BASE_INVALID');
        if (base.category !== effective.category)
          throw err('Derived and base unit categories must match', 422, 'UNIT_CATEGORY_MISMATCH');
      }
      Object.assign(u, data, { updatedBy: user?._id });
      return u.save({ session });
    });
  } finally {
    await session.endSession();
  }
}
export async function deleteUnit(id, user) {
  const u = await Unit.findOne({ _id: id, isDeleted: false });
  if (!u) throw err('Unit not found', 404, 'UNIT_NOT_FOUND');
  const linked = await Product.countDocuments({
    $or: [
      { baseUnit: u.symbol },
      { purchaseUnit: u.symbol },
      { saleUnit: u.symbol },
      { 'unitConversions.symbol': u.symbol },
    ],
  });
  const children = await Unit.countDocuments({ baseUnit: id, isDeleted: false });
  if (linked || children || u.system)
    throw err('Unit is linked to products, derived units, or is a system unit', 409, 'UNIT_DELETE_BLOCKED', {
      linkedProducts: linked,
      derivedUnits: children,
      system: u.system,
    });
  u.isDeleted = true;
  u.deletedAt = new Date();
  u.deletedBy = user?._id;
  u.active = false;
  return u.save();
}
export async function restoreUnit(id, user) {
  const u = await Unit.findOne({ _id: id, isDeleted: true });
  if (!u) throw err('Deleted unit not found', 404, 'UNIT_NOT_FOUND');
  u.isDeleted = false;
  u.active = true;
  u.deletedAt = undefined;
  u.deletedBy = undefined;
  u.updatedBy = user?._id;
  return u.save();
}
async function ratio(unit, product) {
  if (product) {
    const p = await Product.findById(product);
    if (!p) throw err('Product not found', 404, 'PRODUCT_NOT_FOUND');
    const list = [{ symbol: p.baseUnit, ratioToBase: 1 }, ...(p.unitConversions || [])];
    const hit = list.find((x) => normalizeSymbol(x.symbol) === unit.normalizedSymbol);
    if (hit) return Number(hit.ratioToBase);
  }
  return unit.isBase ? 1 : Number(unit.ratioToBase);
}
export async function convertUnits({ fromUnit, toUnit, quantity, product }, user) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q < 0) throw err('Quantity must be a non-negative number', 422, 'UNIT_QUANTITY_INVALID');
  const [from, to] = await Promise.all([
    Unit.findOne({ _id: fromUnit, isDeleted: false, active: true }),
    Unit.findOne({ _id: toUnit, isDeleted: false, active: true }),
  ]);
  if (!from || !to) throw err('Unit not found or inactive', 404, 'UNIT_NOT_FOUND');
  if (from.category !== to.category) throw err('Units must belong to the same category', 422, 'UNIT_CATEGORY_MISMATCH');
  const fr = await ratio(from, product),
    tr = await ratio(to, product);
  const output = Number(((q * fr) / tr).toFixed(to.decimalPrecision));
  await UnitConversionAudit.create({
    fromUnit: from._id,
    toUnit: to._id,
    product: product || undefined,
    inputQuantity: q,
    outputQuantity: output,
    fromRatio: fr,
    toRatio: tr,
    createdBy: user?._id,
  });
  return {
    input: { quantity: q, unit: from },
    output: { quantity: output, unit: to },
    baseQuantity: q * fr,
    productOverride: Boolean(product),
  };
}
export async function seedDefaultUnits(user) {
  const defs = [
    ['Kilogram', 'kg', 'weight', true, null, 1, 3],
    ['Gram', 'g', 'weight', false, 'kg', 0.001, 3],
    ['Maund', 'maund', 'weight', false, 'kg', 40, 3],
    ['Metric Ton', 'ton', 'weight', false, 'kg', 1000, 3],
    ['Piece', 'pc', 'quantity', true, null, 1, 0],
    ['Bag', 'bag', 'packaging', true, null, 1, 2],
    ['Carton', 'carton', 'packaging', true, null, 1, 0],
    ['Litre', 'L', 'volume', true, null, 1, 3],
    ['Metre', 'm', 'length', true, null, 1, 3],
  ];
  const created = [];
  for (const [name, symbol, category, isBase, baseSymbol, ratioToBase, decimalPrecision] of defs) {
    if (await Unit.exists({ normalizedSymbol: normalizeSymbol(symbol) })) continue;
    let baseUnit = null;
    if (baseSymbol) baseUnit = (await Unit.findOne({ normalizedSymbol: normalizeSymbol(baseSymbol) }))?._id;
    created.push(
      await createUnit({ name, symbol, category, isBase, baseUnit, ratioToBase, decimalPrecision, system: true }, user),
    );
  }
  return created;
}
export async function unitAudit(q) {
  const page = Math.max(1, Number(q.page) || 1),
    limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const query = {};
  if (q.fromUnit) query.fromUnit = q.fromUnit;
  if (q.toUnit) query.toUnit = q.toUnit;
  if (q.product) query.product = q.product;
  const [items, total] = await Promise.all([
    UnitConversionAudit.find(query)
      .populate('fromUnit toUnit', 'name symbol')
      .populate('product', 'name sku')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    UnitConversionAudit.countDocuments(query),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
export async function audit(req, action, entity, id, metadata) {
  return AuditLog.create({
    user: req.user?._id,
    action,
    entity,
    entityId: id,
    metadata,
    description: `${action} ${entity}`,
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
  });
}
