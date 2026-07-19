import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
const money = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TrialBalance() {
  const [filters, setFilters] = useState({
    dateFrom: yearStart,
    dateTo: today,
    fiscalYear: '',
    period: '',
    type: '',
    category: '',
    reportingGroup: '',
    branch: '',
    warehouse: '',
    costCenter: '',
    department: '',
    project: '',
    search: '',
    zeroBalance: false,
    hierarchical: false,
    page: 1,
    limit: 50,
  });
  const [report, setReport] = useState(null);
  const [lookups, setLookups] = useState({
    fiscalYears: [],
    periods: [],
    branch: [],
    costCenter: [],
    department: [],
    project: [],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const params = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== false) q.set(key, value);
    });
    return q.toString();
  }, [filters]);

  const loadLookups = async () => {
    const safe = (request) => request.then((r) => r.data || []).catch(() => []);
    const [fiscalYears, periods, branch, costCenter, department, project] = await Promise.all([
      safe(api.get('/accounting/fiscal-years')),
      safe(api.get('/accounting/periods')),
      safe(api.get('/accounting/dimensions/branch')),
      safe(api.get('/accounting/dimensions/cost-center')),
      safe(api.get('/accounting/dimensions/department')),
      safe(api.get('/accounting/dimensions/project')),
    ]);
    setLookups({ fiscalYears, periods, branch, costCenter, department, project });
  };

  const load = async (next = filters) => {
    setLoading(true);
    setMessage('');
    try {
      const q = new URLSearchParams();
      Object.entries(next).forEach(([key, value]) => {
        if (value !== '' && value !== false) q.set(key, value);
      });
      const response = await api.get(`/accounting/reports/trial-balance?${q}`);
      setReport(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    load();
  }, []);
  const change = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? value : 1 }));
  const exportFile = async (extension) => {
    try {
      const response = await api.get(`/accounting/reports/trial-balance/export.${extension}?${params}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `trial-balance.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Export failed');
    }
  };

  const renderRows = (rows = [], depth = 0) =>
    rows.flatMap((row) => [
      <tr key={row.accountId} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800">
        <td className="p-3" style={{ paddingLeft: `${12 + depth * 22}px` }}>
          <b>{row.code}</b> — {row.name}
        </td>
        <td className="p-3">{row.type}</td>
        <td className="p-3">{row.category || '—'}</td>
        <td className="p-3 text-right">{money(row.openingDebit)}</td>
        <td className="p-3 text-right">{money(row.openingCredit)}</td>
        <td className="p-3 text-right">{money(row.periodDebit)}</td>
        <td className="p-3 text-right">{money(row.periodCredit)}</td>
        <td className="p-3 text-right font-bold">{money(row.closingDebit)}</td>
        <td className="p-3 text-right font-bold">{money(row.closingCredit)}</td>
      </tr>,
      ...(row.children?.length ? renderRows(row.children, depth + 1) : []),
    ]);

  const select = (label, key, values) => (
    <label className="text-xs font-bold">
      {label}
      <select
        className="mt-1 w-full rounded-xl border p-2"
        value={filters[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">All</option>
        {values.map((item) => (
          <option key={item._id || item} value={item._id || item}>
            {item.name || item}
          </option>
        ))}
      </select>
    </label>
  );
  const rows = filters.hierarchical ? report?.hierarchy : report?.items;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className="text-xs font-bold">
            From
            <input
              type="date"
              className="mt-1 w-full rounded-xl border p-2"
              value={filters.dateFrom}
              onChange={(e) => change('dateFrom', e.target.value)}
            />
          </label>
          <label className="text-xs font-bold">
            To
            <input
              type="date"
              className="mt-1 w-full rounded-xl border p-2"
              value={filters.dateTo}
              onChange={(e) => change('dateTo', e.target.value)}
            />
          </label>
          {select('Fiscal year', 'fiscalYear', lookups.fiscalYears)}
          {select('Period', 'period', lookups.periods)}
          {select('Account type', 'type', ['asset', 'liability', 'equity', 'income', 'expense'])}
          <label className="text-xs font-bold">
            Search
            <input
              className="mt-1 w-full rounded-xl border p-2"
              value={filters.search}
              onChange={(e) => change('search', e.target.value)}
              placeholder="Code or account"
            />
          </label>
          {select('Branch', 'branch', lookups.branch)}
          {select('Cost center', 'costCenter', lookups.costCenter)}
          {select('Department', 'department', lookups.department)}
          {select('Project', 'project', lookups.project)}
          <label className="text-xs font-bold">
            Category
            <input
              className="mt-1 w-full rounded-xl border p-2"
              value={filters.category}
              onChange={(e) => change('category', e.target.value)}
            />
          </label>
          <label className="text-xs font-bold">
            Reporting group
            <input
              className="mt-1 w-full rounded-xl border p-2"
              value={filters.reportingGroup}
              onChange={(e) => change('reportingGroup', e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={filters.zeroBalance}
              onChange={(e) => change('zeroBalance', e.target.checked)}
            />{' '}
            Include zero balances
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={filters.hierarchical}
              onChange={(e) => change('hierarchical', e.target.checked)}
            />{' '}
            Hierarchical view
          </label>
          <button onClick={() => load()} className="rounded-xl bg-green-700 px-5 py-2 font-bold text-white">
            Generate
          </button>
          <button onClick={() => window.print()} className="rounded-xl border px-4 py-2 font-bold">
            Print
          </button>
          {['pdf', 'xlsx', 'csv'].map((ext) => (
            <button key={ext} onClick={() => exportFile(ext)} className="rounded-xl border px-4 py-2 font-bold">
              {ext.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {message && <div className="rounded-xl bg-red-50 p-3 font-bold text-red-800">{message}</div>}
      {loading && <div>Generating trial balance...</div>}
      {report && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Period Debit</div>
              <div className="text-xl font-black">{money(report.totals?.periodDebit)}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Period Credit</div>
              <div className="text-xl font-black">{money(report.totals?.periodCredit)}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Closing Total</div>
              <div className="text-xl font-black">{money(report.totals?.closingDebit)}</div>
            </div>
            <div
              className={`rounded-2xl p-4 ${report.balanced ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
            >
              <div className="text-xs uppercase">Balance check</div>
              <div className="text-xl font-black">
                {report.balanced ? 'Balanced' : `Difference ${money(report.difference)}`}
              </div>
            </div>
          </div>
          <div className="overflow-auto rounded-2xl border bg-white dark:bg-slate-900">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800">
                  <th className="p-3 text-left">Account</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Category</th>
                  <th colSpan="2" className="p-3">
                    Opening
                  </th>
                  <th colSpan="2" className="p-3">
                    Period Movement
                  </th>
                  <th colSpan="2" className="p-3">
                    Closing
                  </th>
                </tr>
                <tr>
                  <th></th>
                  <th></th>
                  <th></th>
                  <th className="p-2">Debit</th>
                  <th>Credit</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>{renderRows(rows)}</tbody>
              <tfoot>
                <tr className="border-t-2 font-black">
                  <td colSpan="3" className="p-3">
                    Totals
                  </td>
                  <td className="text-right">{money(report.totals?.openingDebit)}</td>
                  <td className="text-right">{money(report.totals?.openingCredit)}</td>
                  <td className="text-right">{money(report.totals?.periodDebit)}</td>
                  <td className="text-right">{money(report.totals?.periodCredit)}</td>
                  <td className="text-right">{money(report.totals?.closingDebit)}</td>
                  <td className="text-right">{money(report.totals?.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!filters.hierarchical && (
            <div className="flex items-center justify-between">
              <button
                disabled={report.pagination?.page <= 1}
                onClick={() => {
                  const next = { ...filters, page: filters.page - 1 };
                  setFilters(next);
                  load(next);
                }}
                className="rounded-xl border px-4 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {report.pagination?.page} of {report.pagination?.pages} · {report.pagination?.total} accounts
              </span>
              <button
                disabled={report.pagination?.page >= report.pagination?.pages}
                onClick={() => {
                  const next = { ...filters, page: filters.page + 1 };
                  setFilters(next);
                  load(next);
                }}
                className="rounded-xl border px-4 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
