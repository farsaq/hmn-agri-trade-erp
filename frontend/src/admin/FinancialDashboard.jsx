import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentage = (value) => (value == null ? '—' : `${Number(value).toFixed(2)}%`);
const label = (value) =>
  String(value)
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (m) => m.toUpperCase());

export default function FinancialDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ dateFrom: `${new Date().getFullYear()}-01-01`, dateTo: today });
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams(filters).toString();
      const response = await api.get(`/accounting/reports/dashboard?${query}`);
      setData(response.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const maxTrend = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.trend || []).flatMap((x) => [
          Math.abs(x.revenue || 0),
          Math.abs(x.expenses || 0),
          Math.abs(x.netProfit || 0),
        ]),
      ),
    [data],
  );
  const status =
    data?.kpis?.healthScore >= 80 ? 'Healthy' : data?.kpis?.healthScore >= 60 ? 'Watch' : 'Action required';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <label className="text-sm font-bold">
          From
          <input
            type="date"
            className="mt-1 block rounded-xl border p-2"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          />
        </label>
        <label className="text-sm font-bold">
          To
          <input
            type="date"
            className="mt-1 block rounded-xl border p-2"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          />
        </label>
        <button onClick={load} className="rounded-xl bg-green-700 px-5 py-2.5 font-black text-white">
          Refresh dashboard
        </button>
        <button onClick={() => window.print()} className="rounded-xl border px-5 py-2.5 font-black">
          Print
        </button>
      </div>
      {loading && <div className="rounded-xl border p-4">Loading financial intelligence...</div>}
      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-800">{error}</div>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Financial health</div>
              <div className="mt-1 text-4xl font-black">{data.kpis.healthScore}/100</div>
              <div className="mt-2 font-bold">{status}</div>
            </div>
            {['revenue', 'expenses', 'netProfit'].map((key) => (
              <div key={key} className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
                <div className="text-xs uppercase text-slate-500">{label(key)}</div>
                <div className="mt-1 text-2xl font-black">PKR {money(data.kpis[key])}</div>
                <div
                  className={`mt-2 text-sm font-bold ${(data.variance?.[key]?.amount || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}
                >
                  {(data.variance?.[key]?.amount || 0) >= 0 ? '▲' : '▼'} {percentage(data.variance?.[key]?.percentage)}{' '}
                  vs previous period
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              'assets',
              'liabilities',
              'equity',
              'workingCapital',
              'openingCash',
              'netCashFlow',
              'closingCash',
              'grossProfit',
            ].map((key) => (
              <div key={key} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                <div className="text-xs uppercase text-slate-500">{label(key)}</div>
                <div className="mt-1 text-xl font-black">{money(data.kpis[key])}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
              <h3 className="font-black">Monthly performance trend</h3>
              <div className="mt-5 space-y-4">
                {(data.trend || []).map((row) => (
                  <div key={row.period}>
                    <div className="mb-1 flex justify-between text-sm font-bold">
                      <span>{row.period}</span>
                      <span>Profit {money(row.netProfit)}</span>
                    </div>
                    <div className="space-y-1">
                      <div
                        className="h-2 rounded bg-green-200"
                        style={{ width: `${Math.max(2, (Math.abs(row.revenue) / maxTrend) * 100)}%` }}
                      />
                      <div
                        className="h-2 rounded bg-orange-200"
                        style={{ width: `${Math.max(2, (Math.abs(row.expenses) / maxTrend) * 100)}%` }}
                      />
                      <div
                        className="h-2 rounded bg-blue-200"
                        style={{ width: `${Math.max(2, (Math.abs(row.netProfit) / maxTrend) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
                <h3 className="font-black">Financial ratios</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {Object.entries(data.ratios || {})
                    .slice(0, 10)
                    .map(([key, value]) => (
                      <div key={key} className="rounded-xl border p-3">
                        <div className="text-xs text-slate-500">{label(key)}</div>
                        <div className="font-black">
                          {key.toLowerCase().includes('margin') || key.toLowerCase().includes('return')
                            ? percentage(value)
                            : money(value)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
                <h3 className="font-black">Control checks</h3>
                <div className="mt-3 space-y-2">
                  {Object.entries(data.controls || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between border-b py-2 text-sm">
                      <span>{label(key)}</span>
                      <b>{typeof value === 'boolean' ? (value ? 'PASS' : 'FAIL') : money(value)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
            <h3 className="font-black">Risk alerts</h3>
            {data.alerts?.length ? (
              <div className="mt-3 space-y-2">
                {data.alerts.map((alert) => (
                  <div key={alert.code} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <b>
                      {alert.severity.toUpperCase()} · {alert.code}
                    </b>
                    <div>{alert.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-green-50 p-4 font-bold text-green-800">
                No material financial control alerts detected.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
