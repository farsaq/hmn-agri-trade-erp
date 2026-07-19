import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}%`);
const today = () => new Date().toISOString().slice(0, 10);

export default function ProfitLoss() {
  const [filters, setFilters] = useState({
    dateFrom: `${new Date().getFullYear()}-01-01`,
    dateTo: today(),
    category: '',
    reportingGroup: '',
    search: '',
    includeZero: false,
    excludeReversals: false,
  });
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState({ income: true, expense: true });
  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== false) p.set(k, String(v));
    });
    return p.toString();
  }, [filters]);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get(`/accounting/reports/profit-loss?${query}`);
      setData(r.data);
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
    try {
      const r = await api.get(`/accounting/reports/profit-loss/export.${ext}?${query}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `profit-loss.${ext === 'xlsx' ? 'xlsx' : ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.message || 'Export failed');
    }
  };
  const update = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const Section = ({ title, groups, type }) => (
    <div className="rounded-2xl border bg-white dark:bg-slate-900">
      <button
        className="flex w-full items-center justify-between p-4 text-left"
        onClick={() => setExpanded((x) => ({ ...x, [type]: !x[type] }))}
      >
        <span className="text-lg font-black">{title}</span>
        <span>{expanded[type] ? '−' : '+'}</span>
      </button>
      {expanded[type] && (
        <div>
          {groups?.map((group) => (
            <div key={group.name} className="border-t">
              <div className="flex justify-between bg-slate-50 px-4 py-2 font-bold dark:bg-slate-800">
                <span>{group.name}</span>
                <span>{money(group.total)}</span>
              </div>
              {group.items.map((item) => (
                <div key={item.accountId} className="grid grid-cols-[1fr_auto] gap-3 border-t px-4 py-2 text-sm">
                  <span style={{ paddingLeft: `${Math.min(item.level || 0, 4) * 12}px` }}>
                    {item.code} — {item.name}
                    <small className="ml-2 text-slate-500">({item.entries} entries)</small>
                  </span>
                  <b>{money(item.amount)}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-4">
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
            placeholder="Category"
            value={filters.category}
            onChange={(e) => update('category', e.target.value)}
          />
          <input
            className="rounded-xl border p-2"
            placeholder="Reporting group"
            value={filters.reportingGroup}
            onChange={(e) => update('reportingGroup', e.target.value)}
          />
          <input
            className="rounded-xl border p-2 md:col-span-2"
            placeholder="Search account code or name"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.includeZero}
              onChange={(e) => update('includeZero', e.target.checked)}
            />{' '}
            Include zero balances
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.excludeReversals}
              onChange={(e) => update('excludeReversals', e.target.checked)}
            />{' '}
            Exclude reversals
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white" onClick={load}>
            Run Report
          </button>
          {['pdf', 'xlsx', 'csv'].map((ext) => (
            <button key={ext} className="rounded-xl border px-4 py-2 font-bold" onClick={() => download(ext)}>
              {ext.toUpperCase()}
            </button>
          ))}
          <button className="rounded-xl border px-4 py-2 font-bold" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      {error && <div className="rounded-xl bg-red-100 p-3 font-bold text-red-800">{error}</div>}
      {loading && <div>Generating Profit & Loss...</div>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['Revenue', data.totals?.totalIncome],
              ['Gross Profit', data.totals?.grossProfit],
              ['Operating Profit', data.totals?.operatingProfit],
              ['Net Profit', data.totals?.netProfit],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                <div className="text-xs uppercase text-slate-500">{k}</div>
                <div
                  className={`mt-1 text-2xl font-black ${k === 'Net Profit' ? (Number(v) >= 0 ? 'text-green-700' : 'text-red-700') : ''}`}
                >
                  {money(v)}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {Object.entries(data.margins || {}).map(([k, v]) => (
              <div key={k} className="rounded-xl border p-3">
                <div className="text-xs uppercase text-slate-500">{k.replaceAll(/([A-Z])/g, ' $1')}</div>
                <b>{percent(v)}</b>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Income" groups={data.incomeGroups} type="income" />
            <Section title="Expenses" groups={data.expenseGroups} type="expense" />
          </div>
          <div
            className={`rounded-2xl p-5 text-xl font-black ${data.profitable ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
          >
            {data.profitable ? 'Net Profit' : 'Net Loss'}: {money(Math.abs(data.netProfit))}
          </div>
        </>
      )}
    </div>
  );
}
