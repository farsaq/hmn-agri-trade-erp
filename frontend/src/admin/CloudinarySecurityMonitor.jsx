import { useEffect, useMemo, useState } from 'react';
import { Activity, CloudDownload, Database, FileWarning, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import api from '../services/api';
const mb = (n) => `${(Number(n || 0) / 1048576).toFixed(2)} MB`;
const Stat = ({ label, value, icon: Icon }) => (
  <div className="rounded-2xl border p-4 dark:border-slate-700">
    <Icon size={18} className="text-green-700" />
    <div className="mt-2 text-2xl font-black">{value}</div>
    <div className="text-xs text-slate-500">{label}</div>
  </div>
);
export default function CloudinarySecurityMonitor() {
  const [analytics, setAnalytics] = useState(null),
    [uploads, setUploads] = useState([]),
    [failed, setFailed] = useState([]),
    [logs, setLogs] = useState([]),
    [assets, setAssets] = useState([]),
    [tab, setTab] = useState('uploads'),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const load = async () => {
    const [a, u, f, l, x] = await Promise.all([
      api.get('/integrations/uploads/analytics'),
      api.get('/integrations/uploads/history', { params: { limit: 100 } }),
      api.get('/integrations/uploads/failed'),
      api.get('/integrations/uploads/access-logs', { params: { limit: 100, success: '' } }),
      api.get('/integrations/uploads/assets', { params: { limit: 100 } }),
    ]);
    setAnalytics(a.data);
    setUploads(u.data);
    setFailed(f.data);
    setLogs(l.data);
    setAssets(x.data);
  };
  useEffect(() => {
    load().catch(console.error);
  }, []);
  const filtered = useMemo(
    () =>
      uploads.filter(
        (x) =>
          (!status || x.status === status) &&
          (!search ||
            `${x.filename} ${x.folder} ${x.uploadedBy?.name || ''}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [uploads, status, search],
  );
  const download = async (id) => {
    const r = await api.get(`/integrations/uploads/${id}/download`, { responseType: 'blob', maxRedirects: 5 });
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-black">Cloudinary security & monitoring</h3>
          <p className="text-sm text-slate-500">One-time signatures, role policies, ownership and access logs.</p>
        </div>
        <button onClick={load} className="rounded-xl border px-4 py-2 font-bold">
          <RefreshCw className="mr-2 inline" size={16} />
          Refresh
        </button>
      </div>
      {analytics && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Total assets" value={analytics.summary.totalAssets} icon={Database} />
            <Stat label="Images" value={analytics.summary.images} icon={Activity} />
            <Stat label="Documents" value={analytics.summary.documents} icon={FileWarning} />
            <Stat label="Storage" value={mb(analytics.summary.totalBytes)} icon={Database} />
            <Stat
              label="30-day downloads"
              value={analytics.dailyDownloads.reduce((n, x) => n + x.count, 0)}
              icon={CloudDownload}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border p-4 dark:border-slate-700">
              <b>Top folders</b>
              {analytics.byFolder.slice(0, 8).map((x) => (
                <div key={x._id} className="mt-2 flex justify-between text-sm">
                  <span>/{x._id}</span>
                  <span>
                    {x.count} · {mb(x.bytes)} · {x.downloads || 0} downloads
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border p-4 dark:border-slate-700">
              <b>Top uploaders</b>
              {analytics.topUploaders.map((x, i) => (
                <div key={i} className="mt-2 flex justify-between text-sm">
                  <span>{x.user?.name || 'Unknown'}</span>
                  <span>
                    {x.count} · {mb(x.bytes)}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border p-4 dark:border-slate-700">
              <b>30-day storage growth</b>
              <div className="mt-3 flex h-28 items-end gap-1">
                {analytics.dailyUploads.map((x, i) => {
                  const max = Math.max(1, ...analytics.dailyUploads.map((y) => y.bytes));
                  return (
                    <div
                      key={i}
                      title={`${x._id}: ${x.count} files, ${mb(x.bytes)}`}
                      className="min-w-1 flex-1 rounded-t bg-green-600"
                      style={{ height: `${Math.max(4, (x.bytes / max) * 100)}%` }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border p-4 dark:border-slate-700">
              <b>Largest files</b>
              {analytics.largest.slice(0, 7).map((x) => (
                <div key={x._id} className="mt-2 flex justify-between gap-3 text-sm">
                  <span className="truncate">{x.originalFilename}</span>
                  <span>
                    {mb(x.bytes)} · {x.downloadCount || 0} downloads
                  </span>
                </div>
              ))}
            </div>
          </div>
          {analytics.providerUsage && (
            <div className="rounded-2xl border p-4 text-sm dark:border-slate-700">
              <b>Cloudinary provider usage</b>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <span>Storage: {mb(analytics.providerUsage.storage?.usage || 0)}</span>
                <span>Bandwidth: {mb(analytics.providerUsage.bandwidth?.usage || 0)}</span>
                <span>Transformations: {analytics.providerUsage.transformations?.usage || 0}</span>
              </div>
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {[
          ['uploads', 'Upload history'],
          ['failed', 'Failed uploads'],
          ['assets', 'Assets'],
          ['access', 'Access logs'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`rounded-xl px-4 py-2 font-bold ${tab === v ? 'bg-green-700 text-white' : 'border'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'uploads' && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="relative">
              <Search className="absolute left-3 top-3" size={16} />
              <input
                className="input pl-9"
                placeholder="Search file, folder or uploader"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option>success</option>
              <option>failed</option>
              <option>blocked</option>
              <option>pending</option>
            </select>
          </div>
          <div className="max-h-96 overflow-auto rounded-2xl border dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">File</th>
                  <th>Status</th>
                  <th>Folder</th>
                  <th>Uploader</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x._id} className="border-t dark:border-slate-700">
                    <td className="p-3">
                      {x.filename}
                      <small className="block text-slate-500">{mb(x.size)}</small>
                    </td>
                    <td>{x.status}</td>
                    <td>{x.folder}</td>
                    <td>{x.uploadedBy?.name || '-'}</td>
                    <td>{x.durationMs ? `${x.durationMs} ms` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'failed' && (
        <div className="space-y-2">
          {failed.map((x) => (
            <div key={x._id} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
              <b>{x.filename}</b>
              <div>
                {x.errorCategory}: {x.errorMessage}
              </div>
              <small>
                Reference: {x.stackRef || '-'} · Retry by reselecting the original file in the upload queue.
              </small>
            </div>
          ))}
        </div>
      )}
      {tab === 'assets' && (
        <div className="max-h-96 space-y-2 overflow-auto">
          {assets.map((x) => (
            <div key={x._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <div>
                <b>{x.originalFilename}</b>
                <small className="block">
                  /{x.folder} · owner {x.uploadedBy?.name || '-'} ({x.ownerRole || '-'}) · downloads{' '}
                  {x.downloadCount || 0}
                </small>
              </div>
              <button onClick={() => download(x._id)} className="rounded-lg border px-3 py-1 font-bold">
                <CloudDownload className="mr-1 inline" size={15} />
                Download
              </button>
            </div>
          ))}
        </div>
      )}
      {tab === 'access' && (
        <div className="max-h-96 overflow-auto rounded-2xl border dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Action</th>
                <th>User</th>
                <th>File</th>
                <th>IP</th>
                <th>Result</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((x) => (
                <tr key={x._id} className="border-t dark:border-slate-700">
                  <td className="p-3">{x.action}</td>
                  <td>{x.user?.name || '-'}</td>
                  <td>{x.asset?.originalFilename || x.publicId || '-'}</td>
                  <td>{x.ip || '-'}</td>
                  <td>
                    {x.success ? 'Success' : 'Failed'}
                    <small className="block text-slate-500">v{x.version || '-'}</small>
                  </td>
                  <td>{new Date(x.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
