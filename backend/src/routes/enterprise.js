import { Router } from 'express';
import { protect, requirePermission, permit } from '../middleware/auth.js';
import * as e from '../controllers/enterprise.js';
const r = Router();
r.use(protect);
const modules = {
  'inventory-movements': 'inventory',
  vehicles: 'inventory',
  payments: 'ledger',
  attachments: 'settings',
  backups: 'settings',
  integrations: 'settings',
  'company-profile': 'settings',
};
for (const [type, module] of Object.entries(modules)) {
  r.get(`/${type}`, requirePermission(`${module}.view`), e.listEnterprise(type));
  r.post(`/${type}`, requirePermission(`${module}.create`), e.createEnterprise(type));
  r.put(`/${type}/:id`, requirePermission(`${module}.update`), e.updateEnterprise(type));
  r.delete(`/${type}/:id`, requirePermission(`${module}.delete`), e.deleteEnterprise(type));
}
r.get('/invoices/:id', requirePermission('sales.view'), e.invoice);
r.post('/restore', permit('admin'), e.restore);
r.patch('/notifications/:id/read', requirePermission('notifications.view'), e.markNotification);
r.post('/ai/query', requirePermission('reports.view'), e.aiQuery);
r.get('/system/health', permit('admin', 'manager'), e.systemHealth);
export default r;
