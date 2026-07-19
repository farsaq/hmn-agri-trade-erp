import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

export default function GeneralLedger({ accounts = [] }) {
  const [filters, setFilters] = useState({
    account: '',
    dateFrom: yearStart(),
    dateTo: today(),
    search: '',
    journalNo: '',
    includeChildren: true,
    reversal: 'all',
    page: 1,
    limit: 50,
  });
  const [data, setData] = useState({ items: [], summary: {}, pagination: { page: 1, pages: 1, total: 0 } }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [detail, setDetail] = useState(null);
  const query = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined && !(k === 'reversal' && v === 'all')) q.set(k, String(v));
    });
    return q.toString();
  }, [filters]);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/accounting/general-ledger?${query}`);
      setData(response.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [query]);
  const update = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? value : 1 }));
  const exportFile = async (ext) => {
    try {
      const response = await api.get(`/accounting/general-ledger/export.${ext}?${query}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `general-ledger.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.message || 'Export failed');
    }
  };
  const drill = async (id) => {
    try {
      const response = await api.get(`/accounting/general-ledger/${id}/drilldown`);
      setDetail(response.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  };
  const pages = data.pagination?.pages || 1;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-4">
          <select
            className="rounded-xl border p-2"
            value={filters.account}
            onChange={(e) => update('account', e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded-xl border p-2"
            value={filters.dateFrom}
            onChange={(e) => update('dateFrom', e.target.value)}
          />
          <input
            type="date"
            className="rounded-xl border p-2"
            value={filters.dateTo}
            onChange={(e) => update('dateTo', e.target.value)}
          />
          <input
            className="rounded-xl border p-2"
            placeholder="Search journal, account or description"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
          />
          <input
            className="rounded-xl border p-2"
            placeholder="Journal number"
            value={filters.journalNo}
            onChange={(e) => update('journalNo', e.target.value)}
          />
          <select
            className="rounded-xl border p-2"
            value={filters.reversal}
            onChange={(e) => update('reversal', e.target.value)}
          >
            <option value="all">All entries</option>
            <option value="exclude">Exclude reversals</option>
            <option value="only">Reversals only</option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border p-2">
            <input
              type="checkbox"
              checked={filters.includeChildren}
              onChange={(e) => update('includeChildren', e.target.checked)}
            />
            Include child accounts
          </label>
          <select
            className="rounded-xl border p-2"
            value={filters.limit}
            onChange={(e) => update('limit', Number(e.target.value))}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={load} className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white">
            Refresh
          </button>
          {['pdf', 'xlsx', 'csv'].map((ext) => (
            <button key={ext} onClick={() => exportFile(ext)} className="rounded-xl border px-4 py-2 font-bold">
              {ext.toUpperCase()}
            </button>
          ))}
          <button onClick={() => window.print()} className="rounded-xl border px-4 py-2 font-bold">
            Print
          </button>
        </div>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 font-bold text-red-900">{error}</div>}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Opening balance', data.summary?.openingBalance],
          ['Total debit', data.summary?.debit],
          ['Total credit', data.summary?.credit],
          ['Closing balance', data.summary?.closingBalance],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <div className="text-xl font-black">{value == null ? '—' : money(value)}</div>
          </div>
        ))}
      </div>
      <div className="overflow-auto rounded-2xl border bg-white dark:bg-slate-900">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Date</th>
              <th>Journal</th>
              <th>Account</th>
              <th>Description</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th className="text-right">Running balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="p-6 text-center">
                  Loading ledger...
                </td>
              </tr>
            ) : data.items?.length ? (
              data.items.map((row) => (
                <tr key={row._id} className="border-b">
                  <td className="p-3">{String(row.date).slice(0, 10)}</td>
                  <td>{row.journalNo}</td>
                  <td>
                    {row.accountCode} — {row.account?.name}
                  </td>
                  <td>{row.description}</td>
                  <td className="text-right">{money(row.debit)}</td>
                  <td className="text-right">{money(row.credit)}</td>
                  <td className="text-right font-bold">{money(row.runningBalance)}</td>
                  <td>
                    <button onClick={() => drill(row._id)} className="rounded-lg border px-2 py-1 font-bold">
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="p-6 text-center">
                  No ledger entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-2xl border bg-white p-3 dark:bg-slate-900">
        <span className="text-sm">
          {data.pagination?.total || 0} entries · Page {data.pagination?.page || 1} of {pages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={(data.pagination?.page || 1) <= 1}
            onClick={() => update('page', (data.pagination?.page || 1) - 1)}
            className="rounded-xl border px-3 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            disabled={(data.pagination?.page || 1) >= pages}
            onClick={() => update('page', (data.pagination?.page || 1) + 1)}
            className="rounded-xl border px-3 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 dark:bg-slate-900">
            <div className="flex justify-between">
              <h3 className="text-xl font-black">Ledger drill-down</h3>
              <button onClick={() => setDetail(null)} className="rounded-lg border px-3 py-1">
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <b>Journal:</b> {detail.journalNo}
              </div>
              <div>
                <b>Date:</b> {String(detail.date).slice(0, 10)}
              </div>
              <div>
                <b>Account:</b> {detail.accountCode} — {detail.account?.name}
              </div>
              <div>
                <b>Source:</b> {detail.sourceType || 'Manual'}
              </div>
              <div>
                <b>Debit:</b> {money(detail.debit)}
              </div>
              <div>
                <b>Credit:</b> {money(detail.credit)}
              </div>
              <div className="md:col-span-2">
                <b>Description:</b> {detail.description || '—'}
              </div>
              <div className="md:col-span-2">
                <b>Journal narration:</b> {detail.journal?.narration || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
