import { useEffect, useState } from 'react';
import {
  Cloud,
  Mail,
  MessageSquare,
  MapPinned,
  Database,
  FileSpreadsheet,
  CreditCard,
  Webhook,
  Upload,
  CheckCircle2,
  XCircle,
  Download,
  ShieldCheck,
  Trash2,
  Eye,
  RefreshCw,
  Clock3,
  Play,
  Square,
  History,
  FileWarning,
} from 'lucide-react';
import api from '../services/api';
import { Shell } from './AdminApp';
import SupplierExportPanel from './SupplierExportPanel';
import SupplierTransferCenter from './SupplierTransferCenter';
import CloudinaryUploadPanel from './CloudinaryUploadPanel';
import CloudinarySecurityMonitor from './CloudinarySecurityMonitor';
import CloudinaryFileManager from './CloudinaryFileManager';

const Card = ({ title, icon: Icon, children }) => (
  <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-100 text-green-700 dark:bg-green-950">
        <Icon size={20} />
      </span>
      <h2 className="text-xl font-black">{title}</h2>
    </div>
    {children}
  </section>
);
const fmtBytes = (n) => (!n ? '0 B' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

export default function IntegrationsPage() {
  const [status, setStatus] = useState({}),
    [message, setMessage] = useState(''),
    [backups, setBackups] = useState([]),
    [schedule, setSchedule] = useState(null),
    [payments, setPayments] = useState([]),
    [hooks, setHooks] = useState([]),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [customerFile, setCustomerFile] = useState(null),
    [customerStrategy, setCustomerStrategy] = useState('skip'),
    [customerPreview, setCustomerPreview] = useState(null),
    [supplierFile, setSupplierFile] = useState(null),
    [supplierStrategy, setSupplierStrategy] = useState('skip'),
    [supplierPreview, setSupplierPreview] = useState(null),
    [productFile, setProductFile] = useState(null),
    [productStrategy, setProductStrategy] = useState('skip'),
    [productPreview, setProductPreview] = useState(null),
    [productJobs, setProductJobs] = useState([]),
    [jobFilter, setJobFilter] = useState(''),
    [backgroundMode, setBackgroundMode] = useState(false),
    [productExportFilters, setProductExportFilters] = useState(() => {
      try {
        return {
          ...{
            category: '',
            brand: '',
            supplier: '',
            warehouse: '',
            status: '',
            batch: '',
            lot: '',
            minPrice: '',
            maxPrice: '',
            minStockValue: '',
            maxStockValue: '',
            search: '',
            lowStock: false,
            outOfStock: false,
            expiry: '',
            from: '',
            to: '',
            orientation: 'portrait',
            includeImages: false,
            watermark: 'HMN AGRI TRADE',
            pdfPassword: '',
            labelSize: '90',
            labelLayout: 'a4_12',
            columns:
              'name,sku,barcode,category,brand,unit,supplier,warehouse,purchasePrice,salePrice,availableStock,minimumStock,stockValue,expiryDate,active',
          },
          ...JSON.parse(localStorage.getItem('hmn_product_export_template') || '{}'),
        };
      } catch {
        return {
          category: '',
          brand: '',
          supplier: '',
          warehouse: '',
          status: '',
          batch: '',
          lot: '',
          minPrice: '',
          maxPrice: '',
          minStockValue: '',
          maxStockValue: '',
          search: '',
          lowStock: false,
          outOfStock: false,
          expiry: '',
          from: '',
          to: '',
          orientation: 'portrait',
          includeImages: false,
          watermark: 'HMN AGRI TRADE',
          pdfPassword: '',
          labelSize: '90',
          labelLayout: 'a4_12',
          columns:
            'name,sku,barcode,category,brand,unit,supplier,warehouse,purchasePrice,salePrice,availableStock,minimumStock,stockValue,expiryDate,active',
        };
      }
    });
  const load = async () => {
    const [s, b, sc, p, h, j] = await Promise.all([
      api.get('/integrations/status'),
      api.get('/integrations/backups'),
      api.get('/integrations/backups/schedule/status'),
      api.get('/integrations/payments'),
      api.get('/integrations/webhooks'),
      api.get('/integrations/products/jobs').catch(() => ({ data: { items: [] } })),
    ]);
    setStatus(s.data.providers || {});
    setBackups(b.data.items || b.data || []);
    setSchedule(sc.data);
    setPayments(p.data);
    setHooks(h.data);
    setProductJobs(j.data.items || []);
  };
  useEffect(() => {
    load().catch((e) => setMessage(e.response?.data?.message || e.message));
  }, []);
  useEffect(() => {
    const active = productJobs.some((j) => ['queued', 'processing'].includes(j.status));
    if (!active) return;
    const id = setInterval(() => load().catch(() => {}), 2000);
    return () => clearInterval(id);
  }, [productJobs]);
  const run = async (fn) => {
    try {
      setBusy(true);
      setMessage('Working...');
      await fn();
      setMessage('Completed successfully');
      await load();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const exportFile = async (entity, format = 'xlsx') => {
    const r = await api.get(`/integrations/export/${entity}`, { params: { format }, responseType: 'blob' });
    saveBlob(r.data, `${entity}.${format}`);
  };
  const customerDownload = async (kind, format) => {
    try {
      setBusy(true);
      const url = kind === 'template' ? '/integrations/customers/template' : '/integrations/customers/export';
      const r = await api.get(url, { params: { format }, responseType: 'blob' });
      saveBlob(r.data, kind === 'template' ? `customers-import-template.${format}` : `customers-export.${format}`);
      setMessage(`${kind === 'template' ? 'Template' : 'Customer export'} downloaded`);
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const customerImport = async (confirm = false) => {
    if (!customerFile) return setMessage('Select a customer Excel or CSV file first');
    try {
      setBusy(true);
      setMessage(confirm ? 'Importing customers...' : 'Validating customer file...');
      const fd = new FormData();
      fd.append('file', customerFile);
      fd.append('duplicateStrategy', customerStrategy);
      fd.append('dryRun', confirm ? 'false' : 'true');
      fd.append('confirm', confirm ? 'true' : 'false');
      const r = await api.post('/integrations/customers/import', fd);
      if (confirm) {
        setMessage(
          `Import complete: ${r.data.inserted || 0} inserted, ${r.data.updated || 0} updated, ${r.data.skipped || 0} skipped`,
        );
        setCustomerPreview(null);
        setCustomerFile(null);
      } else {
        setCustomerPreview(r.data);
        setMessage('Validation complete. Review the preview before importing.');
      }
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
      if (e.response?.data?.errors) setCustomerPreview({ errors: e.response.data.errors, preview: [] });
    } finally {
      setBusy(false);
    }
  };
  const downloadCustomerErrors = () => {
    if (!customerPreview?.errors?.length) return;
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const csv = ['row,message', ...customerPreview.errors.map((e) => `${e.row},${esc(e.message)}`)].join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'customer-import-errors.csv');
  };
  const supplierDownload = async (kind, format) => {
    try {
      setBusy(true);
      const url = kind === 'template' ? '/integrations/suppliers/template' : '/integrations/suppliers/export';
      const r = await api.get(url, { params: { format }, responseType: 'blob' });
      saveBlob(r.data, kind === 'template' ? `suppliers-import-template.${format}` : `suppliers-export.${format}`);
      setMessage(`${kind === 'template' ? 'Template' : 'Supplier export'} downloaded`);
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const supplierImport = async (confirm = false) => {
    if (!supplierFile) return setMessage('Select a supplier Excel or CSV file first');
    try {
      setBusy(true);
      setMessage(confirm ? 'Importing suppliers...' : 'Validating supplier file...');
      const fd = new FormData();
      fd.append('file', supplierFile);
      fd.append('duplicateStrategy', supplierStrategy);
      fd.append('dryRun', confirm ? 'false' : 'true');
      fd.append('confirm', confirm ? 'true' : 'false');
      if (confirm && supplierPreview?.confirmationFingerprint)
        fd.append('confirmationFingerprint', supplierPreview.confirmationFingerprint);
      const r = await api.post('/integrations/suppliers/import', fd);
      if (confirm) {
        setMessage(
          `Supplier import complete: ${r.data.inserted || 0} inserted, ${r.data.updated || 0} updated, ${r.data.skipped || 0} skipped`,
        );
        setSupplierPreview(null);
        setSupplierFile(null);
      } else {
        setSupplierPreview(r.data);
        setMessage('Supplier validation complete. Review duplicate matches, errors and warnings before importing.');
      }
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
      if (e.response?.data?.errors) setSupplierPreview({ ...e.response.data, preview: e.response.data.preview || [] });
    } finally {
      setBusy(false);
    }
  };
  const downloadSupplierErrors = () => {
    if (!supplierPreview?.errors?.length) return;
    const csv =
      supplierPreview.errorCsv ||
      [
        'row,message',
        ...supplierPreview.errors.map((e) => `${e.row},"${String(e.message ?? '').replaceAll('"', '""')}"`),
      ].join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'supplier-import-errors.csv');
  };
  const downloadSupplierValidationReport = (format = 'json') => {
    if (!supplierPreview) return;
    const report = supplierPreview.validationReport || supplierPreview;
    if (format === 'csv') {
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      const rows = [
        'type,row,message',
        ...(report.errors || []).map((e) => `error,${e.row},${esc(e.message)}`),
        ...(report.warnings || []).map((e) => `warning,${e.row},${esc(e.message)}`),
      ];
      saveBlob(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }), 'supplier-validation-report.csv');
      return;
    }
    saveBlob(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
      'supplier-validation-report.json',
    );
  };

  const productDownload = async (format) => {
    try {
      setBusy(true);
      const r = await api.get('/integrations/products/template', { params: { format }, responseType: 'blob' });
      saveBlob(r.data, `products-import-template.${format}`);
      setMessage('Product template downloaded');
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const productImport = async (confirm = false) => {
    if (!productFile) return setMessage('Select a product Excel or CSV file first');
    try {
      setBusy(true);
      setMessage(confirm ? 'Importing products...' : 'Validating product file...');
      const fd = new FormData();
      fd.append('file', productFile);
      fd.append('duplicateStrategy', productStrategy);
      fd.append('dryRun', confirm ? 'false' : 'true');
      fd.append('confirm', confirm ? 'true' : 'false');
      if (confirm && productPreview?.confirmationFingerprint)
        fd.append('confirmationFingerprint', productPreview.confirmationFingerprint);
      const r = await api.post('/integrations/products/import', fd);
      if (confirm) {
        setMessage(
          `Product import complete: ${r.data.inserted || 0} inserted, ${r.data.updated || 0} updated, ${r.data.skipped || 0} skipped`,
        );
        setProductPreview(null);
        setProductFile(null);
      } else {
        setProductPreview(r.data);
        setMessage('Product validation complete. Review errors, warnings and duplicate matches before importing.');
      }
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
      if (e.response?.data?.errors) setProductPreview({ ...e.response.data, preview: e.response.data.preview || [] });
    } finally {
      setBusy(false);
    }
  };
  const downloadProductErrors = () => {
    if (!productPreview?.errors?.length) return;
    const csv =
      productPreview.errorCsv ||
      [
        'row,message',
        ...productPreview.errors.map((e) => `${e.row},"${String(e.message ?? '').replaceAll('"', '""')}"`),
      ].join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'product-import-errors.csv');
  };

  const productExport = async (format, preview = false) => {
    try {
      setBusy(true);
      setMessage(`Preparing ${format.toUpperCase()} export...`);
      const params = {
        ...productExportFilters,
        lowStock: productExportFilters.lowStock ? 'true' : '',
        outOfStock: productExportFilters.outOfStock ? 'true' : '',
        includeImages: productExportFilters.includeImages ? 'true' : '',
      };
      const url =
        format === 'barcode' || format === 'qr'
          ? `/integrations/products/export/${format}`
          : '/integrations/products/export';
      const r = await api.get(url, {
        params: format === 'barcode' || format === 'qr' ? params : { ...params, format },
        responseType: 'blob',
      });
      if (preview) {
        const blobUrl = URL.createObjectURL(r.data);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } else {
        const ext = format === 'barcode' || format === 'qr' ? 'pdf' : format;
        saveBlob(r.data, `products-${format}-export.${ext}`);
      }
      setMessage(preview ? 'Print preview opened' : 'Product export downloaded');
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveProductExportTemplate = () => {
    localStorage.setItem('hmn_product_export_template', JSON.stringify(productExportFilters));
    setMessage('Product export settings saved');
  };

  const createBackgroundImport = async () => {
    if (!productFile) return setMessage('Select product file first');
    const fd = new FormData();
    fd.append('file', productFile);
    fd.append('duplicateStrategy', productStrategy);
    const r = await api.post('/integrations/products/jobs/import', fd);
    setMessage(`Import job queued: ${r.data._id}`);
    setProductFile(null);
    await load();
  };
  const createBackgroundExport = async (format) => {
    const r = await api.post('/integrations/products/jobs/export', { format, filters: productExportFilters });
    setMessage(`Export job queued: ${r.data._id}`);
    await load();
  };
  const jobAction = async (job, action) => {
    await api.post(`/integrations/products/jobs/${job._id}/${action}`);
    await load();
  };
  const deleteJob = async (job) => {
    if (!confirm('Delete this history record and its saved files?')) return;
    await api.delete(`/integrations/products/jobs/${job._id}`);
    await load();
  };
  const downloadJob = async (job, kind = 'file', format = 'csv') => {
    const url =
      kind === 'file'
        ? `/integrations/products/jobs/${job._id}/file`
        : kind === 'original'
          ? `/integrations/products/jobs/${job._id}/file?original=true`
          : kind === 'failed'
            ? `/integrations/products/jobs/${job._id}/failed?format=${format}`
            : `/integrations/products/jobs/${job._id}/validation-report?format=${format}`;
    const r = await api.get(url, { responseType: 'blob' });
    saveBlob(
      r.data,
      kind === 'original'
        ? job.originalFileName || 'original-import.xlsx'
        : kind === 'failed'
          ? `failed-rows.${format}`
          : kind === 'report'
            ? `validation-report.${format}`
            : job.fileName || 'product-export',
    );
  };
  const downloadBackup = async (b) => {
    try {
      setMessage('Preparing download...');
      const r = await api.get(`/integrations/backups/${b._id}/download`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = b.name;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage('Backup downloaded');
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    }
  };
  const openPreview = async (b) => {
    try {
      setBusy(true);
      const r = await api.get(`/integrations/backups/${b._id}/preview`);
      setPreview({ ...r.data, record: b });
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!preview) return;
    const typed = window.prompt(`Type the exact backup name to restore:\n${preview.name}`);
    if (typed !== preview.name) return setMessage('Restore cancelled: backup name did not match');
    await run(() => api.post(`/integrations/backups/${preview.backupId}/restore`, { confirm: typed }));
    setPreview(null);
  };
  return (
    <Shell title="Enterprise Integrations">
      {message && (
        <div className="mb-5 rounded-2xl bg-green-50 p-4 font-bold text-green-800 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(status).map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900"
          >
            <span className="font-black capitalize">{k}</span>
            {v ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-slate-400" />}
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Cloudinary uploads" icon={Cloud}>
          <CloudinaryUploadPanel configured={Boolean(status.cloudinary)} />
          <div className="mt-8 border-t pt-8 dark:border-slate-700">
            <CloudinarySecurityMonitor />
            <div className="mt-8 border-t pt-8 dark:border-slate-700">
              <CloudinaryFileManager />
            </div>
          </div>
        </Card>
        <Card title="Email, SMS & WhatsApp" icon={Mail}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              run(() => api.post(`/integrations/${d.channel}`, d));
            }}
            className="space-y-3"
          >
            <select name="channel" className="input">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <input name="to" className="input" placeholder="Recipient email or phone" required />
            <input name="subject" className="input" placeholder="Email subject" />
            <textarea name="message" className="input" rows="3" placeholder="Message" />
            <button
              disabled={busy}
              className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
            >
              <MessageSquare className="mr-2 inline" size={18} />
              Send
            </button>
          </form>
        </Card>
        <Card title="Google Maps" icon={MapPinned}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                const r = await api.post('/integrations/maps/distance', d);
                alert(JSON.stringify(r.data.rows?.[0]?.elements?.[0] || r.data, null, 2));
              });
            }}
            className="space-y-3"
          >
            <input name="origins" className="input" placeholder="Origin" required />
            <input name="destinations" className="input" placeholder="Destination" required />
            <button
              disabled={busy}
              className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
            >
              Calculate distance
            </button>
          </form>
        </Card>
        <Card title="Google Drive & local backups" icon={Database}>
          <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
            <div className="flex justify-between">
              <b>Automatic backup</b>
              <span className={schedule?.enabled ? 'text-green-600' : 'text-slate-500'}>
                {schedule?.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="mt-1 text-slate-500">
              Provider: {schedule?.provider || 'local'} · Every {schedule?.intervalHours || 24} hour(s)
            </div>
            {schedule?.nextRunAt && (
              <div className="text-slate-500">Next: {new Date(schedule.nextRunAt).toLocaleString()}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => api.post('/integrations/backups', { provider: 'local' }))}
              className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white disabled:opacity-50"
            >
              Create local backup
            </button>
            <button
              disabled={busy || !status.drive}
              onClick={() => run(() => api.post('/integrations/backups', { provider: 'drive' }))}
              className="rounded-xl bg-green-700 px-4 py-3 font-black text-white disabled:opacity-50"
            >
              Backup to Drive
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => api.post('/integrations/backups/cleanup', {}))}
              className="rounded-xl border px-4 py-3 font-black"
            >
              <Trash2 className="mr-2 inline" size={17} />
              Clean old
            </button>
          </div>
          {!status.drive && (
            <p className="mt-3 text-sm text-amber-700">
              Google Drive credentials are not configured. Local backups still work.
            </p>
          )}
          <div className="mt-4 max-h-72 overflow-auto rounded-xl border dark:border-slate-700">
            {backups.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No backups yet.</p>
            ) : (
              backups.map((b) => (
                <div key={b._id} className="border-b p-3 text-sm last:border-0 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <b>{b.name}</b>
                      <br />
                      <small>
                        {b.provider} · {b.status} · {fmtBytes(b.size)} · {b.automatic ? 'automatic' : 'manual'}
                      </small>
                    </span>
                    <div className="flex gap-2">
                      <button title="Preview" onClick={() => openPreview(b)} className="text-violet-700">
                        <Eye size={18} />
                      </button>
                      <button title="Download" onClick={() => downloadBackup(b)} className="text-blue-700">
                        <Download size={18} />
                      </button>
                      <button
                        title="Verify"
                        onClick={() => run(() => api.post(`/integrations/backups/${b._id}/verify`))}
                        className="text-green-700"
                      >
                        <ShieldCheck size={18} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() =>
                          window.confirm('Delete this backup?') &&
                          run(() => api.delete(`/integrations/backups/${b._id}`))
                        }
                        className="text-red-700"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card title="Customer Excel / CSV import-export" icon={FileSpreadsheet}>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              disabled={busy}
              onClick={() => customerDownload('template', 'xlsx')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Download Excel template
            </button>
            <button
              disabled={busy}
              onClick={() => customerDownload('template', 'csv')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Download CSV template
            </button>
            <button
              disabled={busy}
              onClick={() => customerDownload('export', 'xlsx')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Export customers XLSX
            </button>
            <button
              disabled={busy}
              onClick={() => customerDownload('export', 'csv')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Export customers CSV
            </button>
          </div>
          <div className="mt-5 space-y-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input"
              onChange={(e) => {
                setCustomerFile(e.target.files?.[0] || null);
                setCustomerPreview(null);
              }}
            />
            <select
              className="input"
              value={customerStrategy}
              onChange={(e) => {
                setCustomerStrategy(e.target.value);
                setCustomerPreview(null);
              }}
            >
              <option value="skip">Skip customers already in database</option>
              <option value="update">Update matching customers</option>
              <option value="error">Stop when duplicate exists</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!customerFile || busy}
                onClick={() => customerImport(false)}
                className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50"
              >
                Validate & preview
              </button>
              {customerPreview && (
                <button
                  type="button"
                  disabled={busy || (customerPreview.invalidRows > 0 && customerStrategy === 'error')}
                  onClick={() => customerImport(true)}
                  className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
                >
                  Confirm import
                </button>
              )}
              {customerPreview?.errors?.length > 0 && (
                <button
                  type="button"
                  onClick={downloadCustomerErrors}
                  className="rounded-xl border px-5 py-3 font-black"
                >
                  Download error CSV
                </button>
              )}
            </div>
          </div>
          {customerPreview && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <b>Total: {customerPreview.total || 0}</b>
                <span>Valid: {customerPreview.valid || 0}</span>
                <span>New: {customerPreview.insertCount || 0}</span>
                <span>Updates: {customerPreview.updateCount || 0}</span>
                <span>Skipped: {customerPreview.skipCount || 0}</span>
              </div>
              {customerPreview.errors?.length > 0 && (
                <div className="mt-4 max-h-40 overflow-auto rounded-xl bg-red-50 p-3 text-red-800">
                  <b>{customerPreview.errors.length} issue(s)</b>
                  {customerPreview.errors.slice(0, 30).map((e, i) => (
                    <p key={`${e.row}-${i}`}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
              {customerPreview.preview?.length > 0 && (
                <div className="mt-4 overflow-auto">
                  <table className="w-full min-w-[620px] text-left">
                    <thead>
                      <tr>
                        <th className="p-2">Row</th>
                        <th>Action</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>CNIC</th>
                        <th>Village</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerPreview.preview.slice(0, 30).map((x) => (
                        <tr key={x.row} className="border-t dark:border-slate-700">
                          <td className="p-2">{x.row}</td>
                          <td className="font-bold capitalize">{x.action}</td>
                          <td>{x.name}</td>
                          <td>{x.phone}</td>
                          <td>{x.cnic}</td>
                          <td>{x.village}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
        <Card title="Supplier Excel / CSV import foundation" icon={FileSpreadsheet}>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              disabled={busy}
              onClick={() => supplierDownload('template', 'xlsx')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Download Excel template
            </button>
            <button
              disabled={busy}
              onClick={() => supplierDownload('template', 'csv')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Download CSV template
            </button>
            <button
              disabled={busy}
              onClick={() => supplierDownload('export', 'xlsx')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Export suppliers XLSX
            </button>
            <button
              disabled={busy}
              onClick={() => supplierDownload('export', 'csv')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Export suppliers CSV
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Validates supplier identity, contact details, CNIC/NTN, location, balances, payment terms and bank-account
            fields. Import uses a MongoDB transaction and rolls back on failure.
          </p>
          <div className="mt-5 space-y-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input"
              onChange={(e) => {
                setSupplierFile(e.target.files?.[0] || null);
                setSupplierPreview(null);
              }}
            />
            <select
              className="input"
              value={supplierStrategy}
              onChange={(e) => {
                setSupplierStrategy(e.target.value);
                setSupplierPreview(null);
              }}
            >
              <option value="skip">Skip suppliers already in database</option>
              <option value="update">Update matching suppliers</option>
              <option value="error">Stop when duplicate exists</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!supplierFile || busy}
                onClick={() => supplierImport(false)}
                className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50"
              >
                Validate & preview
              </button>
              {supplierPreview && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    !supplierPreview.confirmationFingerprint ||
                    (supplierPreview.invalidRows > 0 && supplierStrategy === 'error')
                  }
                  onClick={() => supplierImport(true)}
                  className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
                >
                  Confirm transactional import
                </button>
              )}
              {supplierPreview?.errors?.length > 0 && (
                <button
                  type="button"
                  onClick={downloadSupplierErrors}
                  className="rounded-xl border px-5 py-3 font-black"
                >
                  Download error CSV
                </button>
              )}
              {supplierPreview && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadSupplierValidationReport('csv')}
                    className="rounded-xl border px-5 py-3 font-black"
                  >
                    Validation CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSupplierValidationReport('json')}
                    className="rounded-xl border px-5 py-3 font-black"
                  >
                    Validation JSON
                  </button>
                </>
              )}
            </div>
          </div>
          {supplierPreview && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <b>Total: {supplierPreview.totalRows ?? supplierPreview.total ?? 0}</b>
                <span>Valid: {supplierPreview.validRows ?? supplierPreview.valid ?? 0}</span>
                <span>New: {supplierPreview.insertCount || 0}</span>
                <span>Updates: {supplierPreview.updateCount || 0}</span>
                <span>Skipped: {supplierPreview.skipCount || 0}</span>
                <span>Duplicates: {supplierPreview.duplicateCount || 0}</span>
              </div>
              {supplierPreview.errors?.length > 0 && (
                <div className="mt-4 max-h-40 overflow-auto rounded-xl bg-red-50 p-3 text-red-800">
                  <b>{supplierPreview.errors.length} issue(s)</b>
                  {supplierPreview.errors.slice(0, 40).map((e, i) => (
                    <p key={`${e.row}-${i}`}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
              {supplierPreview.warnings?.length > 0 && (
                <div className="mt-4 max-h-40 overflow-auto rounded-xl bg-amber-50 p-3 text-amber-900">
                  <b>{supplierPreview.warnings.length} warning(s)</b>
                  {supplierPreview.warnings.slice(0, 40).map((e, i) => (
                    <p key={`${e.row}-w-${i}`}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
              {supplierPreview.preview?.length > 0 && (
                <div className="mt-4 overflow-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead>
                      <tr>
                        <th className="p-2">Row</th>
                        <th>Action</th>
                        <th>Matched By</th>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Phone</th>
                        <th>WhatsApp</th>
                        <th>Email</th>
                        <th>CNIC</th>
                        <th>NTN</th>
                        <th>GST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierPreview.preview.slice(0, 50).map((x) => (
                        <tr key={x.row} className="border-t dark:border-slate-700">
                          <td className="p-2">{x.row}</td>
                          <td className="font-bold capitalize">{x.action}</td>
                          <td>{x.matchedBy || '-'}</td>
                          <td>{x.name}</td>
                          <td>{x.company}</td>
                          <td>{x.phone}</td>
                          <td>{x.whatsapp}</td>
                          <td>{x.email}</td>
                          <td>{x.cnic}</td>
                          <td>{x.ntn}</td>
                          <td>{x.gstNumber}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
        <Card title="Product Excel / CSV import foundation" icon={FileSpreadsheet}>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              disabled={busy}
              onClick={() => productDownload('xlsx')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Download Excel template
            </button>
            <button
              disabled={busy}
              onClick={() => productDownload('csv')}
              className="rounded-xl border px-3 py-2 font-bold"
            >
              Download CSV template
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Validates name, SKU, barcode, QR code, category, brand, unit, supplier, warehouse, prices and stock.
            Supplier and warehouse must already exist.
          </p>
          <div className="mt-5 space-y-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input"
              onChange={(e) => {
                setProductFile(e.target.files?.[0] || null);
                setProductPreview(null);
              }}
            />
            <select
              className="input"
              value={productStrategy}
              onChange={(e) => {
                setProductStrategy(e.target.value);
                setProductPreview(null);
              }}
            >
              <option value="skip">Skip products already in database</option>
              <option value="update">Update matching products</option>
              <option value="error">Stop when duplicate exists</option>
            </select>
            <label className="mt-3 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={backgroundMode} onChange={(e) => setBackgroundMode(e.target.checked)} />
              Use background processing for large files
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!productFile || busy}
                onClick={() => (backgroundMode ? createBackgroundImport() : productImport(false))}
                className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50"
              >
                {backgroundMode ? 'Queue background import' : 'Validate & preview'}
              </button>
              {productPreview && !backgroundMode && (
                <button
                  type="button"
                  disabled={busy || (productPreview.invalidRows > 0 && productStrategy === 'error')}
                  onClick={() => productImport(true)}
                  className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
                >
                  Confirm transactional import
                </button>
              )}
              {productPreview?.errors?.length > 0 && (
                <button
                  type="button"
                  onClick={downloadProductErrors}
                  className="rounded-xl border px-5 py-3 font-black"
                >
                  Download error CSV
                </button>
              )}
            </div>
          </div>
          {productPreview && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <b>Total: {productPreview.total || 0}</b>
                <span>Valid: {productPreview.valid || 0}</span>
                <span>New: {productPreview.insertCount || 0}</span>
                <span>Updates: {productPreview.updateCount || 0}</span>
                <span>Skipped: {productPreview.skipCount || 0}</span>
                <span>Duplicates: {productPreview.duplicateCount || 0}</span>
              </div>
              {productPreview.errors?.length > 0 && (
                <div className="mt-4 max-h-40 overflow-auto rounded-xl bg-red-50 p-3 text-red-800">
                  <b>{productPreview.errors.length} issue(s)</b>
                  {productPreview.errors.slice(0, 40).map((e, i) => (
                    <p key={`${e.row}-${i}`}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
              {productPreview.warnings?.length > 0 && (
                <div className="mt-4 max-h-40 overflow-auto rounded-xl bg-amber-50 p-3 text-amber-900">
                  <b>{productPreview.warnings.length} warning(s)</b>
                  {productPreview.warnings.slice(0, 40).map((e, i) => (
                    <p key={`${e.row}-w-${i}`}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
              {productPreview.preview?.length > 0 && (
                <div className="mt-4 overflow-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead>
                      <tr>
                        <th className="p-2">Row</th>
                        <th>Action</th>
                        <th>Matched by</th>
                        <th>Name</th>
                        <th>SKU</th>
                        <th>Barcode</th>
                        <th>Category</th>
                        <th>Buy</th>
                        <th>Sell</th>
                        <th>Stock</th>
                        <th>Warehouse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productPreview.preview.slice(0, 50).map((x) => (
                        <tr key={x.row} className="border-t dark:border-slate-700">
                          <td className="p-2">{x.row}</td>
                          <td className="font-bold capitalize">{x.action}</td>
                          <td>{x.matchedBy || '-'}</td>
                          <td>{x.name}</td>
                          <td>{x.sku}</td>
                          <td>{x.barcode}</td>
                          <td>{x.category}</td>
                          <td>{x.purchasePrice}</td>
                          <td>{x.salePrice}</td>
                          <td>{x.availableStock}</td>
                          <td className="text-xs">{x.warehouse}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Product exports — enterprise v2" icon={Download}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              className="input"
              placeholder="Search name, SKU, barcode..."
              value={productExportFilters.search}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, search: e.target.value })}
            />
            <select
              className="input"
              value={productExportFilters.category}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, category: e.target.value })}
            >
              <option value="">All categories</option>
              {['Cotton', 'Wheat', 'DAP', 'Urea', 'Bardana', 'Seeds', 'Pesticides', 'Other'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Brand contains..."
              value={productExportFilters.brand}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, brand: e.target.value })}
            />
            <input
              className="input"
              placeholder="Supplier ID"
              value={productExportFilters.supplier}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, supplier: e.target.value })}
            />
            <input
              className="input"
              placeholder="Warehouse ID"
              value={productExportFilters.warehouse}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, warehouse: e.target.value })}
            />
            <select
              className="input"
              value={productExportFilters.status}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, status: e.target.value })}
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <input
              className="input"
              placeholder="Batch number contains..."
              value={productExportFilters.batch}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, batch: e.target.value })}
            />
            <input
              className="input"
              placeholder="Lot number contains..."
              value={productExportFilters.lot}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, lot: e.target.value })}
            />
            <select
              className="input"
              value={productExportFilters.expiry}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, expiry: e.target.value })}
            >
              <option value="">Any expiry</option>
              <option value="soon">Expiring in 30 days</option>
              <option value="expired">Expired</option>
            </select>
            <input
              className="input"
              type="number"
              placeholder="Minimum sale price"
              value={productExportFilters.minPrice}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, minPrice: e.target.value })}
            />
            <input
              className="input"
              type="number"
              placeholder="Maximum sale price"
              value={productExportFilters.maxPrice}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, maxPrice: e.target.value })}
            />
            <input
              className="input"
              type="number"
              placeholder="Minimum stock value"
              value={productExportFilters.minStockValue}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, minStockValue: e.target.value })}
            />
            <input
              className="input"
              type="number"
              placeholder="Maximum stock value"
              value={productExportFilters.maxStockValue}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, maxStockValue: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                type="date"
                value={productExportFilters.from}
                onChange={(e) => setProductExportFilters({ ...productExportFilters, from: e.target.value })}
              />
              <input
                className="input"
                type="date"
                value={productExportFilters.to}
                onChange={(e) => setProductExportFilters({ ...productExportFilters, to: e.target.value })}
              />
            </div>
            <select
              className="input"
              value={productExportFilters.orientation}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, orientation: e.target.value })}
            >
              <option value="portrait">PDF portrait</option>
              <option value="landscape">PDF landscape</option>
            </select>
            <input
              className="input"
              placeholder="PDF watermark"
              value={productExportFilters.watermark}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, watermark: e.target.value })}
            />
            <input
              className="input"
              type="password"
              placeholder="Optional PDF password"
              value={productExportFilters.pdfPassword}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, pdfPassword: e.target.value })}
            />
            <select
              className="input"
              value={productExportFilters.labelLayout}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, labelLayout: e.target.value })}
            >
              <option value="a4_12">A4 — 12 labels</option>
              <option value="a4_21">A4 — 21 labels</option>
              <option value="a4_24">A4 — 24 labels</option>
            </select>
            <input
              className="input"
              type="number"
              min="40"
              max="160"
              placeholder="Label size"
              value={productExportFilters.labelSize}
              onChange={(e) => setProductExportFilters({ ...productExportFilters, labelSize: e.target.value })}
            />
          </div>
          <label className="mt-3 block text-sm font-bold">Export columns (comma-separated)</label>
          <textarea
            className="input mt-1 min-h-20"
            value={productExportFilters.columns}
            onChange={(e) => setProductExportFilters({ ...productExportFilters, columns: e.target.value })}
          />
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
            <label>
              <input
                type="checkbox"
                className="mr-2"
                checked={productExportFilters.lowStock}
                onChange={(e) => setProductExportFilters({ ...productExportFilters, lowStock: e.target.checked })}
              />
              Low stock
            </label>
            <label>
              <input
                type="checkbox"
                className="mr-2"
                checked={productExportFilters.outOfStock}
                onChange={(e) => setProductExportFilters({ ...productExportFilters, outOfStock: e.target.checked })}
              />
              Out of stock
            </label>
            <label>
              <input
                type="checkbox"
                className="mr-2"
                checked={productExportFilters.includeImages}
                onChange={(e) => setProductExportFilters({ ...productExportFilters, includeImages: e.target.checked })}
              />
              Include product images in PDF
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {['xlsx', 'csv', 'pdf', 'json', 'xml', 'zip', 'barcode', 'qr'].map((x) => (
              <button
                key={x}
                disabled={busy}
                onClick={() => productExport(x)}
                className="rounded-xl border px-3 py-3 font-black uppercase hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
              >
                {x}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => createBackgroundExport('xlsx')}
              disabled={busy}
              className="rounded-xl bg-indigo-700 px-4 py-2 font-bold text-white"
            >
              Queue large XLSX export
            </button>
            <button
              onClick={() => productExport('pdf', true)}
              disabled={busy}
              className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white"
            >
              PDF print preview
            </button>
            <button
              onClick={() => productExport('barcode', true)}
              disabled={busy}
              className="rounded-xl border px-4 py-2 font-bold"
            >
              Barcode preview
            </button>
            <button
              onClick={() => productExport('qr', true)}
              disabled={busy}
              className="rounded-xl border px-4 py-2 font-bold"
            >
              QR preview
            </button>
            <button
              onClick={saveProductExportTemplate}
              className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white"
            >
              Save export settings
            </button>
          </div>
        </Card>
        <SupplierExportPanel />
        <SupplierTransferCenter />
        <Card title="Product import/export jobs & history" icon={History}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className="input max-w-48" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
              <option value="">All jobs</option>
              <option value="import">Imports</option>
              <option value="export">Exports</option>
            </select>
            <button onClick={() => load()} className="rounded-xl border px-4 py-2 font-bold">
              <RefreshCw className="mr-1 inline" size={16} />
              Refresh
            </button>
          </div>
          <div className="max-h-[34rem] space-y-3 overflow-y-auto">
            {productJobs
              .filter((j) => !jobFilter || j.type === jobFilter)
              .map((j) => (
                <div key={j._id} className="rounded-2xl border p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <b className="uppercase">{j.type}</b> · {j.originalFileName || j.fileName || j.format}
                      <div className="text-xs text-slate-500">
                        {new Date(j.createdAt).toLocaleString()} · {j.createdBy?.name || 'Admin'}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black uppercase dark:bg-slate-800">
                      {j.status}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-green-600 transition-all" style={{ width: `${j.progress || 0}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span>{j.stage || 'Queued'}</span>
                    <b>{j.progress || 0}%</b>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <span>
                      Processed: {j.processedRows || 0}/{j.totalRows || 0}
                    </span>
                    <span>Success: {j.successRows || 0}</span>
                    <span>Failed: {j.failedRows || 0}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {j.filePath && (
                      <button onClick={() => downloadJob(j)} className="rounded-lg border px-3 py-1 text-xs font-bold">
                        Download file
                      </button>
                    )}
                    {j.originalFilePath && (
                      <button
                        onClick={() => downloadJob(j, 'original')}
                        className="rounded-lg border px-3 py-1 text-xs font-bold"
                      >
                        Original file
                      </button>
                    )}
                    {j.failedRows > 0 && (
                      <>
                        <button
                          onClick={() => downloadJob(j, 'failed', 'csv')}
                          className="rounded-lg border px-3 py-1 text-xs font-bold"
                        >
                          Failed CSV
                        </button>
                        <button
                          onClick={() => downloadJob(j, 'failed', 'xlsx')}
                          className="rounded-lg border px-3 py-1 text-xs font-bold"
                        >
                          Failed Excel
                        </button>
                      </>
                    )}
                    {(j.errorDetails?.length || j.warnings?.length) > 0 && (
                      <>
                        <button
                          onClick={() => downloadJob(j, 'report', 'pdf')}
                          className="rounded-lg border px-3 py-1 text-xs font-bold"
                        >
                          Validation PDF
                        </button>
                        <button
                          onClick={() => downloadJob(j, 'report', 'xlsx')}
                          className="rounded-lg border px-3 py-1 text-xs font-bold"
                        >
                          Validation Excel
                        </button>
                      </>
                    )}
                    {['queued', 'processing'].includes(j.status) && (
                      <button
                        onClick={() => jobAction(j, 'cancel')}
                        className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                      >
                        <Square className="mr-1 inline" size={12} />
                        Cancel
                      </button>
                    )}
                    {['failed', 'cancelled'].includes(j.status) && (
                      <button
                        onClick={() => jobAction(j, 'retry')}
                        className="rounded-lg bg-green-50 px-3 py-1 text-xs font-bold text-green-700"
                      >
                        <Play className="mr-1 inline" size={12} />
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => deleteJob(j)}
                      className="rounded-lg border px-3 py-1 text-xs font-bold text-red-700"
                    >
                      <Trash2 className="inline" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            {!productJobs.length && <p className="text-sm text-slate-500">No product import/export history yet.</p>}
          </div>
        </Card>
        <Card title="Other Excel / CSV exports" icon={FileSpreadsheet}>
          <div className="grid grid-cols-2 gap-2">
            {['suppliers', 'products', 'sales', 'purchases', 'expenses', 'inventory'].map((x) => (
              <button
                key={x}
                onClick={() => exportFile(x)}
                className="rounded-xl border px-3 py-2 font-bold capitalize"
              >
                Export {x}
              </button>
            ))}
          </div>
        </Card>
        <Card title="Payment gateways" icon={CreditCard}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              d.amount = Number(d.amount);
              run(() => api.post('/integrations/payments', d));
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <select name="gateway" className="input">
              <option>stripe</option>
              <option>paypal</option>
              <option>jazzcash</option>
              <option>easypaisa</option>
              <option>bank</option>
            </select>
            <input name="amount" type="number" className="input" placeholder="Amount" required />
            <input name="currency" className="input" defaultValue="PKR" />
            <button
              disabled={busy}
              className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
            >
              Create payment
            </button>
          </form>
          <div className="mt-4 max-h-44 overflow-auto">
            {payments.map((p) => (
              <div key={p._id} className="flex justify-between border-b py-2 text-sm">
                <span>
                  {p.reference} · {p.gateway}
                </span>
                <b>
                  {p.status} · {p.amount}
                </b>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Webhooks & automation" icon={Webhook}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              d.events = d.events
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
              run(() => api.post('/integrations/webhooks', d));
            }}
            className="space-y-3"
          >
            <input name="name" className="input" placeholder="Webhook name" required />
            <input name="url" className="input" placeholder="https://example.com/webhook" required />
            <input name="events" className="input" placeholder="sale.created,payment.paid" />
            <button
              disabled={busy}
              className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
            >
              Create webhook
            </button>
          </form>
          <div className="mt-4">
            {hooks.map((h) => (
              <div key={h._id} className="flex items-center justify-between border-b py-2 text-sm">
                <span>
                  {h.name}
                  <br />
                  <small>{h.url}</small>
                </span>
                <button
                  onClick={() => run(() => api.post(`/integrations/webhooks/${h._id}/test`))}
                  className="font-bold text-green-700"
                >
                  Test
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {preview && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">Restore preview</h2>
              <button onClick={() => setPreview(null)} className="rounded-xl border px-3 py-2">
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {preview.name} · {new Date(preview.createdAt).toLocaleString()}
            </p>
            <div className="mt-5 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Collection</th>
                    <th>Current</th>
                    <th>Backup</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((x) => (
                    <tr key={x.collection} className="border-t dark:border-slate-700">
                      <td className="p-2 font-bold">{x.collection}</td>
                      <td>{x.current}</td>
                      <td>{x.incoming}</td>
                      <td className={x.difference < 0 ? 'text-red-600' : 'text-green-600'}>{x.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              Restore replaces selected database collections. The server automatically creates a pre-restore safety
              backup first.
            </div>
            <button onClick={restore} className="mt-4 rounded-xl bg-red-700 px-5 py-3 font-black text-white">
              <RefreshCw className="mr-2 inline" size={18} />
              Restore this backup
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
