import { Router } from 'express';
import { protect, permit, requirePermission } from '../middleware/auth.js';
import { requireWarehouseAccess } from '../middleware/warehouseAccess.js';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import * as customers from '../controllers/customers.js';
import * as suppliers from '../controllers/suppliers.js';
import * as products from '../controllers/products.js';
import * as wu from '../controllers/warehouseUnits.js';
import * as tx from '../controllers/financialTransactions.js';
import * as c from '../controllers/core.js';
import * as auth from '../controllers/auth.js';
import { loginLimiter, otpLimiter, passwordResetLimiter, refreshLimiter } from '../middleware/authRateLimits.js';
const r = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/customers',
    filename: (_, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /^(image|application\/pdf)/.test(file.mimetype)),
});
r.post('/auth/login', loginLimiter, auth.login);
r.post('/auth/verify-email', auth.verifyEmail);
r.post('/auth/resend-verification', passwordResetLimiter, auth.sendVerification);
r.post('/auth/refresh', refreshLimiter, auth.refresh);
r.post('/auth/forgot-password', passwordResetLimiter, auth.forgotPassword);
r.post('/auth/reset-password', passwordResetLimiter, auth.resetPassword);
r.post('/auth/otp/request', otpLimiter, auth.requestOtp);
r.post('/auth/otp/verify', loginLimiter, auth.verifyOtp);
r.post('/leads', c.create('leads'));
r.use(protect);
r.get('/auth/me', auth.me);
r.post('/auth/logout', auth.logout);
r.post('/auth/2fa/setup', auth.setupTwoFactor);
r.post('/auth/2fa/enable', auth.enableTwoFactor);
r.post('/auth/2fa/disable', auth.disableTwoFactor);
r.get('/auth/sessions', auth.sessions);
r.delete('/auth/sessions/:id', auth.revokeSession);
r.get('/dashboard', requirePermission('dashboard.view'), c.dashboard);
r.get('/dashboard/analytics', requirePermission('dashboard.view'), c.dashboardAnalytics);
r.get('/notifications', requirePermission('notifications.view'), c.notifications);
r.get('/audit-logs', requirePermission('audit.view'), c.auditLogs);
r.get('/reports', requirePermission('reports.view'), c.reports);
r.get('/backup', permit('admin'), c.backup);
r.get('/search', requirePermission('dashboard.view'), c.smartSearch);
r.get('/ai/insights', requirePermission('dashboard.view'), c.aiInsights);
r.get('/customers', requirePermission('customers.view'), customers.listCustomers);
r.get('/customers-deleted', requirePermission('customers.view'), customers.listDeletedCustomers);
r.post('/customers', requirePermission('customers.create'), upload.single('photo'), customers.createCustomer);
r.post('/customers/:id/restore', requirePermission('customers.update'), customers.restoreCustomer);
r.get('/customers/:id/timeline', requirePermission('customers.view'), customers.timeline);
r.get('/customers/:id/ageing', requirePermission('customers.view'), customers.ageing);
r.get('/customers/:id/statement.pdf', requirePermission('customers.view'), customers.statementPdf);
r.get('/customers/:id/statement', requirePermission('customers.view'), customers.statement);
r.get('/customers/:id', requirePermission('customers.view'), customers.customerDetail);
r.put('/customers/:id', requirePermission('customers.update'), upload.single('photo'), customers.updateCustomer);
r.delete('/customers/:id', requirePermission('customers.delete'), customers.deleteCustomer);
r.post(
  '/customers/:id/attachments',
  requirePermission('customers.update'),
  upload.single('attachment'),
  customers.addAttachment,
);
r.delete('/customers/:id/attachments/:attachmentId', requirePermission('customers.update'), customers.removeAttachment);
r.get('/suppliers', requirePermission('suppliers.view'), suppliers.list);
r.get('/suppliers-deleted', requirePermission('suppliers.view'), suppliers.deleted);
r.post('/suppliers', requirePermission('suppliers.create'), suppliers.create);
r.get('/suppliers/:id', requirePermission('suppliers.view'), suppliers.detail);
r.put('/suppliers/:id', requirePermission('suppliers.update'), suppliers.update);
r.delete('/suppliers/:id', requirePermission('suppliers.delete'), suppliers.remove);
r.post('/suppliers/:id/restore', requirePermission('suppliers.update'), suppliers.restore);
r.get('/suppliers/:id/timeline', requirePermission('suppliers.view'), suppliers.timeline);
r.get('/suppliers/:id/ageing', requirePermission('suppliers.view'), suppliers.ageing);
r.get('/suppliers/:id/statement.pdf', requirePermission('suppliers.view'), suppliers.statementPdf);
r.get('/warehouses', requirePermission('inventory.view'), wu.warehouses);
r.get('/warehouses-deleted', requirePermission('inventory.view'), wu.deletedWarehouses);
r.post('/warehouses', requirePermission('inventory.create'), wu.createWarehouse);
r.post(
  '/warehouses/:id/restore',
  requirePermission('inventory.update'),
  requireWarehouseAccess('update'),
  wu.restoreWarehouse,
);
r.get(
  '/warehouses/:id/timeline',
  requirePermission('inventory.view'),
  requireWarehouseAccess('view'),
  wu.warehouseTimeline,
);
r.get(
  '/warehouses/:id/transfers',
  requirePermission('inventory.view'),
  requireWarehouseAccess('view'),
  wu.warehouseTransfers,
);
r.get(
  '/warehouses/:id/reconciliations',
  requirePermission('inventory.view'),
  requireWarehouseAccess('view'),
  wu.warehouseReconciliations,
);
r.get('/warehouses/:id/low-stock', requirePermission('inventory.view'), requireWarehouseAccess('view'), wu.lowStock);
r.get('/warehouses/:id/expiry', requirePermission('inventory.view'), requireWarehouseAccess('view'), wu.expiry);
r.get(
  '/warehouses/:id/report.pdf',
  requirePermission('inventory.view'),
  requireWarehouseAccess('view'),
  wu.warehousePdf,
);
r.get(
  '/warehouses/:id/export.xlsx',
  requirePermission('inventory.view'),
  requireWarehouseAccess('view'),
  wu.warehouseExcel,
);
r.get('/warehouses/:id', requirePermission('inventory.view'), requireWarehouseAccess('view'), wu.warehouse);
r.put('/warehouses/:id', requirePermission('inventory.update'), requireWarehouseAccess('update'), wu.updateWarehouse);
r.delete(
  '/warehouses/:id',
  requirePermission('inventory.delete'),
  requireWarehouseAccess('delete'),
  wu.removeWarehouse,
);
r.get('/units', requirePermission('products.view'), wu.units);
r.get('/units-deleted', requirePermission('products.view'), wu.deletedUnits);
r.post('/units', requirePermission('products.create'), wu.createUnit);
r.post('/units/seed-defaults', requirePermission('products.create'), wu.seedUnits);
r.post('/units/convert', requirePermission('products.view'), wu.convert);
r.get('/units/conversion-audit', requirePermission('audit.view'), wu.conversionAudit);
r.get('/units/:id', requirePermission('products.view'), wu.unit);
r.put('/units/:id', requirePermission('products.update'), wu.updateUnit);
r.delete('/units/:id', requirePermission('products.delete'), wu.removeUnit);
r.post('/units/:id/restore', requirePermission('products.update'), wu.restoreUnit);
r.get('/products', requirePermission('products.view'), products.list);
r.get('/products-deleted', requirePermission('products.view'), products.deleted);
r.post('/products', requirePermission('products.create'), products.create);
r.get('/products/export.xlsx', requirePermission('products.view'), products.exportExcel);
r.post('/products/:id/restore', requirePermission('products.update'), products.restore);
r.get('/products/:id/timeline', requirePermission('products.view'), products.timeline);
r.get('/products/:id/report.pdf', requirePermission('products.view'), products.statementPdf);
r.post('/products/:id/adjust-stock', requirePermission('inventory.update'), products.adjust);
r.post('/products/:id/reconcile-stock', requirePermission('inventory.update'), products.reconcile);
r.get('/products/:id', requirePermission('products.view'), products.detail);
r.put('/products/:id', requirePermission('products.update'), products.update);
r.delete('/products/:id', requirePermission('products.delete'), products.remove);
for (const type of ['expenses', 'leads', 'users']) {
  r.get(`/${type}`, requirePermission(`${type}.view`), c.list(type));
  r.post(`/${type}`, requirePermission(`${type}.create`), c.create(type));
  r.put(`/${type}/:id`, requirePermission(`${type}.update`), c.update(type));
  r.delete(`/${type}/:id`, requirePermission(`${type}.delete`), c.remove(type));
}
r.get('/purchases', requirePermission('purchases.view'), c.list('purchases'));
r.post('/purchases', requirePermission('purchases.create'), tx.createPurchase);
r.post('/purchases/:id/confirm', requirePermission('purchases.update'), tx.confirmPurchase);
r.post('/purchases/:id/receive', requirePermission('purchases.update'), tx.receivePurchase);
r.post('/purchases/:id/cancel', requirePermission('purchases.update'), tx.cancelPurchase);
r.post('/purchase-returns', requirePermission('purchases.update'), tx.createPurchaseReturn);
r.post('/purchase-returns/:id/approve', requirePermission('purchases.update'), tx.approvePurchaseReturn);
r.post('/purchase-returns/:id/cancel', requirePermission('purchases.update'), tx.cancelPurchaseReturn);
r.get('/purchase-returns/:id/pdf', requirePermission('purchases.view'), (req, res) => {
  req.params.type = 'purchase';
  return tx.returnPdf(req, res);
});
r.post('/purchase-orders', requirePermission('purchases.create'), tx.createPurchaseOrder);
r.post('/purchase-orders/:id/approve', requirePermission('purchases.update'), tx.approvePurchaseOrder);
r.post('/goods-receipts/:id/cancel', requirePermission('purchases.update'), tx.cancelGoodsReceipt);
r.get('/purchases/:id/timeline', requirePermission('purchases.view'), (req, res) => {
  req.params.type = 'purchase';
  return tx.timeline(req, res);
});
r.get('/purchases/:id/pdf', requirePermission('purchases.view'), (req, res) => {
  req.params.type = 'purchase';
  return tx.documentPdf(req, res);
});
r.get('/sales', requirePermission('sales.view'), c.list('sales'));
r.post('/sales', requirePermission('sales.create'), tx.createSale);
r.post('/sales/:id/confirm', requirePermission('sales.update'), tx.confirmSale);
r.post('/sales/:id/fulfil', requirePermission('sales.update'), tx.fulfilSale);
r.post('/sales/:id/cancel', requirePermission('sales.update'), tx.cancelSale);
r.post('/sale-returns', requirePermission('sales.update'), tx.createSaleReturn);
r.post('/sale-returns/:id/approve', requirePermission('sales.update'), tx.approveSaleReturn);
r.post('/sale-returns/:id/cancel', requirePermission('sales.update'), tx.cancelSaleReturn);
r.get('/sale-returns/:id/pdf', requirePermission('sales.view'), (req, res) => {
  req.params.type = 'sale';
  return tx.returnPdf(req, res);
});
r.get('/sales/:id/timeline', requirePermission('sales.view'), (req, res) => {
  req.params.type = 'sale';
  return tx.timeline(req, res);
});
r.get('/sales/:id/pdf', requirePermission('sales.view'), (req, res) => {
  req.params.type = 'sale';
  return tx.documentPdf(req, res);
});
r.get('/payments', requirePermission('ledger.view'), tx.listPayments);
r.post('/payments', requirePermission('ledger.create'), tx.createPayment);
r.get('/payments/:id', requirePermission('ledger.view'), tx.paymentDetail);
r.get('/payments/:id/pdf', requirePermission('ledger.view'), tx.paymentPdf);
r.post('/payments/:id/reverse', requirePermission('ledger.create'), tx.reversePayment);
r.post('/payments/:id/cheque-status', requirePermission('ledger.create'), tx.updateChequeStatus);
r.get('/expenses-enterprise', requirePermission('expenses.view'), tx.listExpenses);
r.post('/expenses-enterprise', requirePermission('expenses.create'), tx.createExpense);
r.get('/expenses-enterprise/:id', requirePermission('expenses.view'), tx.expenseDetail);
r.put('/expenses-enterprise/:id', requirePermission('expenses.update'), tx.updateExpense);
r.get('/expenses-enterprise/:id/timeline', requirePermission('expenses.view'), tx.expenseTimeline);
r.get('/expenses-enterprise/:id/voucher.pdf', requirePermission('expenses.view'), tx.expensePdf);
r.post('/expenses-enterprise/:id/approve', requirePermission('expenses.update'), tx.approveExpense);
r.post('/expenses-enterprise/:id/pay', requirePermission('expenses.update'), tx.payExpense);
r.post('/expenses-enterprise/:id/reverse', requirePermission('expenses.update'), tx.reverseExpense);
r.delete('/expenses-enterprise/:id', requirePermission('expenses.delete'), tx.deleteExpense);
r.post('/expenses-enterprise/:id/restore', requirePermission('expenses.update'), tx.restoreExpense);
r.post('/ledger', requirePermission('ledger.create'), c.addLedger);
r.get('/ledger/:partyId', requirePermission('ledger.view'), c.ledger);
export default r;
