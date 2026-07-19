import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, History, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import api from '../services/api';

const defaults = {
  search: '',
  supplierCode: '',
  company: '',
  supplierType: '',
  businessType: '',
  village: '',
  taluka: '',
  district: '',
  city: '',
  province: '',
  country: '',
  warehouse: '',
  paymentTerms: '',
  paymentMethod: '',
  currency: '',
  status: '',
  preferredSupplier: '',
  blacklisted: '',
  hasGst: '',
  hasNtn: '',
  minCreditLimit: '',
  maxCreditLimit: '',
  minOutstanding: '',
  maxOutstanding: '',
  registrationFrom: '',
  registrationTo: '',
  lastPurchaseFrom: '',
  lastPurchaseTo: '',
  sortBy: 'name',
  sortDir: 'asc',
  orientation: 'portrait',
  watermark: 'HMN AGRI TRADE',
  pdfPassword: '',
  ids: '',
  columns:
    'supplierCode,name,company,supplierType,businessType,phone,whatsapp,email,cnic,ntn,gstNumber,village,taluka,district,city,province,country,paymentTerms,paymentMethod,currency,creditLimit,openingBalance,currentBalance,status,preferredSupplier,blacklisted,registrationDate,lastPurchaseDate,defaultWarehouse',
};
const fields = [
  ['search', 'Search'],
  ['supplierCode', 'Supplier code'],
  ['company', 'Company'],
  ['supplierType', 'Supplier type'],
  ['businessType', 'Business type'],
  ['village', 'Village'],
  ['taluka', 'Taluka'],
  ['district', 'District'],
  ['city', 'City'],
  ['province', 'Province'],
  ['country', 'Country'],
  ['warehouse', 'Warehouse ID'],
  ['paymentTerms', 'Payment terms'],
  ['paymentMethod', 'Payment method'],
  ['currency', 'Currency'],
  ['minCreditLimit', 'Min credit limit'],
  ['maxCreditLimit', 'Max credit limit'],
  ['minOutstanding', 'Min outstanding'],
  ['maxOutstanding', 'Max outstanding'],
  ['registrationFrom', 'Registration from', 'date'],
  ['registrationTo', 'Registration to', 'date'],
  ['lastPurchaseFrom', 'Last purchase from', 'date'],
  ['lastPurchaseTo', 'Last purchase to', 'date'],
];
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function SupplierExportPanel() {
  const [filters, setFilters] = useState(() => {
      try {
        return { ...defaults, ...JSON.parse(localStorage.getItem('hmn_supplier_export_template') || '{}') };
      } catch {
        return defaults;
      }
    }),
    [preview, setPreview] = useState(null),
    [jobs, setJobs] = useState([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const params = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== false && v != null)),
    [filters],
  );
  const loadJobs = async () => {
    const r = await api.get('/integrations/suppliers/export-jobs');
    setJobs(r.data.items || []);
  };
  useEffect(() => {
    loadJobs().catch(() => {});
  }, []);
  useEffect(() => {
    if (!jobs.some((j) => ['queued', 'processing'].includes(j.status))) return;
    const id = setInterval(() => loadJobs().catch(() => {}), 2000);
    return () => clearInterval(id);
  }, [jobs]);
  const update = (k, v) => setFilters((x) => ({ ...x, [k]: v }));
  const run = async (fn) => {
    try {
      setBusy(true);
      setMessage('Working...');
      await fn();
      setMessage('Completed successfully');
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const showPreview = () =>
    run(async () => {
      const r = await api.get('/integrations/suppliers/export-v2/preview', { params });
      setPreview(r.data);
    });
  const download = (format) =>
    run(async () => {
      const r = await api.get('/integrations/suppliers/export-v2', {
        params: { ...params, format },
        responseType: 'blob',
      });
      saveBlob(r.data, `suppliers-export.${format}`);
    });
  const queue = (format) =>
    run(async () => {
      await api.post('/integrations/suppliers/export-jobs', { format, filters: params });
      await loadJobs();
    });
  const jobAction = (j, action) =>
    run(async () => {
      if (action === 'download') {
        const r = await api.get(`/integrations/suppliers/export-jobs/${j._id}/file`, { responseType: 'blob' });
        saveBlob(r.data, j.fileName || 'suppliers-export');
        return;
      }
      await api.post(`/integrations/suppliers/export-jobs/${j._id}/${action}`);
      await loadJobs();
    });
  const deleteJob = (j) =>
    run(async () => {
      await api.delete(`/integrations/suppliers/export-jobs/${j._id}`);
      await loadJobs();
    });
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Supplier Enterprise Export</h2>
          <p className="text-sm text-slate-500">
            Excel, CSV, PDF, JSON, XML and ZIP with filters, selected IDs, custom columns, preview and background jobs.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem('hmn_supplier_export_template', JSON.stringify(filters));
            setMessage('Export settings saved');
          }}
          className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white"
        >
          Save settings
        </button>
      </div>
      {message && (
        <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800">{message}</div>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(([k, label, type]) => (
          <input
            key={k}
            className="input"
            type={type || 'text'}
            placeholder={label}
            value={filters[k]}
            onChange={(e) => update(k, e.target.value)}
          />
        ))}
        <select className="input" value={filters.status} onChange={(e) => update('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          className="input"
          value={filters.preferredSupplier}
          onChange={(e) => update('preferredSupplier', e.target.value)}
        >
          <option value="">Preferred: all</option>
          <option value="true">Preferred only</option>
          <option value="false">Not preferred</option>
        </select>
        <select className="input" value={filters.blacklisted} onChange={(e) => update('blacklisted', e.target.value)}>
          <option value="">Blacklist: all</option>
          <option value="true">Blacklisted</option>
          <option value="false">Not blacklisted</option>
        </select>
        <select className="input" value={filters.hasGst} onChange={(e) => update('hasGst', e.target.value)}>
          <option value="">GST: all</option>
          <option value="true">Has GST</option>
          <option value="false">No GST</option>
        </select>
        <select className="input" value={filters.hasNtn} onChange={(e) => update('hasNtn', e.target.value)}>
          <option value="">NTN: all</option>
          <option value="true">Has NTN</option>
          <option value="false">No NTN</option>
        </select>
        <select className="input" value={filters.sortBy} onChange={(e) => update('sortBy', e.target.value)}>
          <option value="name">Sort by name</option>
          <option value="company">Company</option>
          <option value="currentBalance">Outstanding</option>
          <option value="registrationDate">Registration date</option>
          <option value="lastPurchaseDate">Last purchase</option>
          <option value="supplierCode">Supplier code</option>
        </select>
        <select className="input" value={filters.sortDir} onChange={(e) => update('sortDir', e.target.value)}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <select className="input" value={filters.orientation} onChange={(e) => update('orientation', e.target.value)}>
          <option value="portrait">PDF portrait</option>
          <option value="landscape">PDF landscape</option>
        </select>
        <input
          className="input"
          placeholder="PDF watermark"
          value={filters.watermark}
          onChange={(e) => update('watermark', e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Optional PDF password"
          value={filters.pdfPassword}
          onChange={(e) => update('pdfPassword', e.target.value)}
        />
      </div>
      <label className="mt-4 block text-sm font-bold">Selected supplier IDs (comma-separated, optional)</label>
      <textarea className="input mt-1 min-h-16" value={filters.ids} onChange={(e) => update('ids', e.target.value)} />
      <label className="mt-4 block text-sm font-bold">Export columns (comma-separated)</label>
      <textarea
        className="input mt-1 min-h-20"
        value={filters.columns}
        onChange={(e) => update('columns', e.target.value)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={showPreview}
          className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white"
        >
          <Eye className="mr-1 inline" size={16} />
          Preview
        </button>
        {['xlsx', 'csv', 'pdf', 'json', 'xml', 'zip'].map((f) => (
          <button
            key={f}
            disabled={busy}
            onClick={() => download(f)}
            className="rounded-xl border px-4 py-2 font-black uppercase"
          >
            <Download className="mr-1 inline" size={15} />
            {f}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => queue('xlsx')}
          className="rounded-xl bg-indigo-700 px-4 py-2 font-bold text-white"
        >
          Queue large XLSX
        </button>
      </div>
      {preview && (
        <div className="mt-5 rounded-2xl border p-4 dark:border-slate-700">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(preview.summary || {}).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs uppercase text-slate-500">{k}</div>
                <b>{typeof v === 'number' ? v.toLocaleString() : v}</b>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {(preview.columns || []).slice(0, 8).map((c) => (
                    <th key={c} className="p-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(preview.sample || []).slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t dark:border-slate-700">
                    {(preview.columns || []).slice(0, 8).map((c) => (
                      <td key={c} className="p-2">
                        {String(r[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-black">
            <History className="mr-1 inline" size={18} />
            Supplier export history
          </h3>
          <button onClick={() => loadJobs()} className="rounded-lg border px-3 py-1 text-sm font-bold">
            <RefreshCw className="inline" size={14} /> Refresh
          </button>
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {jobs.map((j) => (
            <div key={j._id} className="rounded-2xl border p-4 dark:border-slate-700">
              <div className="flex justify-between gap-2">
                <div>
                  <b>{String(j.format || '').toUpperCase()} export</b>
                  <div className="text-xs text-slate-500">
                    {new Date(j.createdAt).toLocaleString()} · {j.createdBy?.name || 'Admin'}
                  </div>
                </div>
                <span className="text-xs font-black uppercase">{j.status}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-2 rounded-full bg-green-600" style={{ width: `${j.progress || 0}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {j.filePath && (
                  <button
                    onClick={() => jobAction(j, 'download')}
                    className="rounded-lg border px-3 py-1 text-xs font-bold"
                  >
                    Download
                  </button>
                )}
                {['queued', 'processing'].includes(j.status) && (
                  <button
                    onClick={() => jobAction(j, 'cancel')}
                    className="rounded-lg border px-3 py-1 text-xs font-bold"
                  >
                    <Square className="inline" size={12} /> Cancel
                  </button>
                )}
                {['failed', 'cancelled'].includes(j.status) && (
                  <button
                    onClick={() => jobAction(j, 'retry')}
                    className="rounded-lg border px-3 py-1 text-xs font-bold"
                  >
                    <Play className="inline" size={12} /> Retry
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
          {!jobs.length && <p className="text-sm text-slate-500">No supplier export history yet.</p>}
        </div>
      </div>
    </section>
  );
}
