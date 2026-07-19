import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value) => (value == null ? '—' : `${Number(value).toFixed(2)}%`);
const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;

export default function CashFlowStatement() {
  const [filters, setFilters] = useState({
    dateFrom: yearStart,
    dateTo: today,
    comparativeFrom: '',
    comparativeTo: '',
    search: '',
    method: 'direct',
    excludeReversals: true,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({ operating: true, investing: true, financing: true });

  const query = useMemo(() => {
    const params = new URLSearchParams({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      method: filters.method,
      excludeReversals: String(filters.excludeReversals),
    });
    if (filters.search) params.set('search', filters.search);
    if (filters.comparativeFrom) params.set('comparativeFrom', filters.comparativeFrom);
    if (filters.comparativeTo) params.set('comparativeTo', filters.comparativeTo);
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData((await api.get(`/accounting/reports/cash-flow?${query}`)).data);
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
      const response = await api.get(`/accounting/reports/cash-flow/export.${ext}?${query}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cash-flow-statement.${ext}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  };

  const section = (key, title) => {
    const items = data?.sections?.[key] || data?.[key] || [];
    return (
      <div className="rounded-2xl border bg-white dark:bg-slate-900">
        <button
          onClick={() => setExpanded({ ...expanded, [key]: !expanded[key] })}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div>
            <div className="text-lg font-black">{title}</div>
            <div className="text-xs text-slate-500">{items.length} transactions</div>
          </div>
          <div className="text-right">
            <div
              className={`text-xl font-black ${Number(data?.totals?.[key]) < 0 ? 'text-red-600' : 'text-green-700'}`}
            >
              {money(data?.totals?.[key])}
            </div>
            <div className="text-xs text-slate-500">{expanded[key] ? 'Collapse' : 'Expand'}</div>
          </div>
        </button>
        {expanded[key] && (
          <div className="overflow-auto border-t">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left dark:bg-slate-800">
                  <th className="p-3">Date</th>
                  <th>Journal</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th>Source</th>
                  <th className="text-right">Inflow</th>
                  <th className="pr-3 text-right">Outflow</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id || item._id} className="border-t">
                    <td className="p-3">{String(item.date).slice(0, 10)}</td>
                    <td>{item.journalNo}</td>
                    <td>
                      {item.accountCode} — {item.accountName}
                    </td>
                    <td>{item.description || '—'}</td>
                    <td>{item.sourceType || 'manual'}</td>
                    <td className="text-right font-bold text-green-700">
                      {item.amount > 0 ? money(item.amount) : '—'}
                    </td>
                    <td className="pr-3 text-right font-bold text-red-600">
                      {item.amount < 0 ? money(Math.abs(item.amount)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && <div className="p-5 text-center text-slate-500">No cash movements in this section.</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
          <input
            type="date"
            className="rounded-xl border p-2"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          />
          <input
            type="date"
            className="rounded-xl border p-2"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          />
          <input
            type="date"
            title="Comparative from"
            className="rounded-xl border p-2"
            value={filters.comparativeFrom}
            onChange={(e) => setFilters({ ...filters, comparativeFrom: e.target.value })}
          />
          <input
            type="date"
            title="Comparative to"
            className="rounded-xl border p-2"
            value={filters.comparativeTo}
            onChange={(e) => setFilters({ ...filters, comparativeTo: e.target.value })}
          />
          <input
            placeholder="Search journal/account"
            className="rounded-xl border p-2"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select
            className="rounded-xl border p-2"
            value={filters.method}
            onChange={(e) => setFilters({ ...filters, method: e.target.value })}
          >
            <option value="direct">Direct method</option>
            <option value="indirect">Indirect view</option>
          </select>
          <button onClick={load} className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white">
            Generate
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.excludeReversals}
            onChange={(e) => setFilters({ ...filters, excludeReversals: e.target.checked })}
          />
          Exclude reversal entries
        </label>
      </div>
      {error && <div className="rounded-xl bg-red-100 p-3 font-bold text-red-800">{error}</div>}
      {loading && <div>Loading cash flow statement...</div>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              ['Opening Cash', data.openingCashBalance],
              ['Cash Inflows', data.inflows],
              ['Cash Outflows', data.outflows],
              ['Net Cash Flow', data.netCashFlow],
              ['Closing Cash', data.closingCashBalance],
              ['Transactions', data.transactionCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                <div className="text-xs uppercase text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-black">
                  {label === 'Transactions' ? Number(value || 0) : money(value)}
                </div>
              </div>
            ))}
          </div>
          <div
            className={`rounded-xl p-4 font-black ${data.reconciled ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
          >
            GL reconciliation: {data.reconciled ? 'Reconciled' : `Difference ${money(data.reconciliationDifference)}`} ·
            Actual closing cash {money(data.actualClosingCashBalance)}
          </div>
          {data.comparative && (
            <div className="grid gap-3 md:grid-cols-4">
              {Object.entries(data.variance || {}).map(([key, value]) => (
                <div key={key} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                  <div className="text-xs uppercase text-slate-500">{key.replaceAll(/([A-Z])/g, ' $1')} variance</div>
                  <div className="text-lg font-black">{money(value.amount)}</div>
                  <div className="text-sm text-slate-500">{percent(value.percentage)}</div>
                </div>
              ))}
            </div>
          )}
          {section('operating', 'Operating Activities')}
          {section('investing', 'Investing Activities')}
          {section('financing', 'Financing Activities')}
          <div className="rounded-2xl bg-green-100 p-5 text-xl font-black text-green-950">
            <div className="flex flex-wrap justify-between gap-3">
              <span>Net increase / decrease in cash</span>
              <span>{money(data.netCashFlow)}</span>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-3 border-t border-green-300 pt-2">
              <span>Closing cash balance</span>
              <span>{money(data.closingCashBalance)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['pdf', 'xlsx', 'csv'].map((ext) => (
              <button key={ext} onClick={() => download(ext)} className="rounded-xl border px-4 py-2 font-bold">
                Export {ext.toUpperCase()}
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
