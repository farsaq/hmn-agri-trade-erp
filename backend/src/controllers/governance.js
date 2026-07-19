import { Notification, AuditLog, User, Product, Sale, Purchase } from '../models/index.js';
import { Role, NotificationPreference } from '../models/enterprise.js';
import { ProductBatch, WarehouseStock } from '../models/operations.js';
import { emitToUser, emitGlobal } from '../services/realtime.js';
import { sendMail } from '../services/mail.js';
import { ROLE_PERMISSIONS } from '../middleware/auth.js';

const clean = (v) => JSON.parse(JSON.stringify(v ?? null));
const diff = (before, after) => {
  const out = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (['updatedAt', 'createdAt', '__v', 'password', 'otpHash', 'twoFactorSecret', 'recoveryCodeHashes'].includes(k))
      continue;
    const a = JSON.stringify(before?.[k]);
    const b = JSON.stringify(after?.[k]);
    if (a !== b) out[k] = { before: before?.[k], after: after?.[k] };
  }
  return out;
};
export async function writeAudit({
  req,
  user = req?.user,
  action,
  entity,
  entityId,
  description,
  before,
  after,
  metadata,
  statusCode = 200,
}) {
  if (req) req.auditLogged = true;
  return AuditLog.create({
    user: user?._id || user,
    action,
    entity,
    entityId,
    description,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent'),
    device: req?.get?.('sec-ch-ua-platform') || req?.get?.('user-agent'),
    method: req?.method,
    path: req?.originalUrl,
    statusCode,
    before: clean(before),
    after: clean(after),
    changes: diff(clean(before) || {}, clean(after) || {}),
    metadata,
  });
}
const eventPreferenceKey = (type) =>
  ({
    'low-stock': 'lowStock',
    expiry: 'expiry',
    'pending-payment': 'pendingPayment',
    'overdue-balance': 'overdueBalance',
    sale: 'sale',
    purchase: 'purchase',
    'expense-approval': 'expenseApproval',
  })[type] || null;
async function recipientUsers(user, audienceRoles) {
  if (user) {
    const u = await User.findById(user).select('_id email active');
    return u?.active ? [u] : [];
  }
  if (audienceRoles?.length) return User.find({ active: true, role: { $in: audienceRoles } }).select('_id email role');
  return [];
}
export async function createNotification({
  user,
  audienceRoles = [],
  type = 'info',
  severity = 'info',
  title,
  message,
  link,
  eventKey,
  sourceEntity,
  sourceId,
  email = false,
}) {
  const users = await recipientUsers(user, audienceRoles);
  const prefKey = eventPreferenceKey(type);
  const created = [];
  if (users.length) {
    for (const u of users) {
      const pref = await NotificationPreference.findOneAndUpdate(
        { user: u._id },
        { $setOnInsert: { user: u._id } },
        { new: true, upsert: true },
      );
      if (prefKey && pref.events?.[prefKey] === false) continue;
      const key = eventKey ? `${eventKey}:user:${u._id}` : undefined;
      if (key && (await Notification.exists({ eventKey: key, read: false }))) continue;
      let doc = null;
      if (pref.inApp !== false) {
        doc = await Notification.create({
          user: u._id,
          audienceRoles: [],
          type,
          severity,
          title,
          message,
          link,
          eventKey: key,
          sourceEntity,
          sourceId,
        });
        emitToUser(String(u._id), 'notification:new', doc.toObject());
        created.push(doc);
      }
      if ((email || pref.email) && u.email) {
        try {
          await sendMail({
            to: u.email,
            subject: `HMN ERP: ${title}`,
            text: message,
            html: `<h2>${title}</h2><p>${message}</p>`,
          });
          if (doc) {
            doc.emailSentAt = new Date();
            await doc.save();
          }
        } catch (e) {
          if (doc) {
            doc.emailError = e.message;
            await doc.save();
          }
        }
      }
    }
  } else {
    if (eventKey && (await Notification.exists({ eventKey, read: false }))) return null;
    const doc = await Notification.create({
      user: null,
      audienceRoles: [],
      type,
      severity,
      title,
      message,
      link,
      eventKey,
      sourceEntity,
      sourceId,
    });
    emitGlobal('notification:new', doc.toObject());
    created.push(doc);
  }
  return created[0] || null;
}
export async function syncOperationalAlerts() {
  const now = new Date(),
    soon = new Date(Date.now() + 30 * 86400000);
  const [lowGlobal, lowWarehouse, expiringProducts, expiringBatches, pendingSales, pendingPurchases, overdueSales] =
    await Promise.all([
      Product.find({ $expr: { $lte: ['$availableStock', '$minimumStock'] } }).limit(50),
      WarehouseStock.find({ $expr: { $lte: ['$quantity', { $ifNull: ['$reserved', 0] }] } })
        .populate('product', 'name unit minimumStock')
        .populate('warehouse', 'name code')
        .limit(50),
      Product.find({ expiryDate: { $gte: now, $lte: soon } }).limit(50),
      ProductBatch.find({ expiryDate: { $gte: now, $lte: soon }, status: { $nin: ['expired', 'depleted'] } })
        .populate('product', 'name')
        .limit(50),
      Sale.find({ remaining: { $gt: 0 }, status: { $nin: ['cancelled', 'paid'] } })
        .sort({ date: -1 })
        .limit(50)
        .populate('customer', 'name'),
      Purchase.find({ remaining: { $gt: 0 }, status: { $ne: 'cancelled' } })
        .sort({ date: -1 })
        .limit(50)
        .populate('supplier', 'name'),
      Sale.find({ remaining: { $gt: 0 }, dueDate: { $lt: now }, status: { $nin: ['cancelled', 'paid'] } })
        .populate('customer', 'name')
        .limit(50),
    ]);
  for (const x of lowGlobal)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'warehouse'],
      type: 'low-stock',
      severity: 'warning',
      title: 'Low stock alert',
      message: `${x.name}: ${x.availableStock} ${x.unit} remaining`,
      link: '/admin/inventory',
      eventKey: `low-stock:${x._id}:${x.availableStock}`,
      sourceEntity: 'Product',
      sourceId: x._id,
    });
  for (const x of lowWarehouse)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'warehouse'],
      type: 'low-stock',
      severity: 'warning',
      title: 'Warehouse stock alert',
      message: `${x.product?.name || 'Product'} at ${x.warehouse?.name || 'warehouse'}: ${x.quantity} remaining`,
      link: '/admin/inventory',
      eventKey: `warehouse-low:${x._id}:${x.quantity}`,
      sourceEntity: 'WarehouseStock',
      sourceId: x._id,
    });
  for (const x of expiringProducts)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'warehouse'],
      type: 'expiry',
      severity: 'critical',
      title: 'Expiry alert',
      message: `${x.name} expires on ${new Date(x.expiryDate).toLocaleDateString()}`,
      link: '/admin/products',
      eventKey: `expiry:${x._id}:${new Date(x.expiryDate).toISOString().slice(0, 10)}`,
      sourceEntity: 'Product',
      sourceId: x._id,
    });
  for (const x of expiringBatches)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'warehouse'],
      type: 'expiry',
      severity: 'critical',
      title: 'Batch expiry alert',
      message: `${x.product?.name || 'Product'} batch ${x.batchNo} expires on ${new Date(x.expiryDate).toLocaleDateString()}`,
      link: '/admin/inventory',
      eventKey: `batch-expiry:${x._id}:${new Date(x.expiryDate).toISOString().slice(0, 10)}`,
      sourceEntity: 'ProductBatch',
      sourceId: x._id,
    });
  for (const x of pendingSales)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'accountant', 'sales'],
      type: 'pending-payment',
      severity: 'warning',
      title: 'Sale payment pending',
      message: `${x.invoiceNo || x._id} — ${x.customer?.name || 'Customer'} owes PKR ${Number(x.remaining).toLocaleString()}`,
      link: '/admin/sales',
      eventKey: `sale-payment:${x._id}:${x.remaining}`,
      sourceEntity: 'Sale',
      sourceId: x._id,
    });
  for (const x of pendingPurchases)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'accountant'],
      type: 'pending-payment',
      severity: 'info',
      title: 'Supplier payment pending',
      message: `${x.purchaseNo || x._id} — ${x.supplier?.name || 'Supplier'}: PKR ${Number(x.remaining).toLocaleString()}`,
      link: '/admin/purchases',
      eventKey: `purchase-payment:${x._id}:${x.remaining}`,
      sourceEntity: 'Purchase',
      sourceId: x._id,
    });
  for (const x of overdueSales)
    await createNotification({
      audienceRoles: ['admin', 'manager', 'accountant', 'sales'],
      type: 'overdue-balance',
      severity: 'critical',
      title: 'Overdue customer payment',
      message: `${x.invoiceNo || x._id} — ${x.customer?.name || 'Customer'} overdue by PKR ${Number(x.remaining).toLocaleString()}`,
      link: '/admin/sales',
      eventKey: `overdue-sale:${x._id}:${x.remaining}`,
      sourceEntity: 'Sale',
      sourceId: x._id,
    });
}
export async function listNotifications(req, res) {
  await syncOperationalAlerts();
  const q = { $or: [{ user: req.user._id }, { user: null }] };
  if (req.query.read === 'true') q.read = true;
  if (req.query.read === 'false') q.read = false;
  if (req.query.type) q.type = req.query.type;
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const items = await Notification.find(q).sort({ createdAt: -1 }).limit(limit);
  res.json({ items, unread: await Notification.countDocuments({ ...q, read: false }) });
}
export async function markRead(req, res) {
  const doc = await Notification.findOneAndUpdate(
    { _id: req.params.id, $or: [{ user: req.user._id }, { user: null }] },
    { read: true, readAt: new Date() },
    { new: true },
  );
  if (!doc) return res.status(404).json({ message: 'Notification not found' });
  res.json(doc);
}
export async function markAllRead(req, res) {
  await Notification.updateMany({ $or: [{ user: req.user._id }, { user: null }] }, { read: true, readAt: new Date() });
  res.json({ success: true });
}
export async function getPreferences(req, res) {
  const p = await NotificationPreference.findOneAndUpdate(
    { user: req.user._id },
    { $setOnInsert: { user: req.user._id } },
    { new: true, upsert: true },
  );
  res.json(p);
}
export async function updatePreferences(req, res) {
  const allowed = {};
  for (const k of ['inApp', 'email']) if (k in req.body) allowed[k] = Boolean(req.body[k]);
  if (req.body.events && typeof req.body.events === 'object') allowed.events = req.body.events;
  const p = await NotificationPreference.findOneAndUpdate(
    { user: req.user._id },
    { $set: allowed, $setOnInsert: { user: req.user._id } },
    { new: true, upsert: true, runValidators: true },
  );
  res.json(p);
}

function auditQuery(req) {
  const q = {};
  if (req.query.user) q.user = req.query.user;
  if (req.query.action) q.action = { $regex: req.query.action, $options: 'i' };
  if (req.query.entity) q.entity = { $regex: req.query.entity, $options: 'i' };
  if (req.query.path) q.path = { $regex: req.query.path, $options: 'i' };
  if (req.query.ip) q.ip = { $regex: req.query.ip, $options: 'i' };
  if (req.query.statusCode) q.statusCode = Number(req.query.statusCode);
  if (req.query.from || req.query.to)
    q.createdAt = {
      ...(req.query.from && { $gte: new Date(req.query.from) }),
      ...(req.query.to && { $lte: new Date(`${req.query.to}T23:59:59.999`) }),
    };
  return q;
}
export async function auditLogs(req, res) {
  const q = auditQuery(req);
  const page = Math.max(Number(req.query.page || 1), 1),
    limit = Math.min(Number(req.query.limit || 100), 500);
  const [items, total] = await Promise.all([
    AuditLog.find(q)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}
const csv = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
export async function exportAudit(req, res) {
  const rows = await AuditLog.find(auditQuery(req)).populate('user', 'name email').sort({ createdAt: -1 }).limit(10000);
  const data = [
    [
      'Date',
      'User',
      'Email',
      'Role',
      'Action',
      'Entity',
      'Description',
      'Method',
      'Path',
      'Status',
      'IP',
      'Device',
      'Before',
      'After',
      'Changes',
    ],
    ...rows.map((x) => [
      x.createdAt,
      x.user?.name,
      x.user?.email,
      x.user?.role,
      x.action,
      x.entity,
      x.description,
      x.method,
      x.path,
      x.statusCode,
      x.ip,
      x.device,
      JSON.stringify(x.before || {}),
      JSON.stringify(x.after || {}),
      JSON.stringify(x.changes || {}),
    ]),
  ];
  res.setHeader('Content-Disposition', 'attachment; filename=hmn-audit-logs.csv');
  res.type('text/csv').send(data.map((r) => r.map(csv).join(',')).join('\n'));
}

const permissionCatalog = [
  'dashboard.view',
  'customers.view',
  'customers.create',
  'customers.update',
  'customers.delete',
  'suppliers.view',
  'suppliers.create',
  'suppliers.update',
  'suppliers.delete',
  'products.view',
  'products.create',
  'products.update',
  'products.delete',
  'inventory.view',
  'inventory.create',
  'inventory.update',
  'inventory.delete',
  'purchases.view',
  'purchases.create',
  'purchases.update',
  'purchases.delete',
  'sales.view',
  'sales.create',
  'sales.update',
  'sales.delete',
  'expenses.view',
  'expenses.create',
  'expenses.update',
  'expenses.delete',
  'ledger.view',
  'ledger.create',
  'ledger.update',
  'reports.view',
  'notifications.view',
  'notifications.manage',
  'audit.view',
  'roles.view',
  'roles.create',
  'roles.update',
  'roles.delete',
  'users.view',
  'users.create',
  'users.update',
  'users.delete',
  'settings.view',
  'settings.update',
  'security.view',
  'ai.view',
  'ai.query',
  'integrations.view',
  'integrations.manage',
  'integrations.send',
  'cloudinary.upload',
  'cloudinary.download',
  'cloudinary.delete',
  'cloudinary.monitor',
];
export async function permissionList(req, res) {
  res.json({ permissions: permissionCatalog, defaults: ROLE_PERMISSIONS });
}
export async function listRoles(req, res) {
  res.json(await Role.find().sort({ system: -1, name: 1 }));
}
export async function createRole(req, res) {
  const name = String(req.body.name || '')
    .trim()
    .toLowerCase();
  if (!name) return res.status(400).json({ message: 'Role name is required' });
  const invalid = (req.body.permissions || []).filter(
    (x) => !permissionCatalog.includes(x) && x !== '*' && !x.endsWith('.*'),
  );
  if (invalid.length) return res.status(400).json({ message: `Invalid permissions: ${invalid.join(', ')}` });
  const role = await Role.create({
    name,
    description: req.body.description,
    permissions: req.body.permissions || [],
    system: false,
  });
  await writeAudit({
    req,
    action: 'ROLE_CREATED',
    entity: 'Role',
    entityId: role._id,
    description: `Created role ${role.name}`,
    after: role,
  });
  res.status(201).json(role);
}
export async function updateRole(req, res) {
  const before = await Role.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Role not found' });
  if (before.system && req.body.name && req.body.name !== before.name)
    return res.status(400).json({ message: 'System role name cannot be changed' });
  const invalid = (req.body.permissions || []).filter(
    (x) => !permissionCatalog.includes(x) && x !== '*' && !x.endsWith('.*'),
  );
  if (invalid.length) return res.status(400).json({ message: `Invalid permissions: ${invalid.join(', ')}` });
  const role = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await writeAudit({
    req,
    action: 'ROLE_UPDATED',
    entity: 'Role',
    entityId: role._id,
    description: `Updated role ${role.name}`,
    before,
    after: role,
  });
  res.json(role);
}
export async function deleteRole(req, res) {
  const before = await Role.findById(req.params.id);
  if (!before) return res.status(404).json({ message: 'Role not found' });
  if (before.system) return res.status(400).json({ message: 'System roles cannot be deleted' });
  await User.updateMany({ customRole: before._id }, { $unset: { customRole: 1 }, $set: { role: 'viewer' } });
  await before.deleteOne();
  await writeAudit({
    req,
    action: 'ROLE_DELETED',
    entity: 'Role',
    entityId: before._id,
    description: `Deleted role ${before.name}`,
    before,
  });
  res.json({ success: true });
}
export async function listUsers(req, res) {
  res.json(
    await User.find()
      .select('-password -otpHash -twoFactorSecret -recoveryCodeHashes')
      .populate('customRole')
      .sort({ createdAt: -1 }),
  );
}
export async function assignRole(req, res) {
  const before = await User.findById(req.params.id).select('-password').lean();
  if (!before) return res.status(404).json({ message: 'User not found' });
  const update = {
    role: req.body.role || before.role,
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions : [],
  };
  if (req.body.customRole) update.customRole = req.body.customRole;
  else update.$unset = { customRole: 1 };
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    .select('-password')
    .populate('customRole');
  await writeAudit({
    req,
    action: 'USER_PERMISSIONS_UPDATED',
    entity: 'User',
    entityId: user._id,
    description: `Updated access for ${user.email}`,
    before,
    after: user,
  });
  res.json(user);
}
