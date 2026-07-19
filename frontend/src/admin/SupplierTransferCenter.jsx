import { useEffect, useMemo, useState } from 'react';
import { Download, FileWarning, History, Play, RefreshCw, Square, Trash2, UploadCloud } from 'lucide-react';
import api from '../services/api';

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

export default function SupplierTransferCenter() {
  const [file, setFile] = useState(null),
    [strategy, setStrategy] = useState('skip'),
    [jobs, setJobs] = useState([]),
    [type, setType] = useState(''),
    [status, setStatus] = useState(''),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const query = useMemo(
    () => Object.fromEntries(Object.entries({ type, status, search, limit: 100 }).filter(([, v]) => v !== '')),
    [type, status, search],
  );
  const load = async () => {
    const r = await api.get('/integrations/suppliers/jobs', { params: query });
    setJobs(r.data.items || []);
  };
  useEffect(() => {
    load().catch(() => {});
  }, [type, status]);
  useEffect(() => {
    if (!jobs.some((j) => ['queued', 'processing'].includes(j.status))) return;
    const t = setInterval(() => load().catch(() => {}), 1800);
    return () => clearInterval(t);
  }, [jobs]);
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
  const queueImport = () =>
    run(async () => {
      if (!file) throw new Error('Select a supplier Excel or CSV file first');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('duplicateStrategy', strategy);
      await api.post('/integrations/suppliers/jobs/import', fd);
      setFile(null);
      await load();
    });
  const action = (job, name) =>
    run(async () => {
      await api.post(`/integrations/suppliers/jobs/${job._id}/${name}`);
      await load();
    });
  const remove = (job) =>
    run(async () => {
      await api.delete(`/integrations/suppliers/jobs/${job._id}`);
      await load();
    });
  const download = async (job, kind = 'file', format = 'csv') =>
    run(async () => {
      let url = `/integrations/suppliers/jobs/${job._id}/file`,
        params = {};
      let name = job.fileName || job.originalFileName || 'supplier-transfer';
      if (kind === 'original') {
        params.original = true;
        name = job.originalFileName || 'supplier-import.xlsx';
      }
      if (kind === 'failed') {
        url = `/integrations/suppliers/jobs/${job._id}/failed`;
        params.format = format;
        name = `supplier-failed-rows.${format}`;
      }
      if (kind === 'report') {
        url = `/integrations/suppliers/jobs/${job._id}/validation-report`;
        params.format = format;
        name = `supplier-validation-report.${format}`;
      }
      const r = await api.get(url, { params, responseType: 'blob' });
      saveBlob(r.data, name);
    });
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Supplier Import/Export Enterprise Center</h2>
          <p className="text-sm text-slate-500">
            Background jobs, persistent history, progress, failed-row downloads, validation reports, retry and cancel.
          </p>
        </div>
        <button onClick={() => load()} className="rounded-xl border px-4 py-2 font-bold">
          <RefreshCw className="mr-1 inline" size={16} />
          Refresh
        </button>
      </div>
      {message && (
        <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800">{message}</div>
      )}
      <div className="mt-5 rounded-2xl border p-4 dark:border-slate-700">
        <h3 className="font-black">
          <UploadCloud className="mr-1 inline" size={18} />
          Queue large supplier import
        </h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="skip">Skip duplicates</option>
            <option value="update">Update duplicates</option>
            <option value="error">Stop on duplicates</option>
          </select>
          <button
            disabled={busy || !file}
            onClick={queueImport}
            className="rounded-xl bg-green-700 px-5 py-3 font-black text-white disabled:opacity-50"
          >
            Queue import
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Supports up to 25,000 rows. Import runs transactionally and rolls back on failure.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <select className="input max-w-48" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="import">Imports</option>
          <option value="export">Exports</option>
        </select>
        <select className="input max-w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['queued', 'processing', 'completed', 'partial', 'failed', 'cancelled'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          className="input max-w-sm"
          placeholder="Search file or stage"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => load()} className="rounded-xl border px-4 py-2 font-bold">
          Apply
        </button>
      </div>
      <div className="mt-5 max-h-[42rem] space-y-3 overflow-y-auto">
        {jobs.map((j) => {
          const remaining = Math.max(0, (j.totalRows || 0) - (j.processedRows || 0));
          return (
            <div key={j._id} className="rounded-2xl border p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <b className="uppercase">{j.type}</b> ·{' '}
                  {j.originalFileName || j.fileName || j.format || 'supplier job'}
                  <div className="text-xs text-slate-500">
                    {new Date(j.createdAt).toLocaleString()} · {j.createdBy?.name || 'Admin'} ·{' '}
                    {j.createdBy?.role || ''}
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
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <span>
                  Total: <b>{j.totalRows || 0}</b>
                </span>
                <span>
                  Processed: <b>{j.processedRows || 0}</b>
                </span>
                <span>
                  Remaining: <b>{remaining}</b>
                </span>
                <span>
                  Success: <b>{j.successRows || 0}</b>
                </span>
                <span>
                  Failed: <b>{j.failedRows || 0}</b>
                </span>
                <span>
                  Duplicates: <b>{j.duplicateRows || 0}</b>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {j.filePath && (
                  <button onClick={() => download(j)} className="rounded-lg border px-3 py-1 text-xs font-bold">
                    <Download className="mr-1 inline" size={12} />
                    Output
                  </button>
                )}
                {j.originalFilePath && (
                  <button
                    onClick={() => download(j, 'original')}
                    className="rounded-lg border px-3 py-1 text-xs font-bold"
                  >
                    Original
                  </button>
                )}
                {j.failedRows > 0 && (
                  <>
                    <button
                      onClick={() => download(j, 'failed', 'csv')}
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                    >
                      <FileWarning className="mr-1 inline" size={12} />
                      Failed CSV
                    </button>
                    <button
                      onClick={() => download(j, 'failed', 'xlsx')}
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                    >
                      Failed Excel
                    </button>
                  </>
                )}
                {(j.errorDetails?.length || j.warnings?.length) > 0 && (
                  <>
                    <button
                      onClick={() => download(j, 'report', 'pdf')}
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                    >
                      Validation PDF
                    </button>
                    <button
                      onClick={() => download(j, 'report', 'xlsx')}
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                    >
                      Validation Excel
                    </button>
                    <button
                      onClick={() => download(j, 'report', 'csv')}
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                    >
                      Validation CSV
                    </button>
                  </>
                )}
                {['queued', 'processing'].includes(j.status) && (
                  <button
                    onClick={() => action(j, 'cancel')}
                    className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                  >
                    <Square className="mr-1 inline" size={12} />
                    Cancel
                  </button>
                )}
                {j.type === 'import' && ['failed', 'cancelled'].includes(j.status) && (
                  <button
                    onClick={() => action(j, 'retry')}
                    className="rounded-lg bg-green-50 px-3 py-1 text-xs font-bold text-green-700"
                  >
                    <Play className="mr-1 inline" size={12} />
                    Retry
                  </button>
                )}
                <button
                  onClick={() => remove(j)}
                  className="rounded-lg border px-3 py-1 text-xs font-bold text-red-700"
                >
                  <Trash2 className="inline" size={12} />
                </button>
              </div>
            </div>
          );
        })}
        {!jobs.length && (
          <p className="text-sm text-slate-500">
            <History className="mr-1 inline" size={16} />
            No supplier import/export history yet.
          </p>
        )}
      </div>
    </section>
  );
}
