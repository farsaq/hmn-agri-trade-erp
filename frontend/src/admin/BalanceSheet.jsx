import { useEffect, useState } from 'react';
import api from '../services/api';
const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function BalanceSheet() {
  const today = new Date().toISOString().slice(0, 10),
    [filters, setFilters] = useState({ dateTo: today, comparativeDate: '', search: '', includeZero: false }),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const query = () =>
    new URLSearchParams({
      dateTo: filters.dateTo,
      ...(filters.comparativeDate && { comparativeDate: filters.comparativeDate }),
      ...(filters.search && { search: filters.search }),
      includeZero: String(filters.includeZero),
    }).toString();
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData((await api.get(`/accounting/reports/balance-sheet?${query()}`)).data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const download = async (ext) => {
    const r = await api.get(`/accounting/reports/balance-sheet/export.${ext}?${query()}`, { responseType: 'blob' });
    const u = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = u;
    a.download = `balance-sheet.${ext}`;
    a.click();
    URL.revokeObjectURL(u);
  };
  const section = (title, obj) => (
    <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
      <h3 className="mb-3 text-lg font-black">{title}</h3>
      {['current', 'nonCurrent'].map((k) => (
        <div key={k} className="mb-4">
          <div className="mb-2 text-xs font-bold uppercase text-slate-500">
            {k === 'current' ? 'Current' : 'Non-current'}
          </div>
          {obj?.[k]?.map((x) => (
            <div key={x.accountId} className="flex justify-between border-b py-2 text-sm">
              <span style={{ paddingLeft: `${Math.min(x.level, 4) * 12}px` }}>
                {x.code} — {x.name}
              </span>
              <b>{money(x.balance)}</b>
            </div>
          ))}
          <div className="mt-2 flex justify-between font-bold">
            <span>{k === 'current' ? 'Current' : 'Non-current'} total</span>
            <span>{money(obj?.[`${k}Total`])}</span>
          </div>
        </div>
      ))}
      {title === 'Equity' && (
        <div className="flex justify-between border-b py-2 text-sm">
          <span>Retained earnings / current profit</span>
          <b>{money(obj?.retainedEarnings)}</b>
        </div>
      )}
      <div className="mt-3 flex justify-between text-lg font-black">
        <span>Total {title}</span>
        <span>{money(obj?.total)}</span>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            type="date"
            className="rounded-xl border p-2"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          />
          <input
            type="date"
            className="rounded-xl border p-2"
            value={filters.comparativeDate}
            onChange={(e) => setFilters({ ...filters, comparativeDate: e.target.value })}
          />
          <input
            placeholder="Search account"
            className="rounded-xl border p-2"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.includeZero}
              onChange={(e) => setFilters({ ...filters, includeZero: e.target.checked })}
            />
            Include zero
          </label>
          <button onClick={load} className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white">
            Generate
          </button>
        </div>
      </div>
      {error && <div className="rounded-xl bg-red-100 p-3 font-bold text-red-800">{error}</div>}
      {loading && <div>Loading balance sheet...</div>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['Assets', data.totalAssets],
              ['Liabilities', data.totalLiabilities],
              ['Equity', data.totalEquity],
              ['Difference', data.difference],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                <div className="text-xs uppercase text-slate-500">{k}</div>
                <div className="text-2xl font-black">{money(v)}</div>
              </div>
            ))}
          </div>
          <div
            className={`rounded-xl p-4 font-black ${data.balanced ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
          >
            {data.balanced ? 'Balance sheet is balanced' : 'Assets do not equal liabilities plus equity'}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {section('Assets', data.assets)}
            {section('Liabilities', data.liabilities)}
            {section('Equity', data.equity)}
          </div>
          <div className="flex flex-wrap gap-2">
            {['pdf', 'xlsx', 'csv'].map((x) => (
              <button key={x} onClick={() => download(x)} className="rounded-xl border px-4 py-2 font-bold">
                Export {x.toUpperCase()}
              </button>
            ))}
            <button onClick={() => window.print()} className="rounded-xl border px-4 py-2 font-bold">
              Print
            </button>
          </div>
        </>
      )}
    </div>
  );
}
