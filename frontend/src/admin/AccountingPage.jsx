import { useEffect, useState } from 'react';
import api from '../services/api';
import { Shell } from './AdminApp';
import ChartOfAccountsManager from './ChartOfAccountsManager';
import JournalManager from './JournalManager';
import GeneralLedger from './GeneralLedger';
import TrialBalance from './TrialBalance';
import ProfitLoss from './ProfitLoss';
import BalanceSheet from './BalanceSheet';
import CashFlowStatement from './CashFlowStatement';
import FinancialDashboard from './FinancialDashboard';
const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function AccountingPage() {
  const [tab, setTab] = useState('dashboard'),
    [accounts, setAccounts] = useState([]),
    [periods, setPeriods] = useState([]),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState('');
  const [reportType, setReportType] = useState('trial-balance'),
    [report, setReport] = useState(null),
    [dates, setDates] = useState({
      dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      dateTo: new Date().toISOString().slice(0, 10),
    });
  const query = () => `dateFrom=${dates.dateFrom}&dateTo=${dates.dateTo}`;
  const load = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([api.get('/accounting/accounts?limit=200'), api.get('/accounting/periods')]);
      setAccounts(a.data.items || []);
      setPeriods(p.data || []);
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const loadReport = async (type) => {
    setLoading(true);
    setReportType(type);
    try {
      const r = await api.get(`/accounting/reports/${type}?${query()}`);
      setReport(r.data);
      setTab('reports');
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  const exportUrl = async (path) => {
    try {
      const r = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'accounting-export';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e.response?.data?.message || 'Export failed');
    }
  };
  const section = (title, items, total) => (
    <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
      <h3 className="mb-3 font-black">{title}</h3>
      {items?.map((x) => (
        <div key={x._id || x.accountId} className="flex justify-between border-b py-2 text-sm">
          <span>
            {x.code} — {x.name}
          </span>
          <b>{money(x.balance ?? x.debit ?? 0)}</b>
        </div>
      ))}
      <div className="mt-3 flex justify-between font-black">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
  return (
    <Shell title="Accounting & Financial Statements">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {[
            'dashboard',
            'accounts',
            'journals',
            'create',
            'approval',
            'ledger',
            'trial-balance',
            'profit-loss',
            'balance-sheet',
            'cash-flow',
            'reports',
            'periods',
          ].map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={`rounded-xl px-4 py-2 font-bold ${tab === x ? 'bg-green-700 text-white' : 'border bg-white dark:bg-slate-900'}`}
            >
              {x.toUpperCase()}
            </button>
          ))}
        </div>
        {message && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-900">
            {message}
          </div>
        )}
        {loading && <div>Loading accounting data...</div>}
        {tab === 'dashboard' && <FinancialDashboard />}
        {tab === 'accounts' && <ChartOfAccountsManager onChanged={load} />}
        {tab === 'create' && <JournalManager mode="create" accounts={accounts} onChanged={load} />}
        {tab === 'journals' && <JournalManager mode="list" accounts={accounts} onChanged={load} />}
        {tab === 'approval' && <JournalManager mode="approval" accounts={accounts} onChanged={load} />}
        {tab === 'ledger' && <GeneralLedger accounts={accounts} />}
        {tab === 'trial-balance' && <TrialBalance />}
        {tab === 'profit-loss' && <ProfitLoss />}
        {tab === 'balance-sheet' && <BalanceSheet />}
        {tab === 'cash-flow' && <CashFlowStatement />}
        {tab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <input
                type="date"
                className="rounded-xl border p-2"
                value={dates.dateFrom}
                onChange={(e) => setDates({ ...dates, dateFrom: e.target.value })}
              />
              <input
                type="date"
                className="rounded-xl border p-2"
                value={dates.dateTo}
                onChange={(e) => setDates({ ...dates, dateTo: e.target.value })}
              />
              {['trial-balance', 'profit-loss', 'balance-sheet', 'cash-flow'].map((t) => (
                <button
                  key={t}
                  onClick={() => loadReport(t)}
                  className={`rounded-xl border px-3 py-2 font-bold ${reportType === t ? 'bg-green-700 text-white' : ''}`}
                >
                  {t.replaceAll('-', ' ')}
                </button>
              ))}
            </div>
            {report && (
              <>
                <div className="flex gap-2">
                  {['pdf', 'xlsx', 'csv'].map((ext) => (
                    <button
                      key={ext}
                      className="rounded-xl border px-4 py-2 font-bold"
                      onClick={() => exportUrl(`/accounting/reports/${reportType}/export.${ext}?${query()}`)}
                    >
                      {ext.toUpperCase()}
                    </button>
                  ))}
                </div>
                {reportType === 'trial-balance' && (
                  <div className="overflow-auto rounded-2xl border bg-white dark:bg-slate-900">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="p-3 text-left">Account</th>
                          <th>Debit</th>
                          <th>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.items?.map((x) => (
                          <tr key={x.accountId} className="border-t">
                            <td className="p-3">
                              {x.code} — {x.name}
                            </td>
                            <td>{money(x.debit)}</td>
                            <td>{money(x.credit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-4 font-black">
                      Difference: {money(report.difference)} · {report.balanced ? 'Balanced' : 'Not balanced'}
                    </div>
                  </div>
                )}
                {reportType === 'profit-loss' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {section('Income', report.income, report.totalIncome)}
                    {section('Expenses', report.expenses, report.totalExpenses)}
                    <div className="md:col-span-2 rounded-2xl bg-green-100 p-5 text-xl font-black">
                      Net Profit: {money(report.netProfit)}
                    </div>
                  </div>
                )}
                {reportType === 'balance-sheet' && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {section('Assets', report.assets, report.totalAssets)}
                    {section('Liabilities', report.liabilities, report.totalLiabilities)}
                    {section('Equity', report.equity, report.totalEquity)}
                    <div className="md:col-span-3 rounded-2xl border p-4 font-black">
                      Difference: {money(report.difference)}
                    </div>
                  </div>
                )}
                {reportType === 'cash-flow' && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {['operating', 'investing', 'financing'].map((k) => (
                      <div key={k} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                        <h3 className="font-black capitalize">{k}</h3>
                        {report[k]?.map((x) => (
                          <div key={x._id} className="flex justify-between border-b py-2 text-sm">
                            <span>{x.description || x.journalNo}</span>
                            <b>{money(x.amount)}</b>
                          </div>
                        ))}
                        <div className="mt-3 font-black">Total {money(report.totals?.[k])}</div>
                      </div>
                    ))}
                    <div className="md:col-span-3 rounded-2xl bg-green-100 p-5 text-xl font-black">
                      Net Cash Flow: {money(report.netCashFlow)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab === 'periods' && (
          <div className="grid gap-3 md:grid-cols-3">
            {periods.map((p) => (
              <div key={p._id} className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
                <div className="font-black">{p.name}</div>
                <div className="text-sm text-slate-500">
                  {String(p.startDate).slice(0, 10)} — {String(p.endDate).slice(0, 10)}
                </div>
                <div className="mt-2 font-bold">{p.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
