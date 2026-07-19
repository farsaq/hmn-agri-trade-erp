import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  Grid2X2,
  Image as ImageIcon,
  KeyRound,
  List,
  Lock,
  Menu,
  Move,
  RefreshCw,
  Save,
  Search,
  Share2,
  Star,
  Tags,
  Trash2,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import api from '../services/api';
const mb = (n) => `${(Number(n || 0) / 1048576).toFixed(2)} MB`,
  nice = (v) => (v ? new Date(v).toLocaleString() : '-');
const kind = (x) =>
  x.resourceType === 'video'
    ? 'video'
    : String(x.mimeType || '').startsWith('audio/')
      ? 'audio'
      : String(x.mimeType || '').includes('spreadsheet') || /xlsx?$/i.test(x.format || '')
        ? 'office'
        : x.resourceType === 'image' || String(x.mimeType || '').startsWith('image/')
          ? 'image'
          : 'document';
function Preview({ x, onClose }) {
  const [zoom, setZoom] = useState(1),
    k = kind(x || {});
  if (!x) return null;
  const office = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(x.secureUrl)}`;
  return (
    <div className="fixed inset-0 z-[110] bg-black/75 p-4" onClick={onClose}>
      <div
        className="mx-auto flex h-full max-w-6xl flex-col rounded-2xl bg-white p-4 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <b>{x.originalFilename}</b>
            <small className="block text-slate-500">
              /{x.folder} · {mb(x.bytes)}
            </small>
          </div>
          <div className="flex gap-2">
            {k === 'image' && (
              <>
                <button className="rounded border p-2" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                  <ZoomOut />
                </button>
                <button className="rounded border p-2" onClick={() => setZoom((z) => Math.min(5, z + 0.25))}>
                  <ZoomIn />
                </button>
              </>
            )}
            <button className="rounded border p-2" onClick={onClose}>
              <X />
            </button>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          {k === 'image' ? (
            <div className="grid min-h-full place-items-center overflow-auto">
              <img
                src={x.secureUrl}
                alt={x.originalFilename}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                className="max-h-[72vh] max-w-full object-contain"
              />
            </div>
          ) : k === 'video' ? (
            <video src={x.secureUrl} controls className="h-full w-full" />
          ) : k === 'audio' ? (
            <div className="grid h-full place-items-center">
              <audio src={x.secureUrl} controls />
            </div>
          ) : k === 'office' ? (
            <iframe src={office} title={`${x.originalFilename} preview`} className="h-full min-h-[70vh] w-full" />
          ) : (
            <iframe src={x.secureUrl} title={`${x.originalFilename} preview`} className="h-full min-h-[70vh] w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
function FolderTree({ folders, current, onSelect, onDrop }) {
  const nodes = useMemo(() => {
    const root = [];
    for (const f of folders) {
      let list = root,
        p = '';
      for (const part of f.path.split('/')) {
        p = p ? `${p}/${part}` : part;
        let n = list.find((x) => x.path === p);
        if (!n) {
          n = { path: p, name: part, children: [], meta: f.path === p ? f : null };
          list.push(n);
        }
        list = n.children;
      }
    }
    return root;
  }, [folders]);
  const Node = ({ n }) => {
    const [open, setOpen] = useState(true);
    return (
      <div>
        <div
          draggable={false}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(n.path);
          }}
          className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm ${current === n.path ? 'bg-green-100 text-green-900' : ''}`}
          onClick={() => onSelect(n.path)}
        >
          {n.children.length ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-[14px]" />
          )}
          <Folder size={15} style={{ color: n.meta?.color }} />
          {n.meta?.label || n.name}
        </div>
        {open && (
          <div className="ml-4">
            {n.children.map((c) => (
              <Node key={c.path} n={c} />
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <div>
      {nodes.map((n) => (
        <Node key={n.path} n={n} />
      ))}
    </div>
  );
}
export default function CloudinaryFileManager() {
  const [assets, setAssets] = useState([]),
    [folders, setFolders] = useState([]),
    [view, setView] = useState('gallery'),
    [search, setSearch] = useState(''),
    [folder, setFolder] = useState(''),
    [type, setType] = useState(''),
    [status, setStatus] = useState('active'),
    [preview, setPreview] = useState(null),
    [selected, setSelected] = useState([]),
    [, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [sort, setSort] = useState('recent'),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(true),
    [context, setContext] = useState(null),
    [saved, setSaved] = useState([]),
    [syncJobs, setSyncJobs] = useState([]),
    [analytics, setAnalytics] = useState(null),
    [minSize, setMinSize] = useState(''),
    [maxSize, setMaxSize] = useState(''),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState('');
  const lastIndex = useRef(-1);
  const params = () => ({
    limit: 100,
    status: status || 'all',
    sort,
    search,
    folder,
    type,
    page,
    minSize,
    maxSize,
    dateFrom,
    dateTo,
  });
  const load = async (reset = true) => {
    const p = reset ? 1 : page;
    const r = await api.get('/integrations/uploads/assets', { params: { ...params(), page: p } });
    const rows = Array.isArray(r.data) ? r.data : r.data.items || [];
    setAssets((a) => (reset ? rows : [...a, ...rows]));
    setHasMore(rows.length === 100);
    if (reset) setPage(2);
    else setPage(p + 1);
  };
  const loadMeta = async () => {
    const [f, s, j, a] = await Promise.all([
      api.get('/integrations/uploads/folders'),
      api.get('/integrations/uploads/saved-searches'),
      api.get('/integrations/uploads/sync/jobs'),
      api.get('/integrations/uploads/analytics/advanced'),
    ]);
    setFolders(f.data);
    setSaved(s.data);
    setSyncJobs(j.data);
    setAnalytics(a.data);
  };
  useEffect(() => {
    load(true).catch((e) => setMessage(e.response?.data?.message || e.message));
    loadMeta().catch(() => {});
  }, [status, sort]);
  const filtered = useMemo(
    () =>
      assets.filter(
        (x) =>
          (!search ||
            `${x.originalFilename} ${x.publicId} ${x.notes || ''} ${(x.tags || []).join(' ')}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!folder || x.folder === folder) &&
          (!type || kind(x) === type) &&
          (!minSize || x.bytes >= Number(minSize) * 1048576) &&
          (!maxSize || x.bytes <= Number(maxSize) * 1048576) &&
          (!dateFrom || new Date(x.createdAt) >= new Date(dateFrom)) &&
          (!dateTo || new Date(x.createdAt) <= new Date(dateTo + 'T23:59:59')),
      ),
    [assets, search, folder, type, minSize, maxSize, dateFrom, dateTo],
  );
  const mutate = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      setMessage(ok);
      setSelected([]);
      await load(true);
      await loadMeta();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id, index, e) => {
    if (e?.shiftKey && lastIndex.current >= 0) {
      const [a, b] = [lastIndex.current, index].sort((x, y) => x - y);
      setSelected((s) => [...new Set([...s, ...filtered.slice(a, b + 1).map((x) => x._id)])]);
    } else if (e?.ctrlKey || e?.metaKey) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setSelected((s) => (s.includes(id) ? [] : [id]));
    lastIndex.current = index;
  };
  const one = () => assets.find((x) => x._id === selected[0]);
  const rename = (x) => {
    const name = prompt('New file name:', x.originalFilename);
    if (name) mutate(() => api.post(`/integrations/uploads/${x._id}/rename`, { name }), 'Renamed');
  };
  const moveIds = async (dest, ids = selected) => {
    if (!dest || !ids.length) return;
    await mutate(
      () => Promise.all(ids.map((id) => api.post(`/integrations/uploads/${id}/move`, { folder: dest }))),
      'Moved files',
    );
  };
  const copy = (x) => {
    const dest = prompt('Copy to folder:', x.folder);
    if (dest) mutate(() => api.post(`/integrations/uploads/${x._id}/copy`, { folder: dest }), 'Copied');
  };
  const trash = (ids) =>
    confirm('Move selected files to Trash?') &&
    mutate(() => Promise.all(ids.map((id) => api.delete(`/integrations/uploads/${id}/soft`))), 'Moved to Trash');
  const bulkRename = () => {
    const pattern = prompt('Pattern: {name}, {n}, {date}', '{name}-{n}');
    if (pattern)
      mutate(
        () => api.post('/integrations/uploads/bulk/rename', { ids: selected, pattern, start: 1 }),
        'Bulk rename complete',
      );
  };
  const share = async () => {
    const password = prompt('Optional password (leave blank for none):', ''),
      days = prompt('Expires after how many days?', '7'),
      max = prompt('Maximum downloads (0 = unlimited):', '0');
    await mutate(
      () =>
        api
          .post('/integrations/uploads/shares', {
            ids: selected,
            password,
            expiresAt: days ? new Date(Date.now() + Number(days) * 86400000) : null,
            maxDownloads: Number(max || 0),
          })
          .then((r) => navigator.clipboard?.writeText(r.data.url)),
      'Share link created and copied',
    );
  };
  const saveSearch = () => {
    const name = prompt('Saved search name:');
    if (name)
      mutate(
        () =>
          api.post('/integrations/uploads/saved-searches', {
            name,
            query: { search, folder, type, status, minSize, maxSize, dateFrom, dateTo, sort },
          }),
        'Search saved',
      );
  };
  const applySaved = (x) => {
    const q = x.query || {};
    setSearch(q.search || '');
    setFolder(q.folder || '');
    setType(q.type || '');
    setStatus(q.status || 'active');
    setMinSize(q.minSize || '');
    setMaxSize(q.maxSize || '');
    setDateFrom(q.dateFrom || '');
    setDateTo(q.dateTo || '');
    setSort(q.sort || 'recent');
  };
  const startSync = (type) =>
    mutate(() => api.post('/integrations/uploads/sync/jobs', { type }), `${type} job started`);
  const createFolder = () => {
    const path = prompt('Nested folder path, e.g. hmn/products/2026:');
    if (path) mutate(() => api.post('/integrations/uploads/folders', { path, color: '#166534' }), 'Folder created');
  };
  useEffect(() => {
    const key = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'Delete' && selected.length) trash(selected);
      if (e.key.toLowerCase() === 'r' && selected.length === 1) rename(one());
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && selected.length === 1) {
        e.preventDefault();
        copy(one());
      }
      if (e.key === 'Escape') {
        setSelected([]);
        setContext(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, assets]);
  const card = (x, i) => {
    const k = kind(x);
    return (
      <article
        key={x._id}
        draggable
        onDragStart={(e) =>
          e.dataTransfer.setData('assetIds', JSON.stringify(selected.includes(x._id) ? selected : [x._id]))
        }
        onContextMenu={(e) => {
          e.preventDefault();
          setContext({ x: e.clientX, y: e.clientY, asset: x });
        }}
        onClick={(e) => toggle(x._id, i, e)}
        className={`relative rounded-2xl border bg-white p-3 dark:bg-slate-900 ${selected.includes(x._id) ? 'ring-2 ring-green-600' : ''}`}
      >
        {x.favorite && <Star className="absolute right-3 top-3 fill-amber-400 text-amber-500" size={17} />}
        <div className="grid h-36 place-items-center overflow-hidden rounded-xl bg-slate-100">
          {k === 'image' ? (
            <img src={x.secureUrl} alt={x.originalFilename} className="h-full w-full object-cover" />
          ) : k === 'video' ? (
            <FileVideo size={44} />
          ) : k === 'audio' ? (
            <FileAudio size={44} />
          ) : k === 'office' ? (
            <FileSpreadsheet size={44} />
          ) : (
            <FileText size={44} />
          )}
        </div>
        <b className="mt-2 block truncate">{x.originalFilename}</b>
        <small className="block truncate text-slate-500">
          /{x.folder} · {mb(x.bytes)}
        </small>
        <div className="mt-2 flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreview(x);
            }}
            className="rounded border p-1"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              rename(x);
            }}
            className="rounded border p-1"
          >
            <Tags size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copy(x);
            }}
            className="rounded border p-1"
          >
            <Copy size={15} />
          </button>
        </div>
      </article>
    );
  };
  return (
    <div className="space-y-4" onClick={() => setContext(null)}>
      <div className="flex flex-wrap items-center justify-between">
        <div>
          <h3 className="text-xl font-black">Enterprise Digital Asset Manager</h3>
          <p className="text-sm text-slate-500">Advanced file manager, sharing, versions, sync and analytics.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(true)} className="rounded-xl border p-2">
            <RefreshCw />
          </button>
          <button onClick={createFolder} className="rounded-xl border px-3 py-2">
            <FolderInput className="mr-1 inline" />
            New folder
          </button>
          <button onClick={() => startSync('scan')} className="rounded-xl bg-green-700 px-3 py-2 text-white">
            Sync scan
          </button>
        </div>
      </div>
      {message && <div className="rounded-xl bg-amber-50 p-3">{message}</div>}
      <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border p-3">
          <b>Folders</b>
          <div className="mt-2">
            <FolderTree folders={folders} current={folder} onSelect={setFolder} onDrop={(dest) => moveIds(dest)} />
          </div>
          <hr className="my-3" />
          <b>Saved searches</b>
          {saved.map((x) => (
            <button
              key={x._id}
              onClick={() => applySaved(x)}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
            >
              {x.name}
            </button>
          ))}
        </aside>
        <main className="min-w-0 space-y-3">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <label className="relative xl:col-span-2">
              <Search className="absolute left-3 top-3" size={16} />
              <input
                className="input pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Full metadata search"
              />
            </label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option>image</option>
              <option>video</option>
              <option>audio</option>
              <option>office</option>
              <option>document</option>
            </select>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>active</option>
              <option>archived</option>
              <option value="deleted">trash</option>
              <option value="all">all</option>
            </select>
            <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-28 rounded border px-2"
              placeholder="Min MB"
              value={minSize}
              onChange={(e) => setMinSize(e.target.value)}
            />
            <input
              className="w-28 rounded border px-2"
              placeholder="Max MB"
              value={maxSize}
              onChange={(e) => setMaxSize(e.target.value)}
            />
            <select className="rounded border px-2" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="size">Largest</option>
            </select>
            <button onClick={saveSearch} className="rounded border px-3 py-2">
              <Save className="mr-1 inline" size={15} />
              Save filter
            </button>
            <button
              onClick={() => setView((v) => (v === 'gallery' ? 'list' : 'gallery'))}
              className="rounded border p-2"
            >
              {view === 'gallery' ? <List /> : <Grid2X2 />}
            </button>
            {selected.length > 0 && (
              <>
                <button onClick={bulkRename} className="rounded border px-3">
                  Bulk rename
                </button>
                <button
                  onClick={() => {
                    const d = prompt('Move selected to folder:');
                    moveIds(d);
                  }}
                  className="rounded border px-3"
                >
                  Move
                </button>
                <button onClick={share} className="rounded border px-3">
                  <Share2 className="mr-1 inline" />
                  Share
                </button>
                <button onClick={() => trash(selected)} className="rounded bg-red-600 px-3 text-white">
                  Trash ({selected.length})
                </button>
              </>
            )}
          </div>
          {view === 'gallery' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{filtered.map(card)}</div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Folder</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Downloads</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x, i) => (
                    <tr
                      key={x._id}
                      onClick={(e) => toggle(x._id, i, e)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContext({ x: e.clientX, y: e.clientY, asset: x });
                      }}
                      className={selected.includes(x._id) ? 'bg-green-50' : ''}
                    >
                      <td>{x.originalFilename}</td>
                      <td>{x.folder}</td>
                      <td>{kind(x)}</td>
                      <td>{mb(x.bytes)}</td>
                      <td>{x.downloadCount || 0}</td>
                      <td>{nice(x.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <button onClick={() => load(false)} className="w-full rounded-xl border py-3 font-bold">
              Load more (infinite library)
            </button>
          )}
        </main>
      </div>
      {syncJobs.length > 0 && (
        <section className="rounded-2xl border p-4">
          <h4 className="font-black">Sync monitoring</h4>
          {syncJobs.slice(0, 5).map((j) => (
            <div key={j._id} className="mt-2">
              <div className="flex justify-between text-sm">
                <span>
                  {j.type}: {j.stage}
                </span>
                <span>{j.progress}%</span>
              </div>
              <div className="h-2 rounded bg-slate-200">
                <div className="h-2 rounded bg-green-600" style={{ width: `${j.progress}%` }} />
              </div>
              {j.status === 'failed' && (
                <button
                  onClick={() => api.post(`/integrations/uploads/sync/jobs/${j._id}/retry`).then(loadMeta)}
                  className="text-sm text-red-700"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {analytics && (
        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-3">
            <b>Most downloaded</b>
            {analytics.mostDownloaded?.slice(0, 5).map((x) => (
              <small className="block truncate" key={x._id}>
                {x.originalFilename} — {x.downloadCount}
              </small>
            ))}
          </div>
          <div className="rounded-xl border p-3">
            <b>Unused assets</b>
            <div className="text-3xl font-black">{analytics.unused?.length || 0}</div>
          </div>
          <div className="rounded-xl border p-3">
            <b>90-day storage growth</b>
            <div className="text-3xl font-black">{mb(analytics.storageTrend?.reduce((s, x) => s + x.bytes, 0))}</div>
          </div>
        </section>
      )}
      {context && (
        <div
          className="fixed z-[120] w-48 rounded-xl border bg-white p-1 shadow-xl"
          style={{ left: context.x, top: context.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setPreview(context.asset)}
            className="block w-full rounded px-3 py-2 text-left hover:bg-slate-100"
          >
            Preview
          </button>
          <button
            onClick={() => rename(context.asset)}
            className="block w-full rounded px-3 py-2 text-left hover:bg-slate-100"
          >
            Rename
          </button>
          <button
            onClick={() => copy(context.asset)}
            className="block w-full rounded px-3 py-2 text-left hover:bg-slate-100"
          >
            Copy
          </button>
          <button
            onClick={() => trash([context.asset._id])}
            className="block w-full rounded px-3 py-2 text-left text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
      <Preview x={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
