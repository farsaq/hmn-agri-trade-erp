import { useEffect, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  Paperclip,
  Plus,
  Printer,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../services/api';
import { Shell } from './AdminApp';
const money = (v) => `PKR ${Number(v || 0).toLocaleString()}`;
const errMsg = (e) => e?.response?.data?.message || e.message || 'Request failed';

export function ExpensesPro() {
  const [data, setData] = useState({ rows: [], monthlyTotal: 0 }),
    [categories, setCategories] = useState([]),
    [form, setForm] = useState({
      category: 'Fuel',
      paymentMethod: 'cash',
      status: 'approved',
      date: new Date().toISOString().slice(0, 10),
      amount: '',
    }),
    [files, setFiles] = useState([]),
    [filters, setFilters] = useState({}),
    [error, setError] = useState('');
  const load = async () => {
    const [a, b] = await Promise.all([
      api.get('/expenses-professional', { params: filters }),
      api.get('/expense-categories'),
    ]);
    setData(a.data);
    setCategories(b.data);
  };
  useEffect(() => {
    void load().catch((e) => setError(errMsg(e)));
  }, [filters.from, filters.to, filters.category, filters.status]);
  async function save(e) {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append('attachments', f));
      await api.post('/expenses-professional', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm({ ...form, amount: '', description: '', reference: '', vendor: '' });
      setFiles([]);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  async function approve(id, status) {
    await api.post(`/expenses-professional/${id}/approve`, { status });
    await load();
  }
  return (
    <Shell title="Professional Expenses">
      {error && <div className="mb-4 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{error}</div>}
      <div className="grid gap-5 md:grid-cols-3">
        <Stat label="This month" value={money(data.monthlyTotal)} />
        <Stat label="Transactions" value={data.rows.length} />
        <Stat label="Categories" value={categories.length} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={save} className="card space-y-3">
          <h2 className="text-xl font-black">Add expense</h2>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c._id}>{c.name}</option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <input
            className="input"
            type="number"
            min="0"
            required
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <input
            className="input"
            placeholder="Vendor / paid to"
            value={form.vendor || ''}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />
          <textarea
            className="input"
            placeholder="Description"
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <select
            className="input"
            value={form.paymentMethod}
            onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
          >
            {['cash', 'bank', 'card', 'online', 'cheque', 'other'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {['draft', 'pending', 'approved', 'paid'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-bold">
            <Paperclip size={18} /> Attach documents
            <input type="file" multiple className="hidden" onChange={(e) => setFiles([...e.target.files])} />
          </label>
          <button className="btn-primary w-full">
            <Plus size={18} /> Save expense
          </button>
        </form>
        <div>
          <div className="card mb-5 grid gap-3 md:grid-cols-4">
            <input className="input" type="date" onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            <input className="input" type="date" onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            <select className="input" onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c._id}>{c.name}</option>
              ))}
            </select>
            <select className="input" onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All status</option>
              {['draft', 'pending', 'approved', 'rejected', 'paid'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="card overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">No.</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((x) => (
                  <tr key={x._id} className="border-t">
                    <td className="p-3 font-bold">{x.expenseNo}</td>
                    <td>{new Date(x.date).toLocaleDateString()}</td>
                    <td>{x.category}</td>
                    <td>{money(x.amount)}</td>
                    <td>{x.paymentMethod}</td>
                    <td className="uppercase">{x.status}</td>
                    <td>
                      {x.status === 'pending' && (
                        <>
                          <button onClick={() => approve(x._id, 'approved')} className="mr-2 text-green-700">
                            <CheckCircle2 size={18} />
                          </button>
                          <button onClick={() => approve(x._id, 'rejected')} className="text-red-700">
                            <XCircle size={18} />
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
      </div>
    </Shell>
  );
}

export function AdvancedReports() {
  const [period, setPeriod] = useState('monthly'),
    [d, setD] = useState(null),
    [error, setError] = useState('');
  const load = () =>
    api
      .get('/reports/advanced', { params: { period } })
      .then((r) => setD(r.data))
      .catch((e) => setError(errMsg(e)));
  useEffect(() => {
    void load();
  }, [period]);
  const download = (format) => {
    const token = localStorage.getItem('hmn_token');
    fetch(`${api.defaults.baseURL}/reports/export/${format}?period=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `hmn-report.${format === 'excel' ? 'xls' : format}`;
        a.click();
      });
  };
  return (
    <Shell title="Advanced Reports">
      {error && <div className="mb-4 rounded-2xl bg-red-50 p-4">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {['daily', 'weekly', 'monthly', 'yearly'].map((x) => (
          <button
            key={x}
            onClick={() => setPeriod(x)}
            className={`rounded-xl px-4 py-2 font-bold capitalize ${period === x ? 'bg-green-700 text-white' : 'bg-white'}`}
          >
            {x}
          </button>
        ))}
        <button
          onClick={() => download('pdf')}
          className="ml-auto rounded-xl bg-slate-950 px-4 py-2 font-bold text-white"
        >
          <FileText className="inline" size={17} /> PDF
        </button>
        <button onClick={() => download('excel')} className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white">
          <FileSpreadsheet className="inline" size={17} /> Excel
        </button>
        <button onClick={() => download('csv')} className="rounded-xl border bg-white px-4 py-2 font-bold">
          <Download className="inline" size={17} /> CSV
        </button>
      </div>
      {d && (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Sales" value={money(d.summary.sales)} />
            <Stat label="Purchases" value={money(d.summary.purchases)} />
            <Stat label="Expenses" value={money(d.summary.expenses)} />
            <Stat label="Profit / Loss" value={money(d.summary.profit)} />
            <Stat label="Cash inflow" value={money(d.summary.cashFlow.inflows)} />
            <Stat label="Cash outflow" value={money(d.summary.cashFlow.outflows)} />
            <Stat label="Net cash flow" value={money(d.summary.cashFlow.net)} />
            <Stat label="Inventory value" value={money(d.summary.inventoryValue)} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportList title="Expense report" rows={d.expenseByCategory.map((x) => [x._id, money(x.total)])} />
            <ReportList
              title="Tax report"
              rows={[
                ['Sales tax', money(d.tax.salesTax)],
                ['Purchase tax', money(d.tax.purchaseTax)],
                ['Net tax', money(d.tax.netTax)],
              ]}
            />
            <ReportList title="Village-wise sales" rows={d.villages.map((x) => [x._id, money(x.sales)])} />
            <ReportList title="Product-wise profit" rows={d.productProfit.map((x) => [x.name, money(x.profit)])} />
            <ReportList
              title="Customer ledger"
              rows={d.customerLedger.slice(0, 20).map((x) => [x.name, money(x.currentBalance)])}
            />
            <ReportList
              title="Supplier ledger"
              rows={d.supplierLedger.slice(0, 20).map((x) => [x.name, money(x.currentBalance)])}
            />
          </div>
          <div className="card mt-6 overflow-auto">
            <h2 className="text-xl font-black">Stock & inventory valuation</h2>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th>Quantity</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {d.stock.map((x, i) => (
                  <tr key={`${x.product}-${x.warehouse}-${i}`} className="border-t">
                    <td className="py-3">{x.product}</td>
                    <td>{x.warehouse}</td>
                    <td>{x.quantity}</td>
                    <td>{money(x.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}

export function InvoiceCenter() {
  const [ws, setWs] = useState({ sales: [], quotations: [], challans: [] }),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .get('/sales-workspace')
      .then((r) => setWs(r.data))
      .catch((e) => setError(errMsg(e)));
  }, []);
  async function openPdf(url, name) {
    const r = await api.get(url, { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.data);
    a.target = '_blank';
    a.download = name;
    a.click();
  }
  async function sendEmail(id) {
    const to = prompt('Email address');
    if (!to) return;
    await api.post(`/invoices/${id}/email`, { to });
    alert('Invoice email sent');
  }
  async function whatsapp(id) {
    const r = await api.post(`/invoices/${id}/whatsapp`, {});
    window.open(r.data.url, '_blank');
  }
  async function receipt(id) {
    const amount = prompt('Receipt amount');
    if (!amount) return;
    const r = await api.post(`/sales/${id}/receipts`, { amount: Number(amount), method: 'cash' });
    await openPdf(`/receipts/${r.data._id}/pdf`, `${r.data.receiptNo}.pdf`);
  }
  return (
    <Shell title="Invoice & Document Center">
      {error && <div className="mb-4 rounded-2xl bg-red-50 p-4">{error}</div>}
      <div className="card overflow-auto">
        <h2 className="mb-4 text-xl font-black">Sales invoices & receipts</h2>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="p-3">Invoice</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Documents & sharing</th>
            </tr>
          </thead>
          <tbody>
            {ws.sales.map((s) => (
              <tr key={s._id} className="border-t">
                <td className="p-3 font-black">{s.invoiceNo}</td>
                <td>{s.customer?.name}</td>
                <td>{money(s.total)}</td>
                <td>{s.status}</td>
                <td className="space-x-3 whitespace-nowrap">
                  <button
                    onClick={() => openPdf(`/invoices/${s._id}/pdf`, `${s.invoiceNo}.pdf`)}
                    title="Print / download PDF"
                  >
                    <Printer className="inline" size={18} />
                  </button>
                  <button onClick={() => sendEmail(s._id)} title="Email invoice">
                    <Mail className="inline" size={18} />
                  </button>
                  <button onClick={() => whatsapp(s._id)} title="WhatsApp">
                    <MessageCircle className="inline" size={18} />
                  </button>
                  <button onClick={() => receipt(s._id)} title="Payment receipt" className="font-bold text-green-700">
                    Receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-black">Quotation PDFs</h2>
          {ws.quotations?.map((q) => (
            <div key={q._id} className="flex items-center justify-between border-b py-3">
              <div>
                <b>{q.quotationNo}</b>
                <div className="text-sm">
                  {q.customer?.name} · {money(q.total)}
                </div>
              </div>
              <button
                onClick={() => openPdf(`/quotations/${q._id}/pdf`, `${q.quotationNo}.pdf`)}
                className="rounded-xl border px-3 py-2"
              >
                <Printer size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="text-xl font-black">Delivery challan PDFs</h2>
          {ws.challans?.map((c) => (
            <div key={c._id} className="flex items-center justify-between border-b py-3">
              <div>
                <b>{c.challanNo}</b>
                <div className="text-sm">
                  {c.customer?.name} · {c.status}
                </div>
              </div>
              <button
                onClick={() => openPdf(`/challans/${c._id}/pdf`, `${c.challanNo}.pdf`)}
                className="rounded-xl border px-3 py-2"
              >
                <Printer size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        All generated documents include HMN branding, QR code, Code-128 barcode, signature area, terms, print/download
        support, and complete transaction totals.
      </p>
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
function ReportList({ title, rows }) {
  return (
    <div className="card">
      <h2 className="text-xl font-black">{title}</h2>
      {rows.length ? (
        rows.map(([a, b], i) => (
          <div key={`${a}-${i}`} className="flex justify-between border-b py-3">
            <span>{a || 'Unknown'}</span>
            <b>{b}</b>
          </div>
        ))
      ) : (
        <p className="py-5 text-slate-500">No data</p>
      )}
    </div>
  );
}
