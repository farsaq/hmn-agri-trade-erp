import { Router } from 'express';
import { protect, requirePermission, permit } from '../middleware/auth.js';
import * as f from '../controllers/finance.js';
const r = Router();
r.get('/public/invoices/:id/:token.pdf', f.publicInvoicePdf);
r.use(protect);
r.get('/expense-categories', requirePermission('expenses.view'), f.listExpenseCategories);
r.post('/expense-categories', requirePermission('expenses.create'), f.createExpenseCategory);
r.get('/expenses-professional', requirePermission('expenses.view'), f.listExpenses);
r.post(
  '/expenses-professional',
  requirePermission('expenses.create'),
  f.expenseUpload.array('attachments', 8),
  f.createExpense,
);
r.put(
  '/expenses-professional/:id',
  requirePermission('expenses.update'),
  f.expenseUpload.array('attachments', 8),
  f.updateExpense,
);
r.post('/expenses-professional/:id/approve', permit('admin', 'manager', 'accountant'), f.approveExpense);
r.delete('/expenses-professional/:id', requirePermission('expenses.delete'), f.deleteExpense);
r.get('/reports/advanced', requirePermission('reports.view'), f.advancedReports);
r.get('/reports/export/:format', requirePermission('reports.view'), f.exportReport);
r.get('/invoices/:id/pdf', requirePermission('sales.view'), f.invoicePdf);
r.post('/invoices/:id/email', requirePermission('sales.view'), f.emailInvoice);
r.post('/invoices/:id/whatsapp', requirePermission('sales.view'), f.whatsappInvoice);
r.post('/sales/:id/receipts', requirePermission('sales.update'), f.createReceipt);
r.get('/receipts/:id/pdf', requirePermission('sales.view'), f.receiptPdf);
r.get('/quotations/:id/pdf', requirePermission('sales.view'), f.quotationPdf);
r.get('/challans/:id/pdf', requirePermission('sales.view'), f.challanPdf);
export default r;
