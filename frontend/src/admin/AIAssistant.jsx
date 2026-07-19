import { useEffect, useMemo, useState } from 'react';
import { Bot, BrainCircuit, Search, Sparkles, TrendingUp, AlertTriangle, PackageSearch, Send } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import api from '../services/api';
import { Shell } from './AdminApp';
const money = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const examples = [
  'Highest pending customer kaun hai?',
  'Is month kitna profit hua?',
  'Kaunsa product low stock mein hai?',
  'Top 10 customers dikhao.',
  'Is week kitni sales hui?',
  'Sabse zyada wheat kis village ne kharidi?',
  'Kitna cash outstanding hai?',
  'Next month sales aur profit forecast karo.',
  'Customer buying trends dikhao.',
  'Price recommendations do.',
  'Is month purchases kitni hui?',
  'Approved expenses kitne hain?',
];
export default function AIAssistant() {
  const [dash, setDash] = useState(null),
    [forecast, setForecast] = useState(null),
    [question, setQuestion] = useState(''),
    [reply, setReply] = useState(null),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState(''),
    [results, setResults] = useState(null),
    [days, setDays] = useState(30),
    [report, setReport] = useState(null),
    [history, setHistory] = useState([]),
    [error, setError] = useState('');
  const load = async () => {
    try {
      setError('');
      const [a, b, c, d] = await Promise.all([
        api.get('/ai-pro/dashboard'),
        api.get('/ai-pro/forecasts'),
        api.get('/ai-pro/report-summary', { params: { days } }),
        api.get('/ai-pro/history', { params: { limit: 10 } }),
      ]);
      setDash(a.data);
      setForecast(b.data);
      setReport(c.data);
      setHistory(d.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  };
  useEffect(() => {
    void load();
  }, [days]);
  useEffect(() => {
    if (search.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(
      () =>
        api
          .get('/ai-pro/search', { params: { q: search } })
          .then((r) => setResults(r.data))
          .catch(() => {}),
      350,
    );
    return () => clearTimeout(t);
  }, [search]);
  const ask = async (q) => {
    const value = (q ?? question).trim();
    if (!value) return;
    setQuestion(value);
    setLoading(true);
    setError('');
    try {
      setReply((await api.post('/ai-pro/query', { question: value })).data);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  const combined = useMemo(
    () =>
      forecast
        ? forecast.series.sales.map((x, i) => ({
            month: x.month,
            sales: x.value,
            purchases: forecast.series.purchases[i]?.value || 0,
            expenses: forecast.series.expenses[i]?.value || 0,
          }))
        : [],
    [forecast],
  );
  return (
    <Shell title="AI Business Assistant">
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-green-900 to-emerald-700 p-7 text-white">
        <div className="flex items-center gap-3">
          <BrainCircuit size={34} />
          <div>
            <h2 className="text-3xl font-black">HMN Business Intelligence</h2>
            <p className="text-green-100">
              Ask questions, review forecasts, search ERP data and receive action-oriented recommendations.
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-4xl text-lg font-semibold">{dash?.businessSummary || 'Loading business summary...'}</p>
      </div>
      {error && <div className="mb-5 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Bot className="text-green-700" />
            <h3 className="text-xl font-black">Ask HMN AI</h3>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              className="input flex-1"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder="Ask about sales, profit, customers, villages, stock or forecasts..."
            />
            <button onClick={() => ask()} disabled={loading} className="rounded-xl bg-green-700 px-5 text-white">
              <Send />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((x) => (
              <button
                key={x}
                onClick={() => ask(x)}
                className="rounded-full bg-green-50 px-3 py-2 text-xs font-bold text-green-800 dark:bg-green-950 dark:text-green-200"
              >
                {x}
              </button>
            ))}
          </div>
          {loading && <p className="mt-6 font-bold text-slate-500">Analyzing ERP data...</p>}
          {reply && (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950">
              <p className="text-xs font-black uppercase tracking-wider text-green-700">
                {reply.intent} · {reply.provider}
              </p>
              <p className="mt-2 text-lg font-bold">{reply.answer}</p>
            </div>
          )}
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Search className="text-green-700" />
            <h3 className="text-xl font-black">AI Smart Search</h3>
          </div>
          <input
            className="input mt-4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, product, invoice, village, supplier, vehicle, driver, barcode or QR"
          />
          {results && (
            <div className="mt-4 max-h-72 overflow-auto">
              <p className="mb-2 text-xs font-black text-slate-500">{results.total} RESULTS</p>
              {Object.entries(results.groups).map(
                ([group, items]) =>
                  items.length > 0 && (
                    <div key={group} className="mb-3">
                      <p className="text-xs font-black uppercase text-green-700">{group}</p>
                      {items.slice(0, 6).map((x, i) => (
                        <div key={x._id || i} className="border-b py-2 text-sm">
                          <b>{x.name || x.invoiceNo || x.purchaseNo}</b>
                          <span className="ml-2 text-slate-500">
                            {x.village || x.sku || x.vehicle || x.customer?.name || x.supplier?.name || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ),
              )}
            </div>
          )}
        </section>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {[
          ['Daily insight', dash?.daily?.text],
          ['Weekly summary', dash?.weekly?.text],
          ['Monthly summary', dash?.monthly?.text],
        ].map(([a, b]) => (
          <div key={a} className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
            <Sparkles className="text-green-700" />
            <h3 className="mt-3 text-lg font-black">{a}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{b}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <h3 className="text-xl font-black">12-month business trend</h3>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combined}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke="#15803d" strokeWidth={3} />
                <Line type="monotone" dataKey="purchases" stroke="#0f172a" strokeWidth={2} />
                <Line type="monotone" dataKey="expenses" stroke="#b91c1c" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <TrendingUp className="text-green-700" />
          <h3 className="mt-3 text-xl font-black">Next-month forecast</h3>
          {forecast && (
            <div className="mt-5 space-y-4">
              {Object.entries(forecast.nextMonth).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-3">
                  <span className="capitalize text-slate-500">{k}</span>
                  <b>{money(v)}</b>
                </div>
              ))}
              <p className="text-xs leading-5 text-slate-500">{forecast.method}</p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-600" />
            <h3 className="text-xl font-black">AI recommendations & warnings</h3>
          </div>
          <div className="mt-4 space-y-3">
            {(dash?.recommendations || []).map((x, i) => (
              <div key={i} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="font-black">{x.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{x.message}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageSearch className="text-green-700" />
              <h3 className="text-xl font-black">Inventory forecast</h3>
            </div>
          </div>
          <div className="mt-4 max-h-96 overflow-auto">
            {(forecast?.inventory || []).slice(0, 15).map((x) => (
              <div key={x.productId} className="grid grid-cols-4 gap-2 border-b py-3 text-sm">
                <b>{x.name}</b>
                <span>Stock {x.currentStock}</span>
                <span>Demand {x.predictedMonthlyDemand}</span>
                <span className={x.recommendedOrder > 0 ? 'font-black text-red-600' : ''}>
                  Order {x.recommendedOrder}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <h3 className="text-xl font-black">Customer buying trends</h3>
          <div className="mt-4 max-h-80 overflow-auto">
            {(forecast?.customerBuyingTrends || []).slice(0, 12).map((x, i) => (
              <div
                key={`${x.customerId || i}-${x.productId || i}`}
                className="grid grid-cols-3 gap-2 border-b py-3 text-sm"
              >
                <b>{x.customer || 'Unknown'}</b>
                <span>{x.product || x.category || 'Product'}</span>
                <span>
                  {Number(x.quantity || 0).toLocaleString()} units · {money(x.value)}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <h3 className="text-xl font-black">Price recommendations</h3>
          <div className="mt-4 max-h-80 overflow-auto">
            {(forecast?.priceRecommendations || []).slice(0, 12).map((x) => (
              <div key={x.productId} className="border-b py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <b>{x.name}</b>
                  <span className={x.grossMarginPercent < 8 ? 'font-black text-red-600' : 'font-bold text-green-700'}>
                    {x.grossMarginPercent}% margin
                  </span>
                </div>
                <p className="mt-1 text-slate-500">{x.recommendation}</p>
              </div>
            ))}
          </div>
          {forecast?.dataQuality && (
            <p className="mt-4 text-xs text-slate-500">
              Forecast confidence: <b>{forecast.dataQuality.confidence}</b> ({forecast.dataQuality.monthsWithSales}{' '}
              months with sales data)
            </p>
          )}
        </section>
      </div>
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <h3 className="text-xl font-black">Recent AI query history</h3>
        <div className="mt-4 space-y-3">
          {history.length ? (
            history.map((x) => (
              <div key={x._id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <div className="flex flex-wrap justify-between gap-2">
                  <b>{x.question}</b>
                  <span className="text-xs text-slate-500">{new Date(x.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{x.answer || x.error}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No AI queries yet.</p>
          )}
        </div>
      </section>
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-black">AI report summary</h3>
          <div className="flex gap-2">
            {[
              [1, 'Daily'],
              [7, 'Weekly'],
              [30, 'Monthly'],
              [365, 'Yearly'],
            ].map(([x, n]) => (
              <button
                key={x}
                onClick={() => setDays(x)}
                className={`rounded-xl px-4 py-2 text-sm font-black ${days === x ? 'bg-green-700 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {report && (
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div>
              <p className="font-bold">{report.summary}</p>
            </div>
            <div>
              <p className="mb-2 font-black text-amber-700">Warnings</p>
              {report.warnings.map((x, i) => (
                <p key={i} className="mb-2 text-sm">
                  • {x}
                </p>
              ))}
            </div>
            <div>
              <p className="mb-2 font-black text-green-700">Recommended actions</p>
              {report.actions.map((x, i) => (
                <p key={i} className="mb-2 text-sm">
                  • {x}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>
    </Shell>
  );
}
