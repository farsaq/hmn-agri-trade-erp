import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Upload,
  Printer,
  QrCode,
  Barcode,
  ArrowRightLeft,
  AlertTriangle,
  ReceiptText,
  RotateCcw,
  CreditCard,
  Trash2,
  Star,
  FileDown,
  ArchiveRestore,
} from 'lucide-react';
import api, { apiOrigin, assetUrl } from '../services/api';
import { Shell } from './AdminApp';
const money = (v) => `PKR ${Number(v || 0).toLocaleString()}`;
const errMsg = (e) => e?.response?.data?.message || e.message || 'Request failed';
export function SuppliersPro() {
  const [rows, setRows] = useState([]),
    [selected, setSelected] = useState(null),
    [profile, setProfile] = useState(null),
    [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', paymentTerms: '30 days' });
  const load = () => api.get('/suppliers').then((r) => setRows(Array.isArray(r.data) ? r.data : r.data.items || []));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    selected &&
      api
        .get(`/suppliers/${selected}/profile`)
        .then((r) => setProfile(r.data))
        .catch((e) => setError(errMsg(e)));
  }, [selected]);
  async function save(e) {
    e.preventDefault();
    try {
      await api.post('/suppliers', form);
      setForm({ name: '', phone: '', paymentTerms: '30 days' });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <Shell title="Enterprise Suppliers">
      {error && <Notice text={error} />}
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <form onSubmit={save} className="card space-y-3">
          <h2 className="text-xl font-black">Add supplier</h2>
          {[
            'name',
            'company',
            'contactPerson',
            'phone',
            'whatsapp',
            'cnic',
            'address',
            'paymentTerms',
            'taxNumber',
          ].map((f) => (
            <input
              key={f}
              className="input"
              placeholder={f.replace(/[A-Z]/g, (m) => ' ' + m)}
              value={form[f] || ''}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              required={f === 'name'}
            />
          ))}
          <button className="btn-primary w-full">Save supplier</button>
        </form>
        <div className="card overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Supplier</th>
                <th>Phone</th>
                <th>Terms</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s._id} className="border-t">
                  <td className="p-3 font-bold">
                    {s.name}
                    <div className="text-xs text-slate-500">{s.company}</div>
                  </td>
                  <td>{s.phone}</td>
                  <td>{s.paymentTerms || '—'}</td>
                  <td>{money(s.currentBalance)}</td>
                  <td>
                    <button onClick={() => setSelected(s._id)} className="font-bold text-green-700">
                      Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {profile && (
        <SupplierProfile
          data={profile}
          refresh={() => api.get(`/suppliers/${selected}/profile`).then((r) => setProfile(r.data))}
        />
      )}
    </Shell>
  );
}
function SupplierProfile({ data, refresh }) {
  const [contract, setContract] = useState({
      title: 'Annual Supply Contract',
      status: 'active',
      currency: 'PKR',
      value: 0,
      renewalReminderDays: 30,
    }),
    [bank, setBank] = useState({ bankName: '', accountTitle: '', accountNumber: '', iban: '', isPrimary: true }),
    [contact, setContact] = useState({ name: '', designation: '', phone: '', email: '', isPrimary: false }),
    [compliance, setCompliance] = useState({ documentType: 'NTN Certificate', documentNumber: '', status: 'valid' }),
    [activity, setActivity] = useState({ type: 'call', subject: '', details: '', nextFollowUpAt: '' }),
    [governance, setGovernance] = useState({
      onboardingStatus: data.supplier.onboardingStatus || 'draft',
      riskLevel: data.supplier.riskLevel || 'low',
      riskScore: data.supplier.riskScore || 0,
      holdReason: data.supplier.holdReason || '',
    }),
    [evaluation, setEvaluation] = useState({ quality: 5, delivery: 5, pricing: 5, communication: 5, notes: '' });
  const sid = data.supplier._id;
  async function addContract(e) {
    e.preventDefault();
    await api.post(`/suppliers/${sid}/contracts`, contract);
    refresh();
  }
  async function addBank(e) {
    e.preventDefault();
    await api.post(`/suppliers/${sid}/banks`, bank);
    refresh();
  }
  async function addContact(e) {
    e.preventDefault();
    await api.post(`/suppliers/${sid}/contacts`, contact);
    setContact({ name: '', designation: '', phone: '', email: '', isPrimary: false });
    refresh();
  }
  async function addCompliance(e) {
    e.preventDefault();
    await api.post(`/suppliers/${sid}/compliance`, compliance);
    refresh();
  }
  async function addActivity(e) {
    e.preventDefault();
    await api.post(`/suppliers/${sid}/activities`, activity);
    setActivity({ type: 'call', subject: '', details: '', nextFollowUpAt: '' });
    refresh();
  }
  async function saveGovernance(e) {
    e.preventDefault();
    await api.put(`/suppliers/${sid}/governance`, governance);
    refresh();
  }
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('attachment', file);
    fd.append('category', 'supplier-document');
    await api.post(`/suppliers/${sid}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    refresh();
  }
  async function addEvaluation(e) {
    e.preventDefault();
    await api.post(`/suppliers/${sid}/evaluations`, evaluation);
    refresh();
  }
  async function del(kind, id) {
    if (!confirm(`Delete this ${kind}?`)) return;
    await api.delete(`/suppliers/${sid}/${kind}/${id}`);
    refresh();
  }
  async function archive() {
    await api.post(`/suppliers/${sid}/archive`, { restore: data.supplier.status !== 'active' });
    refresh();
  }
  async function statement(format) {
    const r = await api.get(`/suppliers/${sid}/statement?format=${format}`, { responseType: 'blob' });
    const u = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = u;
    a.download = `${data.supplier.supplierCode || 'supplier'}-statement.${format}`;
    a.click();
    URL.revokeObjectURL(u);
  }
  const m = data.metrics || {};
  return (
    <div className="mt-7 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Total purchases" value={money(m.purchaseTotal)} />
        <Stat label="Paid" value={money(m.paidTotal)} />
        <Stat label="Outstanding" value={money(m.remainingTotal)} />
        <Stat label="Products" value={m.productCount || 0} />
        <Stat label="Rating" value={`${Number(m.averageRating || 0).toFixed(1)} / 5`} />
        <Stat label="Compliance alerts" value={m.overdueCompliance || 0} />
        <Stat label="Open follow-ups" value={m.openFollowUps || 0} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">{data.supplier.name}</h2>
              <p>{data.supplier.company}</p>
              <p className="text-xs font-bold text-slate-500">{data.supplier.supplierCode}</p>
            </div>
            <button onClick={archive} className="rounded-xl border px-3 py-2 text-sm font-bold">
              <ArchiveRestore className="inline" size={16} />{' '}
              {data.supplier.status === 'active' ? 'Archive' : 'Restore'}
            </button>
          </div>
          <p className="mt-3 text-sm">{data.supplier.address}</p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <b>Current balance</b>
            <div className="text-2xl font-black">{money(data.supplier.currentBalance)}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => statement('pdf')} className="rounded-xl border p-3 text-center font-bold">
              <FileDown className="inline" size={16} /> PDF statement
            </button>
            <button onClick={() => statement('csv')} className="rounded-xl border p-3 text-center font-bold">
              <FileDown className="inline" size={16} /> CSV statement
            </button>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-bold">
            <Upload size={18} /> Upload document
            <input type="file" className="hidden" onChange={upload} />
          </label>
          <div className="mt-4 space-y-2">
            {data.attachments?.map((a) => (
              <div key={a._id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
                <a href={assetUrl(a.url)} target="_blank" rel="noopener noreferrer" className="font-bold">
                  {a.name}
                </a>
                <button onClick={() => del('attachments', a._id)} className="text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={addContract} className="card space-y-3">
          <h3 className="text-xl font-black">
            Contracts <span className="text-sm text-amber-600">({m.expiringContracts || 0} expiring)</span>
          </h3>
          <input
            className="input"
            placeholder="Title"
            value={contract.title}
            onChange={(e) => setContract({ ...contract, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              type="date"
              onChange={(e) => setContract({ ...contract, startDate: e.target.value })}
            />
            <input
              className="input"
              type="date"
              onChange={(e) => setContract({ ...contract, endDate: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              type="number"
              placeholder="Contract value"
              onChange={(e) => setContract({ ...contract, value: Number(e.target.value) })}
            />
            <input
              className="input"
              placeholder="Currency"
              value={contract.currency}
              onChange={(e) => setContract({ ...contract, currency: e.target.value })}
            />
          </div>
          <textarea
            className="input"
            placeholder="Terms"
            onChange={(e) => setContract({ ...contract, terms: e.target.value })}
          />
          <button className="btn-primary">Add contract</button>
          {data.contracts.map((c) => (
            <div key={c._id} className="flex justify-between rounded-xl bg-slate-50 p-3">
              <div>
                <b>
                  {c.contractNo} · {c.title}
                </b>
                <div className="text-xs uppercase">
                  {c.status} {c.endDate ? `· ends ${new Date(c.endDate).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => del('contracts', c._id)} className="text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </form>
        <form onSubmit={addBank} className="card space-y-3">
          <h3 className="text-xl font-black">Bank accounts</h3>
          {['bankName', 'accountTitle', 'accountNumber', 'iban', 'branch', 'swiftCode'].map((f) => (
            <input
              key={f}
              className="input"
              placeholder={f}
              value={bank[f] || ''}
              onChange={(e) => setBank({ ...bank, [f]: e.target.value })}
            />
          ))}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={bank.isPrimary}
              onChange={(e) => setBank({ ...bank, isPrimary: e.target.checked })}
            />{' '}
            Primary account
          </label>
          <button className="btn-primary">Add account</button>
          {data.banks.map((b) => (
            <div key={b._id} className="flex justify-between rounded-xl bg-slate-50 p-3">
              <div>
                <b>
                  {b.bankName}
                  {b.isPrimary ? ' · Primary' : ''}
                </b>
                <div>
                  {b.accountTitle} · {b.accountNumber}
                </div>
                <div className="text-xs">{b.verified ? 'Verified' : 'Not verified'}</div>
              </div>
              <button type="button" onClick={() => del('banks', b._id)} className="text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </form>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={addContact} className="card space-y-3">
          <h3 className="text-xl font-black">Contact persons</h3>
          {['name', 'designation', 'phone', 'whatsapp', 'email'].map((f) => (
            <input
              key={f}
              className="input"
              placeholder={f}
              value={contact[f] || ''}
              onChange={(e) => setContact({ ...contact, [f]: e.target.value })}
              required={f === 'name'}
            />
          ))}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={contact.isPrimary}
              onChange={(e) => setContact({ ...contact, isPrimary: e.target.checked })}
            />{' '}
            Primary contact
          </label>
          <button className="btn-primary">Add contact</button>
          {data.contacts?.map((c) => (
            <div key={c._id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm">
              <div>
                <b>
                  {c.name}
                  {c.isPrimary ? ' · Primary' : ''}
                </b>
                <div>
                  {c.designation} · {c.phone || c.email}
                </div>
              </div>
              <button type="button" onClick={() => del('contacts', c._id)} className="text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </form>
        <form onSubmit={addCompliance} className="card space-y-3">
          <h3 className="text-xl font-black">Compliance & expiry</h3>
          <input
            className="input"
            placeholder="Document type"
            value={compliance.documentType}
            onChange={(e) => setCompliance({ ...compliance, documentType: e.target.value })}
          />
          <input
            className="input"
            placeholder="Document number"
            value={compliance.documentNumber}
            onChange={(e) => setCompliance({ ...compliance, documentNumber: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              type="date"
              onChange={(e) => setCompliance({ ...compliance, issuedAt: e.target.value })}
            />
            <input
              className="input"
              type="date"
              onChange={(e) => setCompliance({ ...compliance, expiresAt: e.target.value })}
            />
          </div>
          <button className="btn-primary">Add compliance record</button>
          {data.compliance?.map((c) => (
            <div key={c._id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm">
              <div>
                <b>{c.documentType}</b>
                <div>
                  {c.documentNumber || '—'} · {c.status}
                </div>
                <div className="text-xs">
                  {c.expiresAt ? `Expires ${new Date(c.expiresAt).toLocaleDateString()}` : 'No expiry'}
                </div>
              </div>
              <button type="button" onClick={() => del('compliance', c._id)} className="text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </form>
        <form onSubmit={saveGovernance} className="card space-y-3">
          <h3 className="text-xl font-black">Approval & risk</h3>
          <select
            className="input"
            value={governance.onboardingStatus}
            onChange={(e) => setGovernance({ ...governance, onboardingStatus: e.target.value })}
          >
            {['draft', 'pending', 'approved', 'rejected', 'on-hold'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            className="input"
            value={governance.riskLevel}
            onChange={(e) => setGovernance({ ...governance, riskLevel: e.target.value })}
          >
            {['low', 'medium', 'high', 'critical'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            value={governance.riskScore}
            onChange={(e) => setGovernance({ ...governance, riskScore: Number(e.target.value) })}
          />
          <textarea
            className="input"
            placeholder="Hold/rejection reason"
            value={governance.holdReason}
            onChange={(e) => setGovernance({ ...governance, holdReason: e.target.value })}
          />
          <button className="btn-primary">Save governance</button>
        </form>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={addActivity} className="card space-y-3">
          <h3 className="text-xl font-black">Communication & follow-up</h3>
          <select
            className="input"
            value={activity.type}
            onChange={(e) => setActivity({ ...activity, type: e.target.value })}
          >
            {['call', 'email', 'whatsapp', 'meeting', 'visit', 'note', 'complaint', 'resolution'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Subject"
            value={activity.subject}
            onChange={(e) => setActivity({ ...activity, subject: e.target.value })}
          />
          <textarea
            className="input"
            placeholder="Details"
            value={activity.details}
            onChange={(e) => setActivity({ ...activity, details: e.target.value })}
          />
          <input
            className="input"
            type="datetime-local"
            value={activity.nextFollowUpAt}
            onChange={(e) => setActivity({ ...activity, nextFollowUpAt: e.target.value })}
          />
          <button className="btn-primary">Log activity</button>
          {data.activities?.slice(0, 8).map((a) => (
            <div key={a._id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <b className="uppercase">{a.type}</b> · {a.subject}
              <div>{a.details}</div>
              <div className="text-xs text-slate-500">
                {a.createdBy?.name || 'User'} · {new Date(a.createdAt).toLocaleString()}
              </div>
              {!a.completed && a.nextFollowUpAt && (
                <button
                  type="button"
                  onClick={async () => {
                    await api.post(`/suppliers/${sid}/activities/${a._id}/complete`);
                    refresh();
                  }}
                  className="mt-2 font-bold text-green-700"
                >
                  Mark complete
                </button>
              )}
            </div>
          ))}
        </form>
        <div className="card xl:col-span-2">
          <h3 className="text-xl font-black">Purchase history</h3>
          {data.purchases.map((p) => (
            <div key={p._id} className="grid grid-cols-4 border-b py-3 text-sm">
              <span>{p.purchaseNo || p._id.slice(-6)}</span>
              <span>{new Date(p.date).toLocaleDateString()}</span>
              <span>{money(p.total)}</span>
              <b>{money(p.remaining)} due</b>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 className="text-xl font-black">Payable aging</h3>
          {Object.entries(m.aging || {}).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b py-3 text-sm">
              <span>{k.replaceAll('days', ' days ').replace('to', '–')}</span>
              <b>{money(v)}</b>
            </div>
          ))}
        </div>
        <div className="card xl:col-span-2">
          <h3 className="text-xl font-black">Supplier ledger</h3>
          {data.ledger.map((l) => (
            <div key={l._id} className="grid grid-cols-4 border-b py-3 text-sm">
              <span>{new Date(l.date).toLocaleDateString()}</span>
              <span>{l.description}</span>
              <b>{money(l.amount)}</b>
              <b>{money(l.runningBalance)}</b>
            </div>
          ))}
        </div>
        <form onSubmit={addEvaluation} className="card space-y-3">
          <h3 className="text-xl font-black">
            <Star className="inline" /> Performance review
          </h3>
          {['quality', 'delivery', 'pricing', 'communication'].map((f) => (
            <label key={f} className="block text-sm font-bold capitalize">
              {f}
              <input
                className="input mt-1"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={evaluation[f]}
                onChange={(e) => setEvaluation({ ...evaluation, [f]: Number(e.target.value) })}
              />
            </label>
          ))}
          <textarea
            className="input"
            placeholder="Review notes"
            value={evaluation.notes}
            onChange={(e) => setEvaluation({ ...evaluation, notes: e.target.value })}
          />
          <button className="btn-primary">Save review</button>
          {data.evaluations?.slice(0, 5).map((x) => (
            <div key={x._id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <b>{Number(x.overall || 0).toFixed(1)}/5</b> · {x.reviewedBy?.name || 'User'}
              <div>{x.notes}</div>
            </div>
          ))}
        </form>
      </div>
    </div>
  );
}
export function ProductsPro() {
  const [rows, setRows] = useState([]),
    [meta, setMeta] = useState({ categories: [], brands: [], warehouses: [], suppliers: [] }),
    [selected, setSelected] = useState(null),
    [profile, setProfile] = useState(null),
    [form, setForm] = useState({ name: '', sku: '', category: 'Other', baseUnit: 'kg' }),
    [error, setError] = useState('');
  const load = () =>
    Promise.all([api.get('/products'), api.get('/catalog/meta')]).then(([a, b]) => {
      setRows(Array.isArray(a.data) ? a.data : a.data.items || []);
      setMeta(b.data);
    });
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    selected && api.get(`/products/${selected}/profile`).then((r) => setProfile(r.data));
  }, [selected]);
  async function save(e) {
    e.preventDefault();
    try {
      await api.post('/products', form);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <Shell title="Product Management">
      {error && <Notice text={error} />}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={save} className="card space-y-3">
          <h2 className="text-xl font-black">Create product</h2>
          {[
            'name',
            'sku',
            'brand',
            'baseUnit',
            'purchasePrice',
            'salePrice',
            'wholesalePrice',
            'retailPrice',
            'tax',
            'minimumStock',
          ].map((f) => (
            <input
              key={f}
              className="input"
              type={/Price|tax|Stock/.test(f) ? 'number' : 'text'}
              placeholder={f}
              value={form[f] || ''}
              onChange={(e) =>
                setForm({ ...form, [f]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })
              }
            />
          ))}
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {['Cotton', 'Wheat', 'DAP', 'Urea', 'Bardana', 'Seeds', 'Pesticides', 'Other'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select className="input" onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
            <option value="">Supplier</option>
            {meta.suppliers.map((x) => (
              <option key={x._id} value={x._id}>
                {x.name}
              </option>
            ))}
          </select>
          <button className="btn-primary w-full">Save product</button>
        </form>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <button key={p._id} onClick={() => setSelected(p._id)} className="card text-left">
              <div className="flex justify-between">
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700">
                  {p.category}
                </span>
                {p.availableStock <= p.minimumStock && <AlertTriangle className="text-red-500" />}
              </div>
              <h3 className="mt-4 text-xl font-black">{p.name}</h3>
              <p className="text-sm text-slate-500">{p.sku}</p>
              <div className="mt-4 text-2xl font-black">
                {p.availableStock} {p.unit}
              </div>
            </button>
          ))}
        </div>
      </div>
      {profile && (
        <ProductProfile
          data={profile}
          meta={meta}
          refresh={() => api.get(`/products/${selected}/profile`).then((r) => setProfile(r.data))}
        />
      )}
    </Shell>
  );
}
function ProductProfile({ data, refresh }) {
  const [batch, setBatch] = useState({ batchNo: '', lotNo: '', quantity: 0, purchasePrice: 0 });
  async function codes() {
    await api.post(`/products/${data.product._id}/codes`);
    refresh();
  }
  async function images(e) {
    const fd = new FormData();
    [...e.target.files].forEach((f) => fd.append('images', f));
    await api.post(`/products/${data.product._id}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    refresh();
  }
  async function addBatch(e) {
    e.preventDefault();
    await api.post(`/products/${data.product._id}/batches`, batch);
    refresh();
  }
  return (
    <div className="mt-7 grid gap-6 xl:grid-cols-3">
      <div className="card">
        <h2 className="text-2xl font-black">{data.product.name}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(data.product.images || []).map((x) => (
            <img key={x} src={assetUrl(x)} alt={data.product.name} className="h-24 w-full rounded-xl object-cover" />
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-bold">
          <Upload /> Upload images
          <input multiple type="file" className="hidden" onChange={images} />
        </label>
        <button onClick={codes} className="btn-primary mt-3 w-full">
          <QrCode size={18} /> Generate QR & barcode
        </button>
        {data.product.qrCode && (
          <img src={data.product.qrCode} alt={`${data.product.name} QR code`} className="mx-auto mt-4 h-36" />
        )}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={`${apiOrigin}/api/products/${data.product._id}/barcode.png`}
          className="mt-3 flex justify-center rounded-xl border p-3 font-bold"
        >
          <Barcode /> Print label
        </a>
      </div>
      <form onSubmit={addBatch} className="card space-y-3">
        <h3 className="text-xl font-black">Batch / lot management</h3>
        {['batchNo', 'lotNo', 'quantity', 'purchasePrice'].map((f) => (
          <input
            key={f}
            className="input"
            type={['quantity', 'purchasePrice'].includes(f) ? 'number' : 'text'}
            placeholder={f}
            value={batch[f]}
            onChange={(e) => setBatch({ ...batch, [f]: e.target.value })}
          />
        ))}
        <input className="input" type="date" onChange={(e) => setBatch({ ...batch, expiryDate: e.target.value })} />
        <button className="btn-primary">Add batch</button>
        {data.batches.map((b) => (
          <div key={b._id} className="rounded-xl bg-slate-50 p-3">
            <b>{b.batchNo}</b>
            <div>
              Lot: {b.lotNo || '—'} · Qty {b.quantity}
            </div>
            <div className="text-xs">Expiry: {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : '—'}</div>
          </div>
        ))}
      </form>
      <div className="card">
        <h3 className="text-xl font-black">Warehouse stock</h3>
        {data.stocks.map((s) => (
          <div key={s._id} className="border-b py-3">
            <b>{s.warehouse?.name}</b>
            <div>
              {s.quantity} {data.product.unit} · {money(s.quantity * s.averageCost)}
            </div>
          </div>
        ))}
        <div className="mt-4 text-xl font-black">Valuation: {money(data.valuation)}</div>
      </div>
    </div>
  );
}
export function InventoryPro() {
  const [data, setData] = useState({ stocks: [], expiring: [], value: 0 }),
    [meta, setMeta] = useState({ warehouses: [], suppliers: [] }),
    [history, setHistory] = useState([]),
    [transfer, setTransfer] = useState({ quantity: 0 }),
    [error, setError] = useState('');
  const load = () =>
    Promise.all([api.get('/inventory/summary'), api.get('/catalog/meta'), api.get('/inventory/history')]).then(
      ([a, b, c]) => {
        setData(a.data);
        setMeta(b.data);
        setHistory(c.data);
      },
    );
  useEffect(() => {
    load();
  }, []);
  async function move(e) {
    e.preventDefault();
    try {
      await api.post('/inventory/transfers', transfer);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <Shell title="Multi-Warehouse Inventory">
      {error && <Notice text={error} />}
      <div className="grid gap-5 md:grid-cols-3">
        <Stat label="Warehouse stock lines" value={data.stocks.length} />
        <Stat label="Stock valuation" value={money(data.value)} />
        <Stat label="Expiring in 30 days" value={data.expiring.length} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={move} className="card space-y-3">
          <h2 className="text-xl font-black">
            <ArrowRightLeft className="inline" /> Warehouse transfer
          </h2>
          <select className="input" onChange={(e) => setTransfer({ ...transfer, product: e.target.value })}>
            <option>Product</option>
            {[...new Map(data.stocks.map((s) => [s.product?._id, s.product])).values()].map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="input" onChange={(e) => setTransfer({ ...transfer, fromWarehouse: e.target.value })}>
            <option>From warehouse</option>
            {meta.warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>
          <select className="input" onChange={(e) => setTransfer({ ...transfer, toWarehouse: e.target.value })}>
            <option>To warehouse</option>
            {meta.warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            placeholder="Quantity"
            onChange={(e) => setTransfer({ ...transfer, quantity: Number(e.target.value) })}
          />
          <input
            className="input"
            placeholder="Reason"
            onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })}
          />
          <button className="btn-primary w-full">Transfer stock</button>
        </form>
        <div className="card overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Product</th>
                <th>Warehouse</th>
                <th>Batch</th>
                <th>Quantity</th>
                <th>Average cost</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {data.stocks.map((s) => (
                <tr key={s._id} className="border-t">
                  <td className="p-3 font-bold">{s.product?.name}</td>
                  <td>{s.warehouse?.name}</td>
                  <td>{s.batch?.batchNo || '—'}</td>
                  <td>{s.quantity}</td>
                  <td>{money(s.averageCost)}</td>
                  <td>{money(s.quantity * s.averageCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card mt-6">
        <h2 className="text-xl font-black">Inventory history</h2>
        {history.map((h) => (
          <div key={h._id} className="grid gap-2 border-b py-3 text-sm md:grid-cols-5">
            <b>{h.product?.name}</b>
            <span>{h.type}</span>
            <span>{h.quantity}</span>
            <span>
              {h.fromWarehouse?.name || h.warehouse?.name || '—'} → {h.toWarehouse?.name || '—'}
            </span>
            <span>{new Date(h.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
export function SalesPro() {
  const [ws, setWs] = useState({ sales: [], returns: [], quotations: [], challans: [] }),
    [customers, setCustomers] = useState([]),
    [products, setProducts] = useState([]),
    [meta, setMeta] = useState({ warehouses: [] }),
    [items, setItems] = useState([{ product: '', quantity: 1, rate: 0, name: '' }]),
    [form, setForm] = useState({ discount: 0, transport: 0, taxRate: 0, payment: 0, paymentMethod: 'cash' }),
    [error, setError] = useState('');
  const load = () =>
    Promise.all([
      api.get('/sales-workspace'),
      api.get('/customers'),
      api.get('/products'),
      api.get('/catalog/meta'),
    ]).then(([a, b, c, d]) => {
      setWs(a.data);
      setCustomers(Array.isArray(b.data) ? b.data : b.data?.data || []);
      setProducts(Array.isArray(c.data) ? c.data : []);
      setMeta(d.data);
    });
  useEffect(() => {
    load();
  }, []);
  const subtotal = useMemo(() => items.reduce((a, i) => a + Number(i.quantity || 0) * Number(i.rate || 0), 0), [items]);
  const total =
    Math.max(subtotal - Number(form.discount || 0) + Number(form.transport || 0), 0) *
    (1 + Number(form.taxRate || 0) / 100);
  function setItem(i, k, v) {
    setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  }
  async function save(e) {
    e.preventDefault();
    try {
      await api.post('/sales-professional', { ...form, items });
      setItems([{ product: '', quantity: 1, rate: 0, name: '' }]);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <Shell title="Professional Sales">
      {error && <Notice text={error} />}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <form onSubmit={save} className="card">
          <h2 className="text-2xl font-black">Multi-item invoice builder</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <select className="input" onChange={(e) => setForm({ ...form, customer: e.target.value })}>
              <option>Customer</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} — {c.village}
                </option>
              ))}
            </select>
            <select className="input" onChange={(e) => setForm({ ...form, warehouse: e.target.value })}>
              <option>Warehouse</option>
              {meta.warehouses.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-5 space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                <select
                  className="input"
                  value={it.product}
                  onChange={(e) => {
                    const p = products.find((x) => x._id === e.target.value);
                    setItem(i, 'product', e.target.value);
                    setItem(i, 'name', p?.name || '');
                    setItem(i, 'rate', p?.salePrice || 0);
                  }}
                >
                  <option>Product</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  value={it.quantity}
                  onChange={(e) => setItem(i, 'quantity', Number(e.target.value))}
                />
                <input
                  className="input"
                  type="number"
                  value={it.rate}
                  onChange={(e) => setItem(i, 'rate', Number(e.target.value))}
                />
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  className="rounded-xl bg-red-50 px-3 text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems([...items, { product: '', quantity: 1, rate: 0, name: '' }])}
            className="mt-3 rounded-xl border px-4 py-2 font-bold"
          >
            <Plus className="inline" size={17} /> Add item
          </button>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {['discount', 'transport', 'taxRate', 'payment'].map((f) => (
              <input
                key={f}
                className="input"
                type="number"
                placeholder={f}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: Number(e.target.value) })}
              />
            ))}
          </div>
          <select
            className="input mt-3"
            value={form.paymentMethod}
            onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
          >
            {['cash', 'bank', 'card', 'online', 'cheque', 'credit'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <div className="mt-5 rounded-2xl bg-green-950 p-5 text-white">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <div className="mt-2 flex justify-between text-xl">
              <span>Grand total</span>
              <b>{money(total)}</b>
            </div>
          </div>
          <button className="btn-primary mt-4 w-full">Create invoice</button>
        </form>
        <div className="card">
          <h2 className="text-xl font-black">Recent invoices</h2>
          {ws.sales.map((s) => (
            <div key={s._id} className="border-b py-4">
              <div className="flex justify-between">
                <b>{s.invoiceNo}</b>
                <span className="rounded-full bg-slate-100 px-2 text-xs uppercase">{s.status}</span>
              </div>
              <div className="text-sm">
                {s.customer?.name} · {money(s.total)}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    const amount = prompt('Payment amount');
                    amount && (await api.post(`/sales/${s._id}/payments`, { amount: Number(amount), method: 'cash' }));
                    load();
                  }}
                  className="text-sm font-bold text-green-700"
                >
                  <CreditCard className="inline" size={15} /> Payment
                </button>
                <button
                  onClick={async () => {
                    if (confirm('Cancel invoice and restore stock?')) {
                      await api.post(`/sales/${s._id}/cancel`, { reason: 'User cancelled' });
                      load();
                    }
                  }}
                  className="text-sm font-bold text-red-700"
                >
                  <RotateCcw className="inline" size={15} /> Cancel
                </button>
                <Link
                  to="#"
                  onClick={() => window.open(`${apiOrigin}/api/invoices/${s._id}`)}
                  className="text-sm font-bold"
                >
                  <Printer className="inline" size={15} /> Invoice data
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
function Stat({ label, value }) {
  return (
    <div className="card">
      <div className="text-sm font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
function Notice({ text }) {
  return <div className="mb-5 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{text}</div>;
}
