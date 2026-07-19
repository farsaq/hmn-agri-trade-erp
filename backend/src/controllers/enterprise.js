import {
  Customer,
  Supplier,
  Product,
  Sale,
  Purchase,
  Expense,
  Ledger,
  Notification,
  AuditLog,
  User,
} from '../models/index.js';
import {
  Warehouse,
  InventoryMovement,
  Vehicle,
  Payment,
  Attachment,
  Role,
  BackupRecord,
  Integration,
  CompanyProfile,
} from '../models/enterprise.js';
import { writeAudit } from './governance.js';
const registry = {
  warehouses: Warehouse,
  'inventory-movements': InventoryMovement,
  vehicles: Vehicle,
  payments: Payment,
  attachments: Attachment,
  roles: Role,
  backups: BackupRecord,
  integrations: Integration,
  'company-profile': CompanyProfile,
};
const safePopulate = (q, type) =>
  type === 'inventory-movements'
    ? q.populate('product warehouse fromWarehouse toWarehouse createdBy', 'name code email')
    : type === 'payments'
      ? q.populate('party')
      : type === 'attachments'
        ? q.populate('uploadedBy', 'name email')
        : q;
export const listEnterprise = (type) => async (req, res) => {
  const M = registry[type];
  if (!M) return res.status(404).json({ message: 'Unknown module' });
  const page = Math.max(Number(req.query.page) || 1, 1),
    limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200),
    q = {};
  const [items, total] = await Promise.all([
    safePopulate(
      M.find(q)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      type,
    ),
    M.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
};
export const createEnterprise = (type) => async (req, res) => {
  const M = registry[type];
  const doc = await M.create({ ...req.body, createdBy: req.user?._id });
  if (type === 'inventory-movements') {
    const sign = ['stock-in', 'return'].includes(doc.type)
      ? 1
      : ['stock-out', 'damage', 'expiry'].includes(doc.type)
        ? -1
        : 0;
    if (sign) await Product.findByIdAndUpdate(doc.product, { $inc: { availableStock: sign * doc.quantity } });
  }
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
export const updateEnterprise = (type) => async (req, res) => {
  const M = registry[type];
  const before = await M.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Not found' });
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
export const deleteEnterprise = (type) => async (req, res) => {
  const M = registry[type];
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
export async function invoice(req, res) {
  const sale = await Sale.findById(req.params.id).populate('customer').populate('items.product');
  if (!sale) return res.status(404).json({ message: 'Invoice not found' });
  const company = await CompanyProfile.findOne();
  res.json({
    company: company || { name: 'HMN Agri Trade' },
    invoice: sale,
    qrPayload: `HMN:${sale.invoiceNo || sale._id}:${sale.total}`,
    barcode: String(sale.invoiceNo || sale._id),
  });
}
export async function restore(req, res) {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ message: 'Invalid backup' });
  const map = {
    customers: Customer,
    suppliers: Supplier,
    products: Product,
    purchases: Purchase,
    sales: Sale,
    ledger: Ledger,
    expenses: Expense,
  };
  const result = {};
  for (const [key, M] of Object.entries(map)) {
    if (Array.isArray(data[key])) {
      await M.deleteMany({});
      if (data[key].length) await M.insertMany(data[key], { ordered: false });
      result[key] = data[key].length;
    }
  }
  await AuditLog.create({
    user: req.user?._id,
    action: 'restore',
    entity: 'backup',
    description: 'Restored JSON backup',
    metadata: result,
  });
  res.json({ success: true, restored: result });
}
export async function markNotification(req, res) {
  const n = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
  res.json(n);
}
export async function aiQuery(req, res) {
  const question = String(req.body.question || '').toLowerCase();
  let answer = 'I can analyze customers, sales, purchases, stock, expenses and ledgers.';
  let data = null;
  if (question.includes('highest') && question.includes('pending')) {
    data = await Customer.findOne().sort({ currentBalance: -1 });
    answer = data
      ? `${data.name} has the highest pending balance: PKR ${Number(data.currentBalance || 0).toLocaleString()}.`
      : 'No customer data found.';
  } else if (question.includes('profit')) {
    const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [s, p, e] = await Promise.all([
      Sale.aggregate([{ $match: { date: { $gte: from } } }, { $group: { _id: null, v: { $sum: '$total' } } }]),
      Purchase.aggregate([{ $match: { date: { $gte: from } } }, { $group: { _id: null, v: { $sum: '$total' } } }]),
      Expense.aggregate([{ $match: { date: { $gte: from } } }, { $group: { _id: null, v: { $sum: '$amount' } } }]),
    ]);
    const profit = (s[0]?.v || 0) - (p[0]?.v || 0) - (e[0]?.v || 0);
    answer = `Estimated current-month profit is PKR ${profit.toLocaleString()}.`;
    data = { profit };
  } else if (question.includes('village')) {
    data = await Sale.aggregate([
      { $group: { _id: '$village', total: { $sum: '$total' } } },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);
    answer = data[0]
      ? `${data[0]._id || 'Unknown'} is the leading village by sales, PKR ${data[0].total.toLocaleString()}.`
      : 'No village sales data found.';
  } else if (question.includes('stock')) {
    data = await Product.find({ $expr: { $lte: ['$availableStock', '$minimumStock'] } }).select(
      'name availableStock minimumStock unit',
    );
    answer = `${data.length} products are at or below minimum stock.`;
  }
  res.json({ answer, data, mode: process.env.OPENAI_API_KEY ? 'provider-ready' : 'local-analytics' });
}
export async function systemHealth(req, res) {
  const [users, warehouses, integrations] = await Promise.all([
    User.countDocuments(),
    Warehouse.countDocuments(),
    Integration.find().select('provider enabled status'),
  ]);
  res.json({
    status: 'ok',
    version: '3.0-enterprise',
    users,
    warehouses,
    integrations,
    features: {
      email: Boolean(process.env.SMTP_HOST),
      cloudinary: Boolean(process.env.CLOUDINARY_URL),
      ai: Boolean(process.env.OPENAI_API_KEY),
      redis: Boolean(process.env.REDIS_URL),
    },
  });
}
