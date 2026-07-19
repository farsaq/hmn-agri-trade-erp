import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { protect, requirePermission, permit } from '../middleware/auth.js';
import {
  attachWarehouseScope,
  requireWarehouseBodyAccess,
  requireWarehouseResourceAccess,
} from '../middleware/warehouseAccess.js';
import * as o from '../controllers/operations.js';
import * as tx from '../controllers/financialTransactions.js';
const r = Router();
r.use(protect);
const makeUpload = (folder) =>
  multer({
    storage: multer.diskStorage({
      destination: `uploads/${folder}`,
      filename: (_, f, cb) =>
        cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(f.originalname)}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_, f, cb) => cb(null, /^(image\/|application\/pdf)/.test(f.mimetype)),
  });
const supplierUpload = makeUpload('suppliers'),
  productUpload = makeUpload('products'),
  saleUpload = makeUpload('sales');
r.get('/suppliers/:id/profile', requirePermission('suppliers.view'), o.supplierProfile);
r.post('/suppliers/:id/contracts', requirePermission('suppliers.update'), o.addSupplierContract);
r.put('/suppliers/:id/contracts/:contractId', requirePermission('suppliers.update'), o.updateSupplierContract);
r.delete('/suppliers/:id/contracts/:contractId', requirePermission('suppliers.delete'), o.deleteSupplierContract);
r.post('/suppliers/:id/banks', requirePermission('suppliers.update'), o.addSupplierBank);
r.put('/suppliers/:id/banks/:bankId', requirePermission('suppliers.update'), o.updateSupplierBank);
r.delete('/suppliers/:id/banks/:bankId', requirePermission('suppliers.delete'), o.deleteSupplierBank);
r.post('/suppliers/:id/contacts', requirePermission('suppliers.update'), o.addSupplierContact);
r.put('/suppliers/:id/contacts/:contactId', requirePermission('suppliers.update'), o.updateSupplierContact);
r.delete('/suppliers/:id/contacts/:contactId', requirePermission('suppliers.delete'), o.deleteSupplierContact);
r.post('/suppliers/:id/compliance', requirePermission('suppliers.update'), o.addSupplierCompliance);
r.put('/suppliers/:id/compliance/:complianceId', requirePermission('suppliers.update'), o.updateSupplierCompliance);
r.delete('/suppliers/:id/compliance/:complianceId', requirePermission('suppliers.delete'), o.deleteSupplierCompliance);
r.post('/suppliers/:id/activities', requirePermission('suppliers.update'), o.addSupplierActivity);
r.post(
  '/suppliers/:id/activities/:activityId/complete',
  requirePermission('suppliers.update'),
  o.completeSupplierActivity,
);
r.put('/suppliers/:id/governance', requirePermission('suppliers.update'), o.updateSupplierGovernance);
r.post(
  '/suppliers/:id/attachments',
  requirePermission('suppliers.update'),
  supplierUpload.single('attachment'),
  o.addSupplierAttachment,
);
r.delete('/suppliers/:id/attachments/:attachmentId', requirePermission('suppliers.update'), o.deleteSupplierAttachment);
r.post('/suppliers/:id/evaluations', requirePermission('suppliers.update'), o.addSupplierEvaluation);
r.get('/suppliers/:id/statement', requirePermission('suppliers.view'), o.supplierStatement);
r.post('/suppliers/:id/archive', requirePermission('suppliers.update'), o.archiveSupplier);
r.get('/catalog/meta', requirePermission('products.view'), o.listMetadata);
r.post('/catalog/categories', requirePermission('products.create'), o.createCategory);
r.post('/catalog/brands', requirePermission('products.create'), o.createBrand);
r.get('/products/:id/profile', requirePermission('products.view'), o.productProfile);
r.post(
  '/products/:id/images',
  requirePermission('products.update'),
  productUpload.array('images', 8),
  o.uploadProductImages,
);
r.post('/products/:id/codes', requirePermission('products.update'), o.generateCodes);
r.get('/products/:id/barcode.png', requirePermission('products.view'), o.barcodePng);
r.post('/products/:id/batches', requirePermission('products.update'), o.createBatch);
r.get('/inventory/summary', requirePermission('inventory.view'), attachWarehouseScope, o.inventorySummary);
r.get('/inventory/history', requirePermission('inventory.view'), attachWarehouseScope, o.inventoryHistory);
r.post(
  '/inventory/transfers',
  requirePermission('inventory.create'),
  requireWarehouseBodyAccess(['fromWarehouse', 'toWarehouse'], 'update'),
  o.transferStock,
);
r.post(
  '/inventory/reconciliations',
  requirePermission('inventory.update'),
  requireWarehouseBodyAccess(['warehouse'], 'update'),
  o.createReconciliation,
);
r.post(
  '/inventory/reconciliations/:id/approve',
  permit('admin', 'manager'),
  requireWarehouseResourceAccess('reconciliation', 'update'),
  o.approveReconciliation,
);
r.post(
  '/inventory/requests',
  requirePermission('inventory.create'),
  requireWarehouseBodyAccess(['warehouse'], 'update'),
  o.createStockRequest,
);
r.post(
  '/inventory/requests/:id/approve',
  permit('admin', 'manager'),
  requireWarehouseResourceAccess('request', 'update'),
  o.approveStockRequest,
);
r.get('/sales-workspace', requirePermission('sales.view'), o.salesWorkspace);
r.post('/sales-professional', requirePermission('sales.create'), saleUpload.array('attachments', 6), tx.createSale);
r.post('/sales/:id/payments', requirePermission('sales.update'), tx.legacySalePayment);
r.post('/sales/:id/cancel', permit('admin', 'manager'), tx.cancelSale);
r.post('/sales-returns', requirePermission('sales.create'), tx.createSaleReturn);
r.post('/quotations', requirePermission('sales.create'), o.createQuotation);
r.post('/delivery-challans', requirePermission('sales.create'), o.createChallan);
export default r;
