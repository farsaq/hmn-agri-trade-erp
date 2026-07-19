import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  File,
  FolderOpen,
  Image as ImageIcon,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
  XCircle,
  WifiOff,
  Zap,
  Archive,
} from 'lucide-react';
import api from '../services/api';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx';
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
const purposes = [
  ['company', '/company/logo'],
  ['products', '/products'],
  ['productThumbnails', '/products/thumbnails'],
  ['customers', '/customers'],
  ['suppliers', '/suppliers'],
  ['expenses', '/expenses'],
  ['invoices', '/invoices'],
  ['contracts', '/contracts'],
  ['backups', '/backups'],
  ['temp', '/temp'],
  ['general', '/general'],
];
const DB = 'hmn-cloud-upload-queue-v1',
  STORE = 'files';
const openDb = () =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const savePersisted = async (queue) => {
  try {
    const db = await openDb(),
      tx = db.transaction(STORE, 'readwrite'),
      st = tx.objectStore(STORE);
    st.clear();
    for (const x of queue.filter((x) => !['completed', 'cancelled'].includes(x.status)))
      st.put({
        id: x.id,
        file: x.file,
        relativePath: x.relativePath,
        priority: x.priority,
        status: 'queued',
        createdAt: x.createdAt,
      });
  } catch {}
};
const loadPersisted = async () => {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return [];
  }
};
const priorityRank = { high: 0, normal: 1, low: 2 };
export default function CloudinaryUploadPanel({ configured = true }) {
  const [queue, setQueue] = useState([]),
    [purpose, setPurpose] = useState('general'),
    [folder, setFolder] = useState(''),
    [drag, setDrag] = useState(false),
    [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [quality, setQuality] = useState('auto:good'),
    [cropPreset, setCropPreset] = useState('none'),
    [targetWidth, setTargetWidth] = useState(1600),
    [targetHeight, setTargetHeight] = useState(900),
    [preserveExif, setPreserveExif] = useState(false),
    [concurrency, setConcurrency] = useState(3),
    [defaultPriority, setDefaultPriority] = useState('normal'),
    [summary, setSummary] = useState(null),
    [online, setOnline] = useState(navigator.onLine),
    [stats, setStats] = useState(null);
  const inputRef = useRef(null),
    folderRef = useRef(null),
    controllers = useRef(new Map()),
    pauseRef = useRef(false),
    runningRef = useRef(false),
    queueRef = useRef([]);
  const maxMb = 15,
    maxFiles = 20;
  useEffect(() => {
    loadPersisted().then((rows) => {
      if (rows.length)
        setQueue(rows.map((x) => ({ ...x, progress: 0, speed: 0, eta: 0, error: '', result: null, status: 'queued' })));
    });
  }, []);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        if (queue.some((x) => ['queued', 'failed'].includes(x.status))) setTimeout(runQueue, 300);
      },
      off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, [queue]);
  useEffect(() => {
    queueRef.current = queue;
    const t = setTimeout(() => savePersisted(queue), 300);
    return () => clearTimeout(t);
  }, [queue]);
  useEffect(() => {
    if (configured)
      api
        .get('/integrations/uploads/folders/stats')
        .then((r) => setStats(r.data))
        .catch(() => {});
  }, [configured]);
  const validate = (list) => {
    const out = [],
      seen = new Set();
    for (const f of list) {
      const key = `${f.name.toLowerCase()}-${f.size}`;
      if (!f.size) out.push(`${f.name}: empty file`);
      if (f.size > maxMb * 1048576) out.push(`${f.name}: exceeds ${maxMb} MB`);
      if (!ALLOWED.has(f.type)) out.push(`${f.name}: unsupported file type`);
      if (seen.has(key)) out.push(`${f.name}: duplicate file`);
      seen.add(key);
    }
    if (list.length > maxFiles) out.push(`Maximum ${maxFiles} files allowed`);
    return out;
  };
  const addFiles = (incoming) => {
    const old = new Set(queue.map((x) => `${x.file.name}-${x.file.size}-${x.file.lastModified}`)),
      next = [...queue];
    for (const f of Array.from(incoming || [])) {
      const key = `${f.name}-${f.size}-${f.lastModified}`;
      if (old.has(key) || next.length >= maxFiles) continue;
      old.add(key);
      next.push({
        id: crypto.randomUUID(),
        file: f,
        relativePath: f.webkitRelativePath || '',
        priority: defaultPriority,
        status: 'queued',
        progress: 0,
        speed: 0,
        eta: 0,
        error: '',
        result: null,
        createdAt: Date.now(),
      });
    }
    setQueue(next);
    setSummary(null);
  };
  const sorted = useMemo(
    () => [...queue].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.createdAt - b.createdAt),
    [queue],
  );
  const errors = useMemo(() => validate(queue.map((x) => x.file)), [queue]);
  const totalSize = useMemo(() => queue.reduce((a, x) => a + x.file.size, 0), [queue]);
  const patch = (id, data) =>
    setQueue((q) => {
      const next = q.map((x) => (x.id === id ? { ...x, ...data } : x));
      queueRef.current = next;
      return next;
    });
  const uploadOne = async (item) => {
    if (!navigator.onLine) {
      patch(item.id, { status: 'queued', error: 'Waiting for internet' });
      return false;
    }
    const started = Date.now(),
      fd = new FormData();
    fd.append('file', item.file, item.file.name);
    fd.append('purpose', purpose);
    fd.append('folder', folder);
    fd.append('quality', quality);
    fd.append('cropPreset', cropPreset);
    fd.append('targetWidth', String(targetWidth));
    fd.append('targetHeight', String(targetHeight));
    fd.append('preserveExif', String(preserveExif));
    fd.append('department', localStorage.getItem('hmn_department') || '');
    fd.append('branch', localStorage.getItem('hmn_branch') || '');
    const sig = await api.post('/integrations/uploads/signature', { purpose, folder });
    fd.append('uploadToken', sig.data.uploadToken);
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patch(item.id, { status: 'uploading', progress: 0, error: '' });
    try {
      const r = await api.post('/integrations/uploads', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (e) => {
          const elapsed = Math.max(0.2, (Date.now() - started) / 1000),
            speed = e.loaded / elapsed,
            remaining = Math.max(0, (e.total || item.file.size) - e.loaded);
          patch(item.id, {
            progress: e.total ? Math.round((e.loaded * 100) / e.total) : 0,
            speed,
            eta: speed ? remaining / speed : 0,
          });
        },
      });
      patch(item.id, { status: 'completed', progress: 100, result: r.data, speed: 0, eta: 0 });
      return true;
    } catch (e) {
      const cancelled = e.code === 'ERR_CANCELED' || e.name === 'CanceledError';
      patch(item.id, {
        status: cancelled ? 'cancelled' : navigator.onLine ? 'failed' : 'queued',
        error: cancelled
          ? 'Cancelled'
          : navigator.onLine
            ? e.response?.data?.errors?.[0]?.message || e.response?.data?.message || e.message
            : 'Interrupted; resumes when online',
        speed: 0,
        eta: 0,
      });
      return false;
    } finally {
      controllers.current.delete(item.id);
    }
  };
  async function runQueue() {
    if (runningRef.current || errors.length || !queue.length || !navigator.onLine) return;
    runningRef.current = true;
    setBusy(true);
    setPaused(false);
    pauseRef.current = false;
    let ok = 0,
      failed = 0;
    while (true) {
      while (pauseRef.current) await new Promise((r) => setTimeout(r, 200));
      if (!navigator.onLine) break;
      const pending = [...queueRef.current]
        .filter((x) => ['queued', 'failed'].includes(x.status))
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.createdAt - b.createdAt);
      if (!pending.length) break;
      const batch = pending.slice(0, Math.max(1, concurrency));
      const results = await Promise.all(batch.map(uploadOne));
      results.forEach((v) => (v ? ok++ : failed++));
      await new Promise((r) => setTimeout(r, 50));
    }
    setBusy(false);
    runningRef.current = false;
    setSummary({ ok, failed });
  }
  const pause = () => {
      pauseRef.current = true;
      setPaused(true);
    },
    resume = () => {
      pauseRef.current = false;
      setPaused(false);
    },
    cancel = (id) => controllers.current.get(id)?.abort(),
    retry = (id) => {
      patch(id, { status: 'queued', progress: 0, error: '', result: null });
      setTimeout(runQueue, 0);
    };
  const archive = async () => {
    const days = Number(prompt('Archive active assets older than how many days?', '180'));
    if (!days) return;
    const r = await api.post('/integrations/uploads/archive-old', { days });
    alert(r.data.message + `: ${r.data.archived}`);
  };
  return (
    <div className="space-y-4">
      {!configured && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Configure Cloudinary credentials in backend .env first.
        </p>
      )}
      {!online && (
        <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          <WifiOff className="mr-2 inline" size={17} />
          Offline: queued files are safely retained and resume automatically.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {purposes.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Optional subfolder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        />
        <select className="input" value={quality} onChange={(e) => setQuality(e.target.value)}>
          <option value="auto:eco">Smaller / eco</option>
          <option value="auto:good">Balanced / good</option>
          <option value="auto:best">High / best</option>
          <option value="auto">Automatic</option>
        </select>
        <select className="input" value={cropPreset} onChange={(e) => setCropPreset(e.target.value)}>
          <option value="none">Resize only</option>
          <option value="square">Square 1:1</option>
          <option value="16:9">Landscape 16:9</option>
          <option value="custom">Custom crop</option>
          <option value="face">Face-aware smart crop</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          className="input"
          type="number"
          min="64"
          max="4096"
          value={targetWidth}
          onChange={(e) => setTargetWidth(Number(e.target.value))}
        />
        <input
          className="input"
          type="number"
          min="64"
          max="4096"
          value={targetHeight}
          onChange={(e) => setTargetHeight(Number(e.target.value))}
        />
        <select className="input" value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))}>
          <option value="1">1 parallel</option>
          <option value="2">2 parallel</option>
          <option value="3">3 parallel</option>
          <option value="4">4 parallel</option>
        </select>
        <select className="input" value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)}>
          <option value="high">High priority</option>
          <option value="normal">Normal priority</option>
          <option value="low">Low priority</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl border px-3">
          <input type="checkbox" checked={preserveExif} onChange={(e) => setPreserveExif(e.target.checked)} /> Preserve
          EXIF
        </label>
      </div>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-7 text-center ${drag ? 'border-green-600 bg-green-50' : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}
      >
        <CloudUpload className="mx-auto text-green-700" size={38} />
        <p className="mt-2 font-black">Drag files or multiple folders here</p>
        <p className="text-sm text-slate-500">
          AVIF, WEBP, responsive sizes, smart crop and LQIP are generated automatically.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            disabled={!configured || busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            <File className="mr-2 inline" size={17} />
            Choose files
          </button>
          <button
            disabled={!configured || busy}
            onClick={() => folderRef.current?.click()}
            className="rounded-xl border px-4 py-2 font-bold disabled:opacity-50"
          >
            <FolderOpen className="mr-2 inline" size={17} />
            Choose folder
          </button>
          <button onClick={archive} className="rounded-xl border px-4 py-2 font-bold">
            <Archive className="mr-2 inline" size={17} />
            Archive old
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      {stats && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {stats.folders.slice(0, 8).map((x) => (
            <div
              key={x.folder}
              className={`rounded-xl border p-3 text-xs ${x.overQuota ? 'border-red-400 bg-red-50' : ''}`}
            >
              <b className="block truncate">/{x.folder}</b>
              <span>
                {x.count} files · {mb(x.bytes)} · {x.quotaPercent}% quota
              </span>
            </div>
          ))}
        </div>
      )}
      {queue.length > 0 && (
        <div className="rounded-2xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <b>
              {queue.length} file(s) · {mb(totalSize)}
            </b>
            <button disabled={busy} onClick={() => setQueue([])} className="text-sm font-bold text-red-600">
              Clear all
            </button>
          </div>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {sorted.map((x) => (
              <div key={x.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  {x.file.type.startsWith('image/') ? <ImageIcon size={18} /> : <File size={18} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{x.relativePath || x.file.name}</div>
                    <div className="text-xs text-slate-500">
                      {mb(x.file.size)} · {x.priority} · {x.status}
                      {x.speed > 0 ? ` · ${(x.speed / 1048576).toFixed(2)} MB/s · ${Math.ceil(x.eta)}s left` : ''}
                    </div>
                  </div>
                  <select
                    value={x.priority}
                    disabled={busy}
                    onChange={(e) => patch(x.id, { priority: e.target.value })}
                    className="rounded border text-xs"
                  >
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                  {x.status === 'failed' && (
                    <button onClick={() => retry(x.id)}>
                      <RotateCcw size={17} />
                    </button>
                  )}
                  {x.status === 'uploading' && (
                    <button onClick={() => cancel(x.id)}>
                      <X size={17} />
                    </button>
                  )}
                  {!busy && (
                    <button onClick={() => setQueue((q) => q.filter((y) => y.id !== x.id))}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full ${x.status === 'failed' ? 'bg-red-600' : x.status === 'completed' ? 'bg-green-600' : 'bg-indigo-600'}`}
                    style={{ width: `${x.progress}%` }}
                  />
                </div>
                {x.error && <p className="mt-1 text-xs text-red-600">{x.error}</p>}
                {x.result && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <a className="underline" href={x.result.url} target="_blank">
                      Original
                    </a>
                    {x.result.lqipUrl && (
                      <a className="underline" href={x.result.lqipUrl} target="_blank">
                        LQIP
                      </a>
                    )}
                    {x.result.thumbnailUrl && (
                      <a className="underline" href={x.result.thumbnailUrl} target="_blank">
                        Thumbnail
                      </a>
                    )}
                    {x.result.optimizedUrl && (
                      <a className="underline" href={x.result.optimizedUrl} target="_blank">
                        WEBP
                      </a>
                    )}
                    {x.result.avifUrl && (
                      <a className="underline" href={x.result.avifUrl} target="_blank">
                        AVIF
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {errors.map((x, i) => (
            <p key={i}>
              <XCircle className="mr-1 inline" size={15} />
              {x}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!configured || busy || !online || !queue.length || errors.length > 0}
          onClick={runQueue}
          className="flex-1 rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50"
        >
          <Zap className="mr-2 inline" size={17} />
          Start parallel queue
        </button>
        {busy && !paused && (
          <button onClick={pause} className="rounded-xl border px-4 py-3 font-bold">
            <Pause className="inline" size={17} /> Pause
          </button>
        )}
        {busy && paused && (
          <button onClick={resume} className="rounded-xl border px-4 py-3 font-bold">
            <Play className="inline" size={17} /> Resume
          </button>
        )}
      </div>
      {summary && (
        <div className="rounded-xl bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mr-1 inline" size={17} />
          <b>Queue pass:</b> {summary.ok} uploaded, {summary.failed} failed.
        </div>
      )}
    </div>
  );
}
