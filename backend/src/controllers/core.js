import bcrypt from 'bcryptjs';
import {
  User,
  Customer,
  Supplier,
  Product,
  Purchase,
  Sale,
  Ledger,
  Expense,
  Lead,
  Setting,
  Notification,
  AuditLog,
} from '../models/index.js';
import { createNotification, writeAudit } from './governance.js';
const models = {
  customers: Customer,
  suppliers: Supplier,
  products: Product,
  purchases: Purchase,
  sales: Sale,
  expenses: Expense,
  leads: Lead,
  users: User,
};
export const list = (type) => async (req, res) => {
  const M = models[type];
  const q = req.query.q
    ? {
        $or: Object.keys(M.schema.paths)
          .filter((k) => ['String'].includes(M.schema.paths[k].instance))
          .slice(0, 5)
          .map((k) => ({ [k]: { $regex: req.query.q, $options: 'i' } })),
      }
    : {};
  res.json(
    await M.find(q)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 500)
      .populate(
        type === 'products' ? 'supplier' : type === 'purchases' ? 'supplier' : type === 'sales' ? 'customer' : '',
      ),
  );
};
export const create = (type) => async (req, res) => {
  const M = models[type];
  if (type === 'users') req.body.password = await bcrypt.hash(req.body.password, 12);
  if (type === 'suppliers') req.body.createdBy = req.user?._id;
  const doc = await M.create(req.body);
  await writeAudit({
    req,
    action: 'CREATE',
    entity: type,
    entityId: doc._id,
    description: `Created ${type}`,
    after: doc,
  });
  res.status(201).json(doc);
};
export const update = (type) => async (req, res) => {
  const M = models[type];
  const before = await M.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Not found' });
  if (type === 'users' && req.body.password) req.body.password = await bcrypt.hash(req.body.password, 12);
  if (type === 'suppliers') req.body.updatedBy = req.user?._id;
  const doc = await M.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await writeAudit({
    req,
    action: 'UPDATE',
    entity: type,
    entityId: doc._id,
    description: `Updated ${type}`,
    before,
    after: doc,
  });
  res.json(doc);
};
export const remove = (type) => async (req, res) => {
  const M = models[type];
  if (type === 'suppliers') {
    const [purchaseCount, ledgerCount] = await Promise.all([
      Purchase.countDocuments({ supplier: req.params.id }),
      Ledger.countDocuments({ party: req.params.id, partyType: 'supplier' }),
    ]);
    if (purchaseCount || ledgerCount)
      return res.status(409).json({
        message: 'Supplier has purchase or ledger history. Archive the supplier instead of deleting it.',
        purchaseCount,
        ledgerCount,
      });
  }
  const doc = await M.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Not found' });
  await writeAudit({
    req,
    action: 'DELETE',
    entity: type,
    entityId: doc._id,
    description: `Deleted ${type}`,
    before: doc,
  });
  res.json({ success: true });
};
export async function createPurchase(req, res) {
  const p = await Purchase.create(req.body);
  await createNotification({
    audienceRoles: ['admin', 'manager', 'accountant', 'warehouse'],
    type: 'purchase',
    severity: 'success',
    title: 'New purchase recorded',
    message: `Purchase ${p.purchaseNo || p._id} for PKR ${Number(p.total || 0).toLocaleString()}`,
    link: '/admin/purchases',
    sourceEntity: 'Purchase',
    sourceId: p._id,
  });
  for (const i of p.items) await Product.findByIdAndUpdate(i.product, { $inc: { availableStock: i.quantity } });
  if (p.remaining > 0) {
    const s = await Supplier.findByIdAndUpdate(p.supplier, { $inc: { currentBalance: p.remaining } }, { new: true });
    await Ledger.create({
      partyType: 'supplier',
      party: p.supplier,
      partyModel: 'Supplier',
      type: 'credit',
      amount: p.remaining,
      description: 'Purchase balance',
      referenceType: 'purchase',
      referenceId: p._id,
      balanceAfter: s.currentBalance,
    });
  }
  await writeAudit({
    req,
    action: 'PURCHASE_CREATED',
    entity: 'Purchase',
    entityId: p._id,
    description: `Created purchase ${p.purchaseNo || p._id}`,
    after: p,
  });
  res.status(201).json(p);
}
export async function createSale(req, res) {
  const s = await Sale.create(req.body);
  await createNotification({
    audienceRoles: ['admin', 'manager', 'accountant', 'sales'],
    type: 'sale',
    severity: 'success',
    title: 'New sale recorded',
    message: `Sale ${s.invoiceNo || s._id} for PKR ${Number(s.total || 0).toLocaleString()}`,
    link: '/admin/sales',
    sourceEntity: 'Sale',
    sourceId: s._id,
  });
  for (const i of s.items) {
    const product = await Product.findById(i.product);
    if (!product || product.availableStock < i.quantity)
      return res.status(400).json({ message: `Insufficient stock for ${i.name || 'product'}` });
    await Product.findByIdAndUpdate(i.product, { $inc: { availableStock: -i.quantity } });
  }
  if (s.remaining > 0) {
    const c = await Customer.findByIdAndUpdate(s.customer, { $inc: { currentBalance: s.remaining } }, { new: true });
    await Ledger.create({
      partyType: 'customer',
      party: s.customer,
      partyModel: 'Customer',
      type: 'credit',
      amount: s.remaining,
      description: 'Sale balance',
      referenceType: 'sale',
      referenceId: s._id,
      balanceAfter: c.currentBalance,
    });
  }
  await writeAudit({
    req,
    action: 'SALE_CREATED',
    entity: 'Sale',
    entityId: s._id,
    description: `Created sale ${s.invoiceNo || s._id}`,
    after: s,
  });
  res.status(201).json(s);
}
export async function addLedger(req, res) {
  const { partyType, party, type, amount } = req.body;
  const M = partyType === 'customer' ? Customer : Supplier;
  const delta = type === 'credit' ? amount : -amount;
  const doc = await M.findByIdAndUpdate(party, { $inc: { currentBalance: delta } }, { new: true });
  const entry = await Ledger.create({
    ...req.body,
    partyModel: partyType === 'customer' ? 'Customer' : 'Supplier',
    balanceAfter: doc.currentBalance,
  });
  res.status(201).json(entry);
}
export async function ledger(req, res) {
  res.json(await Ledger.find({ party: req.params.partyId }).sort({ date: -1, createdAt: -1 }));
}
export async function dashboard(req, res) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const [sales, purchases, expenses, customers, products, pending, lowStock, recentSales, recentPurchases] =
    await Promise.all([
      Sale.aggregate([
        { $match: { date: { $gte: start } } },
        { $group: { _id: null, total: { $sum: '$total' }, payments: { $sum: '$payment' } } },
      ]),
      Purchase.aggregate([
        { $match: { date: { $gte: start } } },
        { $group: { _id: null, total: { $sum: '$total' }, payments: { $sum: '$payment' } } },
      ]),
      Expense.aggregate([{ $match: { date: { $gte: start } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Customer.countDocuments(),
      Product.aggregate([
        {
          $group: {
            _id: null,
            stock: { $sum: '$availableStock' },
            value: { $sum: { $multiply: ['$availableStock', '$purchasePrice'] } },
          },
        },
      ]),
      Customer.aggregate([{ $group: { _id: null, total: { $sum: '$currentBalance' } } }]),
      Product.countDocuments({ $expr: { $lte: ['$availableStock', '$minimumStock'] } }),
      Sale.find({ date: { $gte: monthStart } })
        .sort({ date: -1 })
        .limit(5)
        .populate('customer', 'name'),
      Purchase.find({ date: { $gte: monthStart } })
        .sort({ date: -1 })
        .limit(5)
        .populate('supplier', 'name'),
    ]);
  const sv = sales[0] || {},
    pv = purchases[0] || {},
    ev = expenses[0] || {},
    st = products[0] || {},
    pd = pending[0] || {};
  res.json({
    todaySales: sv.total || 0,
    todayPurchases: pv.total || 0,
    profit: (sv.total || 0) - (pv.total || 0) - (ev.total || 0),
    stock: st.stock || 0,
    stockValue: st.value || 0,
    customers,
    pendingPayments: pd.total || 0,
    expenses: ev.total || 0,
    cashBalance: (sv.payments || 0) - (pv.payments || 0) - (ev.total || 0),
    lowStock,
    recentSales,
    recentPurchases,
  });
}
export async function dashboardAnalytics(req, res) {
  const days = Math.min(Math.max(Number(req.query.days || 30), 7), 365);
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  const group = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
  const [sales, purchases, expenses, topCustomers, topProducts, paymentStatus] = await Promise.all([
    Sale.aggregate([
      { $match: { date: { $gte: from } } },
      { $group: { _id: group, total: { $sum: '$total' }, payment: { $sum: '$payment' } } },
      { $sort: { _id: 1 } },
    ]),
    Purchase.aggregate([
      { $match: { date: { $gte: from } } },
      { $group: { _id: group, total: { $sum: '$total' } } },
      { $sort: { _id: 1 } },
    ]),
    Expense.aggregate([
      { $match: { date: { $gte: from } } },
      { $group: { _id: group, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: from } } },
      { $group: { _id: '$customer', total: { $sum: '$total' } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $project: { name: { $ifNull: ['$customer.name', 'Unknown'] }, total: 1 } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: from } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.amount' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]),
    Customer.aggregate([
      {
        $group: {
          _id: null,
          pending: { $sum: '$currentBalance' },
          creditCustomers: { $sum: { $cond: [{ $gt: ['$currentBalance', 0] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const map = (arr) => Object.fromEntries(arr.map((x) => [x._id, x.total || 0]));
  const sm = map(sales),
    pm = map(purchases),
    em = map(expenses);
  const trend = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    trend.push({
      date: key,
      sales: sm[key] || 0,
      purchases: pm[key] || 0,
      expenses: em[key] || 0,
      profit: (sm[key] || 0) - (pm[key] || 0) - (em[key] || 0),
    });
  }
  res.json({
    days,
    trend,
    topCustomers,
    topProducts,
    paymentStatus: paymentStatus[0] || { pending: 0, creditCustomers: 0 },
  });
}
export async function notifications(req, res) {
  const low = await Product.find({ $expr: { $lte: ['$availableStock', '$minimumStock'] } }).limit(20);
  const overdue = await Customer.find({ currentBalance: { $gt: 0 } })
    .sort({ currentBalance: -1 })
    .limit(10);
  const generated = [
    ...low.map((x) => ({
      type: 'warning',
      title: 'Low stock',
      message: `${x.name}: ${x.availableStock} ${x.unit} remaining`,
      link: '/admin/inventory',
    })),
    ...overdue.map((x) => ({
      type: 'info',
      title: 'Pending payment',
      message: `${x.name}: PKR ${x.currentBalance.toLocaleString()}`,
      link: '/admin/customers',
    })),
  ];
  const stored = await Notification.find({ $or: [{ user: req.user._id }, { user: null }] })
    .sort({ createdAt: -1 })
    .limit(20);
  res.json({ items: [...generated, ...stored], unread: generated.length + stored.filter((x) => !x.read).length });
}
export async function auditLogs(req, res) {
  res.json(
    await AuditLog.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit || 100)),
  );
}
export async function reports(req, res) {
  const days = Number(req.query.days || 30),
    from = new Date(Date.now() - days * 86400000);
  const [sales, purchases, expenses, stock, customerLedger, supplierLedger] = await Promise.all([
    Sale.aggregate([
      { $match: { date: { $gte: from } } },
      { $group: { _id: null, total: { $sum: '$total' }, paid: { $sum: '$payment' } } },
    ]),
    Purchase.aggregate([
      { $match: { date: { $gte: from } } },
      { $group: { _id: null, total: { $sum: '$total' }, paid: { $sum: '$payment' } } },
    ]),
    Expense.aggregate([{ $match: { date: { $gte: from } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Product.find().select('name category availableStock minimumStock purchasePrice salePrice'),
    Customer.find().sort({ currentBalance: -1 }).limit(50),
    Supplier.find().sort({ currentBalance: -1 }).limit(50),
  ]);
  res.json({
    periodDays: days,
    sales: sales[0] || { total: 0 },
    purchases: purchases[0] || { total: 0 },
    expenses: expenses[0] || { total: 0 },
    profit: (sales[0]?.total || 0) - (purchases[0]?.total || 0) - (expenses[0]?.total || 0),
    stock,
    customerLedger,
    supplierLedger,
  });
}
export async function backup(req, res) {
  const data = {
    exportedAt: new Date(),
    customers: await Customer.find(),
    suppliers: await Supplier.find(),
    products: await Product.find(),
    purchases: await Purchase.find(),
    sales: await Sale.find(),
    ledger: await Ledger.find(),
    expenses: await Expense.find(),
    leads: await Lead.find(),
    settings: await Setting.find(),
  };
  res.setHeader('Content-Disposition', 'attachment; filename=hmn-backup.json');
  res.json(data);
}
export async function smartSearch(req, res) {
  const q = req.query.q || '';
  const rx = { $regex: q, $options: 'i' };
  const [customers, suppliers, products] = await Promise.all([
    Customer.find({ $or: [{ name: rx }, { phone: rx }, { village: rx }] }).limit(8),
    Supplier.find({ $or: [{ name: rx }, { phone: rx }, { company: rx }] }).limit(8),
    Product.find({ $or: [{ name: rx }, { category: rx }, { barcode: rx }] }).limit(8),
  ]);
  res.json({ customers, suppliers, products });
}
export async function aiInsights(req, res) {
  const low = await Product.find({ $expr: { $lte: ['$availableStock', '$minimumStock'] } });
  const topCustomers = await Customer.find().sort({ currentBalance: -1 }).limit(5);
  res.json({
    summary: `${low.length} items are at or below minimum stock. ${topCustomers.length} customers have the highest outstanding balances.`,
    inventoryForecast: low.map((x) => ({
      product: x.name,
      recommendation: `Restock at least ${Math.max(x.minimumStock * 2 - x.availableStock, 0)} ${x.unit}`,
    })),
    salesPrediction: 'Prediction becomes more accurate after 90+ days of sales data.',
    topOutstanding: topCustomers,
  });
}
