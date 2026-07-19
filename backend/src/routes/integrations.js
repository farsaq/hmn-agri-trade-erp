import { Router } from 'express';
import multer from 'multer';
import { protect, requirePermission, permit } from '../middleware/auth.js';
import * as c from '../controllers/integrations.js';
import * as sx from '../controllers/supplierExports.js';
import * as st from '../controllers/supplierTransfers.js';
import * as ce from '../controllers/cloudinaryEnterprise.js';
import { requireFeature } from '../middleware/featureFlag.js';
const r = Router();
r.use(requireFeature('integrations'));
const maxCloudBytes = Math.max(1, Number(process.env.CLOUDINARY_MAX_FILE_SIZE_MB || 15)) * 1024 * 1024;
const maxCloudFiles = Math.max(1, Number(process.env.CLOUDINARY_MAX_FILES || 20));
const allowedCloudMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const mem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(20 * 1024 * 1024, maxCloudBytes), files: Math.max(25, maxCloudFiles) },
});
const cloudMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxCloudBytes, files: maxCloudFiles },
  fileFilter: (_, file, cb) =>
    allowedCloudMimes.has(file.mimetype)
      ? cb(null, true)
      : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname)),
});
r.post('/integrations/webhooks/incoming/:source', c.incomingWebhook);
r.post('/integrations/uploads/share/public/:token', ce.publicShare);
r.post('/integrations/payments/webhook/:gateway', c.paymentWebhook);
r.use(protect);
r.get('/integrations/status', requirePermission('integrations.view'), c.status);
r.put('/integrations/config', requirePermission('integrations.manage'), c.saveConfig);
r.post('/integrations/uploads/signature', requirePermission('integrations.manage'), c.issueCloudUploadToken);
r.post('/integrations/uploads', requirePermission('integrations.manage'), cloudMem.single('file'), c.upload);
r.post(
  '/integrations/uploads/multiple',
  requirePermission('integrations.manage'),
  cloudMem.array('files', maxCloudFiles),
  c.uploadMultiple,
);
r.delete('/integrations/uploads', permit('admin'), c.deleteUpload);
r.get('/integrations/uploads/folders/stats', requirePermission('integrations.view'), c.cloudFolderStats);
r.post('/integrations/uploads/archive-old', requirePermission('integrations.manage'), c.archiveOldCloudAssets);
r.get('/integrations/uploads/history', requirePermission('integrations.view'), c.cloudUploadHistory);
r.get('/integrations/uploads/failed', requirePermission('integrations.view'), c.cloudFailedUploads);
r.get('/integrations/uploads/assets', requirePermission('integrations.view'), c.cloudAssets);
r.get('/integrations/uploads/analytics', requirePermission('integrations.view'), c.cloudAnalytics);
r.get('/integrations/uploads/access-logs', requirePermission('integrations.view'), c.cloudAccessHistory);
r.post('/integrations/uploads/bulk/rename', requirePermission('integrations.manage'), ce.bulkRename);
r.get('/integrations/uploads/folders', requirePermission('integrations.view'), ce.folders);
r.post('/integrations/uploads/folders', requirePermission('integrations.manage'), ce.createFolder);
r.patch('/integrations/uploads/folders/:id', requirePermission('integrations.manage'), ce.updateFolder);
r.get('/integrations/uploads/folders/:id/activity', requirePermission('integrations.view'), ce.folderActivity);
r.get('/integrations/uploads/saved-searches', requirePermission('integrations.view'), ce.savedSearches);
r.post('/integrations/uploads/saved-searches', requirePermission('integrations.view'), ce.saveSearch);
r.delete('/integrations/uploads/saved-searches/:id', requirePermission('integrations.view'), ce.deleteSearch);
r.post(
  '/integrations/uploads/:id/versions/:versionId/comment',
  requirePermission('integrations.manage'),
  ce.addVersionComment,
);
r.post('/integrations/uploads/:id/versions/:versionId/approve', permit('admin', 'manager'), ce.approveVersion);
r.get('/integrations/uploads/:id/versions/compare', requirePermission('integrations.view'), ce.compareVersions);
r.post('/integrations/uploads/shares', requirePermission('integrations.view'), ce.createShare);
r.get('/integrations/uploads/shares', requirePermission('integrations.view'), ce.shares);
r.delete('/integrations/uploads/shares/:id', requirePermission('integrations.view'), ce.revokeShare);
r.post('/integrations/uploads/sync/jobs', requirePermission('integrations.manage'), ce.createSyncJob);
r.get('/integrations/uploads/sync/jobs', requirePermission('integrations.view'), ce.syncJobs);
r.post('/integrations/uploads/sync/jobs/:id/retry', requirePermission('integrations.manage'), ce.retrySyncJob);
r.post('/integrations/uploads/sync/jobs/:id/cancel', requirePermission('integrations.manage'), ce.cancelSyncJob);
r.get('/integrations/uploads/analytics/advanced', requirePermission('integrations.view'), ce.advancedAnalytics);
r.post('/integrations/uploads/sync/scan', requirePermission('integrations.view'), c.cloudSyncScan);
r.post('/integrations/uploads/sync/reconcile', permit('admin'), c.cloudSyncReconcile);
r.post('/integrations/uploads/:id/rename', requirePermission('integrations.manage'), c.renameCloudAsset);
r.post('/integrations/uploads/:id/move', requirePermission('integrations.manage'), c.moveCloudAsset);
r.post('/integrations/uploads/:id/copy', requirePermission('integrations.manage'), c.copyCloudAsset);
r.patch('/integrations/uploads/:id/metadata', requirePermission('integrations.manage'), c.updateCloudAssetMetadata);
r.post('/integrations/uploads/:id/lock', requirePermission('integrations.manage'), c.lockCloudAsset);
r.post('/integrations/uploads/:id/unlock', requirePermission('integrations.manage'), c.unlockCloudAsset);
r.get('/integrations/uploads/:id/versions', requirePermission('integrations.view'), c.cloudAssetVersions);
r.post(
  '/integrations/uploads/:id/versions/:versionId/restore',
  requirePermission('integrations.manage'),
  c.restoreCloudAssetVersion,
);
r.post('/integrations/uploads/bulk/copy', requirePermission('integrations.manage'), c.bulkCopyCloudAssets);
r.post('/integrations/uploads/bulk/permanent-delete', permit('admin'), c.bulkPermanentDeleteCloudAssets);
r.delete('/integrations/uploads/:id/soft', requirePermission('integrations.manage'), c.softDeleteCloudAsset);
r.post('/integrations/uploads/:id/restore', requirePermission('integrations.manage'), c.restoreCloudAsset);
r.delete('/integrations/uploads/:id/permanent', permit('admin'), c.permanentDeleteCloudAsset);
r.get('/integrations/uploads/:id/download', requirePermission('integrations.view'), c.cloudDownload);
r.post('/integrations/email', requirePermission('integrations.send'), c.email);
r.post('/integrations/sms', requirePermission('integrations.send'), c.sms);
r.post('/integrations/whatsapp', requirePermission('integrations.send'), c.whatsapp);
r.post('/integrations/maps/distance', requirePermission('integrations.view'), c.distance);
r.post('/integrations/maps/geocode', requirePermission('integrations.view'), c.geocode);
r.post('/integrations/backups', permit('admin'), c.createBackup);
r.get('/integrations/backups', permit('admin'), c.backups);
r.get('/integrations/backups/schedule/status', permit('admin'), c.backupSchedule);
r.post('/integrations/backups/cleanup', permit('admin'), c.cleanupBackups);
r.get('/integrations/backups/:id/download', permit('admin'), c.downloadBackup);
r.post('/integrations/backups/:id/verify', permit('admin'), c.verifyBackup);
r.get('/integrations/backups/:id/preview', permit('admin'), c.previewRestore);
r.post('/integrations/backups/:id/restore', permit('admin'), c.restoreBackup);
r.delete('/integrations/backups/:id', permit('admin'), c.deleteBackup);
r.get('/integrations/customers/template', requirePermission('integrations.view'), c.customerTemplate);
r.get('/integrations/customers/export', requirePermission('integrations.view'), c.exportCustomers);
r.post(
  '/integrations/customers/import',
  requirePermission('integrations.manage'),
  mem.single('file'),
  c.importCustomers,
);
r.get('/integrations/suppliers/template', requirePermission('integrations.view'), c.supplierTemplate);
r.get('/integrations/suppliers/export', requirePermission('integrations.view'), c.exportSuppliers);
r.post(
  '/integrations/suppliers/import',
  requirePermission('integrations.manage'),
  mem.single('file'),
  c.importSuppliers,
);
r.post('/integrations/suppliers/jobs/import', permit('admin'), mem.single('file'), st.createSupplierImportJob);
r.get('/integrations/suppliers/jobs', permit('admin'), st.supplierTransferJobs);
r.get('/integrations/suppliers/jobs/:id', permit('admin'), st.supplierTransferJob);
r.post('/integrations/suppliers/jobs/:id/cancel', permit('admin'), st.cancelSupplierTransferJob);
r.post('/integrations/suppliers/jobs/:id/retry', permit('admin'), st.retrySupplierTransferJob);
r.delete('/integrations/suppliers/jobs/:id', permit('admin'), st.deleteSupplierTransferJob);
r.get('/integrations/suppliers/jobs/:id/file', permit('admin'), st.downloadSupplierTransferFile);
r.get('/integrations/suppliers/jobs/:id/failed', permit('admin'), st.downloadSupplierFailedRows);
r.get('/integrations/suppliers/jobs/:id/validation-report', permit('admin'), st.downloadSupplierValidationReport);
r.get('/integrations/suppliers/export-v2/preview', requirePermission('integrations.view'), sx.previewSupplierExport);
r.get('/integrations/suppliers/export-v2', requirePermission('integrations.view'), sx.supplierExport);
r.post('/integrations/suppliers/export-jobs', permit('admin'), sx.createSupplierExportJob);
r.get('/integrations/suppliers/export-jobs', permit('admin'), sx.supplierExportJobs);
r.post('/integrations/suppliers/export-jobs/:id/cancel', permit('admin'), sx.cancelSupplierExportJob);
r.post('/integrations/suppliers/export-jobs/:id/retry', permit('admin'), sx.retrySupplierExportJob);
r.delete('/integrations/suppliers/export-jobs/:id', permit('admin'), sx.deleteSupplierExportJob);
r.get('/integrations/suppliers/export-jobs/:id/file', permit('admin'), sx.downloadSupplierExportJob);
r.post('/integrations/products/jobs/import', permit('admin'), mem.single('file'), c.createProductImportJob);
r.post('/integrations/products/jobs/export', permit('admin'), c.createProductExportJob);
r.get('/integrations/products/jobs', permit('admin'), c.productTransferJobs);
r.get('/integrations/products/jobs/:id', permit('admin'), c.productTransferJob);
r.post('/integrations/products/jobs/:id/cancel', permit('admin'), c.cancelProductTransferJob);
r.post('/integrations/products/jobs/:id/retry', permit('admin'), c.retryProductTransferJob);
r.delete('/integrations/products/jobs/:id', permit('admin'), c.deleteProductTransferJob);
r.get('/integrations/products/jobs/:id/file', permit('admin'), c.downloadProductJobFile);
r.get('/integrations/products/jobs/:id/failed', permit('admin'), c.downloadProductFailedRows);
r.get('/integrations/products/jobs/:id/validation-report', permit('admin'), c.downloadProductValidationReport);
r.get('/integrations/products/template', requirePermission('integrations.view'), c.productTemplate);
r.post('/integrations/products/import', requirePermission('integrations.manage'), mem.single('file'), c.importProducts);
r.get('/integrations/products/export', requirePermission('integrations.view'), c.exportProducts);
r.get('/integrations/products/export/:type', requirePermission('integrations.view'), c.exportProductLabels);
r.get('/integrations/export/:entity', requirePermission('integrations.view'), c.exportEntity);
r.post('/integrations/import/:entity', requirePermission('integrations.manage'), mem.single('file'), c.importEntity);
r.post('/integrations/payments', requirePermission('payments.create'), c.createPayment);
r.get('/integrations/payments', requirePermission('payments.view'), c.payments);
r.post('/integrations/payments/:id/refund', requirePermission('payments.refund'), c.refund);
r.get('/integrations/webhooks', requirePermission('webhooks.view'), c.webhookList);
r.post('/integrations/webhooks', requirePermission('webhooks.manage'), c.webhookCreate);
r.put('/integrations/webhooks/:id', requirePermission('webhooks.manage'), c.webhookUpdate);
r.delete('/integrations/webhooks/:id', requirePermission('webhooks.manage'), c.webhookDelete);
r.post('/integrations/webhooks/:id/test', requirePermission('webhooks.manage'), c.webhookTest);
r.get('/integrations/webhook-logs', requirePermission('webhooks.view'), c.webhookLogs);
r.post('/integrations/webhook-logs/:id/retry', requirePermission('webhooks.manage'), c.webhookRetry);
export default r;
