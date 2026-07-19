import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Camera,
  FileText,
  MessageCircle,
  Printer,
  AlertTriangle,
  Paperclip,
  Trash2,
  RotateCcw,
  Download,
} from 'lucide-react';
import api, { assetUrl } from '../services/api';
import { Shell } from './AdminApp';
const initial = {
  name: '',
  fatherName: '',
  cnic: '',
  phone: '',
  whatsapp: '',
  email: '',
  village: '',
  taluka: '',
  district: '',
  address: '',
  openingBalance: 0,
  creditLimit: 0,
  status: 'active',
  category: '',
  tags: '',
  reference: '',
  notes: '',
};
const rowsOf = (r) => (Array.isArray(r.data) ? r.data : r.data?.data || []);
export function Customers() {
  const [rows, setRows] = useState([]),
    [deleted, setDeleted] = useState([]),
    [form, setForm] = useState(initial),
    [photo, setPhoto] = useState(null),
    [edit, setEdit] = useState(null),
    [error, setError] = useState(''),
    [showDeleted, setShowDeleted] = useState(false),
    [q, setQ] = useState('');
  const load = () =>
    Promise.all([
      api.get('/customers', { params: { search: q, limit: 100 } }),
      api.get('/customers-deleted', { params: { limit: 100 } }),
    ])
      .then(([a, b]) => {
        setRows(rowsOf(a));
        setDeleted(rowsOf(b));
      })
      .catch((e) => setError(e.response?.data?.message || e.message));
  useEffect(() => {
    load();
  }, [q]);
  const save = async (e) => {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (photo) fd.append('photo', photo);
    try {
      if (edit) await api.put('/customers/' + edit, fd);
      else await api.post('/customers', fd);
      setForm(initial);
      setEdit(null);
      setPhoto(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  };
  const remove = async (id) => {
    if (confirm('Move this customer to deleted records?')) {
      try {
        await api.delete('/customers/' + id);
        await load();
      } catch (e) {
        setError(e.response?.data?.message || e.message);
      }
    }
  };
  const restore = async (id) => {
    await api.post(`/customers/${id}/restore`);
    await load();
  };
  const data = showDeleted ? deleted : rows;
  return (
    <Shell title="Customer Management">
      {error && <div className="mb-5 rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</div>}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="input max-w-md"
          placeholder="Search name, code, phone, CNIC, village..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={() => setShowDeleted(!showDeleted)} className="rounded-xl border px-4 font-bold">
          {showDeleted ? 'Show active' : 'Deleted customers'} ({showDeleted ? rows.length : deleted.length})
        </button>
      </div>
      <div className="grid gap-6 2xl:grid-cols-[430px_1fr]">
        <form onSubmit={save} className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <h2 className="text-xl font-black">{edit ? 'Edit' : 'Add'} customer</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.keys(initial).map((k) =>
              k === 'notes' || k === 'address' ? (
                <textarea
                  key={k}
                  className="input sm:col-span-2"
                  placeholder={k}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              ) : k === 'status' ? (
                <select
                  key={k}
                  className="input"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option>active</option>
                  <option>inactive</option>
                  <option>blocked</option>
                </select>
              ) : (
                <input
                  key={k}
                  className="input"
                  required={['name', 'phone'].includes(k)}
                  type={['openingBalance', 'creditLimit'].includes(k) ? 'number' : k === 'email' ? 'email' : 'text'}
                  placeholder={k.replace(/([A-Z])/g, ' $1')}
                  value={form[k]}
                  onChange={(e) =>
                    setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })
                  }
                />
              ),
            )}
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border p-3">
            <Camera /> Customer photo
            <input hidden type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          </label>
          <button className="mt-4 w-full rounded-xl bg-green-700 py-3 font-black text-white">
            {edit ? 'Update' : 'Save'} customer
          </button>
        </form>
        <div className="overflow-auto rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Code / Customer</th>
                <th>CNIC</th>
                <th>Village</th>
                <th>Balance</th>
                <th>Credit limit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((x) => (
                <tr key={x._id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {x.photo ? (
                        <img src={assetUrl(x.photo)} alt={x.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-green-100 font-black">
                          {x.name?.[0]}
                        </div>
                      )}
                      <div>
                        <b>
                          {x.customerCode || 'Legacy'} · {x.name}
                        </b>
                        <div className="text-xs text-slate-500">{x.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td>{x.cnic}</td>
                  <td>{x.village}</td>
                  <td
                    className={x.creditLimit > 0 && x.currentBalance > x.creditLimit ? 'font-black text-red-600' : ''}
                  >
                    PKR {Number(x.currentBalance || 0).toLocaleString()}
                  </td>
                  <td>PKR {Number(x.creditLimit || 0).toLocaleString()}</td>
                  <td className="whitespace-nowrap">
                    {showDeleted ? (
                      <button className="font-bold text-green-700" onClick={() => restore(x._id)}>
                        <RotateCcw className="inline" size={15} /> Restore
                      </button>
                    ) : (
                      <>
                        <Link className="mr-3 font-bold text-green-700" to={`/admin/customers/${x._id}`}>
                          Open
                        </Link>
                        <button
                          className="mr-3 font-bold text-blue-700"
                          onClick={() => {
                            setEdit(x._id);
                            setForm({ ...initial, ...x, tags: (x.tags || []).join(', ') });
                          }}
                        >
                          Edit
                        </button>
                        <button className="font-bold text-red-700" onClick={() => remove(x._id)}>
                          <Trash2 className="inline" size={15} /> Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
export function CustomerDetail() {
  const { id } = useParams(),
    [d, setD] = useState(null),
    [timeline, setTimeline] = useState([]),
    [file, setFile] = useState(null),
    [error, setError] = useState('');
  const load = () =>
    Promise.all([api.get('/customers/' + id), api.get(`/customers/${id}/timeline`)])
      .then(([a, b]) => {
        setD(a.data?.data || a.data);
        setTimeline(b.data?.data || b.data || []);
      })
      .catch((e) => setError(e.response?.data?.message || e.message));
  useEffect(() => {
    load();
  }, [id]);
  if (!d)
    return (
      <Shell title="Customer Profile">
        <p>{error || 'Loading...'}</p>
      </Shell>
    );
  const c = d.customer;
  const add = async () => {
    const fd = new FormData();
    fd.append('attachment', file);
    await api.post(`/customers/${id}/attachments`, fd);
    setFile(null);
    load();
  };
  const wa = (c.whatsapp || c.phone || '').replace(/\D/g, '');
  return (
    <Shell title={c.name}>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
          {c.photo && <img src={assetUrl(c.photo)} alt={c.name} className="h-40 w-40 rounded-3xl object-cover" />}
          <h2 className="mt-5 text-3xl font-black">{c.name}</h2>
          <p className="text-slate-500">
            {c.customerCode} · S/O {c.fatherName || '—'}
          </p>
          {d.creditWarning && (
            <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 font-bold text-red-700">
              <AlertTriangle />
              Credit limit exceeded
            </div>
          )}
          <div className="mt-5 space-y-2 text-sm">
            <p>
              <b>CNIC:</b> {c.formattedCnic || c.cnic || '—'}
            </p>
            <p>
              <b>Phone:</b> {c.phone}
            </p>
            <p>
              <b>Email:</b> {c.email || '—'}
            </p>
            <p>
              <b>Village:</b> {c.village}, {c.taluka}, {c.district}
            </p>
            <p>
              <b>Balance:</b> PKR {Number(c.currentBalance || 0).toLocaleString()}
            </p>
            <p>
              <b>Available credit:</b> PKR {Number(d.availableCredit || 0).toLocaleString()}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`https://wa.me/${wa}`}
              className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white"
            >
              <MessageCircle className="inline" size={17} /> WhatsApp
            </a>
            <button
              onClick={async () => {
                const r = await api.get(`/customers/${id}/statement.pdf`, { responseType: 'blob' });
                const url = URL.createObjectURL(r.data);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${c.customerCode || 'customer'}-statement.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white"
            >
              <Download className="inline" size={17} /> PDF
            </button>
            <button onClick={() => window.print()} className="rounded-xl border px-4 py-2 font-bold">
              <Printer className="inline" size={17} /> Print
            </button>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
            <b>Outstanding ageing</b>
            {Object.entries(d.ageing?.buckets || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span>PKR {Number(v).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-6 dark:bg-slate-900">
            <h3 className="text-xl font-black">Customer activity timeline</h3>
            <div className="mt-4 space-y-3">
              {timeline.slice(0, 100).map((x, i) => (
                <div key={x.data?._id || i} className="flex justify-between border-b py-3">
                  <div>
                    <b className="capitalize">{x.kind}</b>
                    <p className="text-xs text-slate-500">
                      {new Date(x.at).toLocaleString()} ·{' '}
                      {x.data?.description || x.data?.invoiceNo || x.data?.action || ''}
                    </p>
                  </div>
                  <b>PKR {Number(x.data?.amount ?? x.data?.total ?? 0).toLocaleString()}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-3xl bg-white p-6 dark:bg-slate-900">
            <h3 className="text-xl font-black">Attachments</h3>
            <div className="mt-4 flex gap-2">
              <input type="file" className="input" onChange={(e) => setFile(e.target.files[0])} />
              <button disabled={!file} onClick={add} className="rounded-xl bg-green-700 px-4 font-black text-white">
                <Paperclip />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {c.attachments?.map((a) => (
                <a
                  key={a._id}
                  target="_blank"
                  rel="noopener noreferrer"
                  href={assetUrl(a.url)}
                  className="rounded-xl border p-3"
                >
                  <FileText className="inline" /> {a.name}
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
