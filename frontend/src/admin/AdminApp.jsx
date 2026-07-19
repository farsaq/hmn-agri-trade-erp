import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  Warehouse,
  ShoppingCart,
  ReceiptText,
  BookOpen,
  ChartNoAxesCombined,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  Search,
  Sparkles,
  WalletCards,
  Bell,
  Sun,
  Moon,
  TrendingUp,
  AlertTriangle,
  Activity,
  ScrollText,
  UserCog,
  Bot,
  PlugZap,
} from 'lucide-react';
import api, { apiOrigin } from '../services/api';
import { useAuth } from '../context/Auth';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
const nav = [
  ['Dashboard', '/admin', LayoutDashboard],
  ['AI Assistant', '/admin/ai', Bot],
  ['Customers', '/admin/customers', Users],
  ['Suppliers', '/admin/suppliers', Truck],
  ['Products', '/admin/products', Package],
  ['Inventory', '/admin/inventory', Warehouse],
  ['Purchases', '/admin/purchases', ShoppingCart],
  ['Sales', '/admin/sales', ReceiptText],
  ['Khata', '/admin/khata', BookOpen],
  ['Accounting', '/admin/accounting', BookOpen],
  ['Expenses', '/admin/expenses', WalletCards],
  ['Reports', '/admin/reports', ChartNoAxesCombined],
  ['Invoices', '/admin/invoices', ReceiptText],
  ['Notifications', '/admin/notifications', Bell],
  ['Audit Logs', '/admin/audit-logs', ScrollText],
  ['Roles & Permissions', '/admin/roles', UserCog],
  ['Integrations', '/admin/integrations', PlugZap],
  ['Settings', '/admin/settings', Settings],
  ['Security', '/admin/security', ShieldCheck],
];
const permissionMap = {
  '/admin': 'dashboard.view',
  '/admin/ai': 'ai.view',
  '/admin/customers': 'customers.view',
  '/admin/suppliers': 'suppliers.view',
  '/admin/products': 'products.view',
  '/admin/inventory': 'inventory.view',
  '/admin/purchases': 'purchases.view',
  '/admin/sales': 'sales.view',
  '/admin/khata': 'ledger.view',
  '/admin/accounting': 'accounting.view',
  '/admin/expenses': 'expenses.view',
  '/admin/reports': 'reports.view',
  '/admin/invoices': 'sales.view',
  '/admin/notifications': 'notifications.view',
  '/admin/audit-logs': 'audit.view',
  '/admin/roles': 'roles.view',
  '/admin/integrations': 'integrations.view',
  '/admin/settings': 'settings.view',
  '/admin/security': 'security.view',
};
const can = (user, p) =>
  user?.role === 'admin' ||
  user?.permissions?.includes('*') ||
  user?.permissions?.includes(p) ||
  user?.permissions?.includes(p?.split('.')[0] + '.*');
export function Shell({ children, title }) {
  const [open, setOpen] = useState(false),
    [dark, setDark] = useState(() => localStorage.getItem('hmn_dark') === '1'),
    [notifications, setNotifications] = useState({ items: [], unread: 0 }),
    [showNotifications, setShowNotifications] = useState(false),
    { user, logout } = useAuth(),
    navg = useNavigate();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('hmn_dark', dark ? '1' : '0');
  }, [dark]);
  useEffect(() => {
    let active = true;
    api
      .get('/notifications-realtime')
      .then((r) => active && setNotifications(r.data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const token = localStorage.getItem('hmn_token');
    if (!token) return;
    const socket = io(apiOrigin, { auth: { token } });
    socket.on('notification:new', (n) =>
      setNotifications((prev) => ({ items: [n, ...prev.items], unread: prev.unread + 1 })),
    );
    return () => socket.disconnect();
  }, []);
  return (
    <div className="admin-shell flex h-screen overflow-hidden dark:bg-slate-950 dark:text-slate-100">
      <aside
        className={`fixed inset-y-0 z-40 flex h-screen w-72 flex-col overflow-hidden bg-green-950 p-5 text-white transition lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-3 px-2 py-4">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-lime-300 font-black text-green-950">H</div>
          <div>
            <div className="font-black">HMN Admin</div>
            <div className="text-xs text-green-300">Enterprise ERP v5.7.8</div>
          </div>
        </div>
        <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pb-6">
          {nav
            .filter(([, p]) => can(user, permissionMap[p]))
            .map(([n, p, I]) => (
              <NavLink
                key={p}
                end={p === '/admin'}
                to={p}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold ${isActive ? 'bg-lime-300 text-green-950' : 'text-green-100 hover:bg-white/10'}`
                }
              >
                <I size={19} />
                {n}
              </NavLink>
            ))}
        </nav>
        <button
          onClick={async () => {
            await logout();
            navg('/admin/login');
          }}
          className="mt-auto shrink-0 border-t border-white/10 flex items-center gap-3 px-4 py-4 text-green-200 hover:bg-white/10"
        >
          <LogOut /> Logout
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:pl-72">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(!open)}>
              <Menu />
            </button>
            <div>
              <h1 className="text-2xl font-black">{title}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Welcome, {user?.name} · {user?.role}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SmartSearch />
            <button
              aria-label="Toggle dark mode"
              onClick={() => setDark(!dark)}
              className="grid h-10 w-10 place-items-center rounded-xl border bg-white dark:border-slate-700 dark:bg-slate-900"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <button
                aria-label="Notifications"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative grid h-10 w-10 place-items-center rounded-xl border bg-white dark:border-slate-700 dark:bg-slate-900"
              >
                <Bell size={18} />
                {notifications.unread > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-black text-white">
                    {notifications.unread}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 max-h-96 w-[min(360px,90vw)] overflow-auto rounded-2xl border bg-white p-3 shadow-premium dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between px-2 py-2">
                    <span className="font-black">Notifications</span>
                    <a href="/admin/notifications" className="text-xs font-bold text-green-700">
                      View all
                    </a>
                  </div>
                  {notifications.items.length ? (
                    notifications.items.slice(0, 12).map((n, i) => (
                      <button
                        key={n._id || `${n.title}-${i}`}
                        onClick={async () => {
                          if (!n.read) {
                            await api.patch(`/notifications-realtime/${n._id}/read`).catch(() => {});
                            setNotifications((prev) => ({
                              items: prev.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)),
                              unread: Math.max(0, prev.unread - 1),
                            }));
                          }
                          if (n.link) navg(n.link);
                          setShowNotifications(false);
                        }}
                        className="block rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <p className="text-sm font-black">{n.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{n.message}</p>
                      </button>
                    ))
                  ) : (
                    <p className="p-3 text-sm text-slate-500">No notifications</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
function SmartSearch() {
  const [q, setQ] = useState(''),
    [r, setR] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => q.length > 1 && setR((await api.get('/search', { params: { q } })).data), 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative hidden md:block">
      <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Smart search..."
        className="rounded-xl border py-2 pl-10 pr-4"
      />
      {r && q && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white p-4 shadow-premium">
          <p className="text-xs font-black text-slate-500">RESULTS</p>
          {[...r.customers, ...r.suppliers, ...r.products].slice(0, 8).map((x) => (
            <div key={x._id || `${x.name}-${x.email || ''}`} className="border-b py-2 text-sm font-bold">
              {x.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function Dashboard() {
  const [d, setD] = useState(null),
    [ai, setAi] = useState(null),
    [analytics, setAnalytics] = useState(null),
    [days, setDays] = useState(30),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([api.get('/dashboard'), api.get('/ai/insights'), api.get('/dashboard/analytics', { params: { days } })])
      .then(([a, b, c]) => {
        if (active) {
          setD(a.data);
          setAi(b.data);
          setAnalytics(c.data);
        }
      })
      .catch((e) => active && setError(e.response?.data?.message || e.message));
    return () => {
      active = false;
    };
  }, [days]);
  const cards = useMemo(
    () =>
      d
        ? [
            ['Today Sales', d.todaySales, TrendingUp],
            ['Today Purchases', d.todayPurchases, ShoppingCart],
            ['Profit', d.profit, ChartNoAxesCombined],
            ['Stock', d.stock, Warehouse],
            ['Customers', d.customers, Users],
            ['Pending Payments', d.pendingPayments, AlertTriangle],
            ['Expenses', d.expenses, WalletCards],
            ['Cash Balance', d.cashBalance, Activity],
          ]
        : [],
    [d],
  );
  const currency = (v) => `PKR ${Number(v || 0).toLocaleString()}`;
  const paymentPie = analytics
    ? [
        { name: 'Pending', value: Number(analytics.paymentStatus?.pending || 0) },
        { name: 'Available cash', value: Math.max(Number(d?.cashBalance || 0), 0) },
      ]
    : [];
  return (
    <Shell title="Dashboard">
      {error && <div className="mb-5 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{error}</div>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([a, b, I]) => (
          <div key={a} className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-500">{a}</p>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-green-50 text-green-700 dark:bg-green-950">
                <I size={19} />
              </span>
            </div>
            <p className="mt-3 text-3xl font-black">
              {typeof b === 'number' && a !== 'Stock' && a !== 'Customers'
                ? currency(b)
                : Number(b || 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Business analytics</h2>
          <p className="text-sm text-slate-500">Sales, purchases, expenses and profit trend</p>
        </div>
        <div className="flex rounded-xl bg-white p-1 dark:bg-slate-900">
          {[
            [7, '7D'],
            [30, '30D'],
            [90, '90D'],
          ].map(([x, n]) => (
            <button
              key={x}
              onClick={() => setDays(x)}
              className={`rounded-lg px-4 py-2 text-sm font-black ${days === x ? 'bg-green-700 text-white' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics?.trend || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#15803d" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#15803d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} minTickGap={28} />
                <YAxis tickFormatter={(x) => Number(x).toLocaleString()} />
                <Tooltip formatter={(v) => currency(v)} />
                <Legend />
                <Area type="monotone" dataKey="sales" stroke="#15803d" fill="url(#salesFill)" strokeWidth={3} />
                <Area type="monotone" dataKey="purchases" stroke="#0f172a" fillOpacity={0} strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="#dc2626" fillOpacity={0} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h3 className="text-lg font-black">Payment position</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentPie}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  <Cell fill="#dc2626" />
                  <Cell fill="#16a34a" />
                </Pie>
                <Tooltip formatter={(v) => currency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-sm text-slate-500">
            {analytics?.paymentStatus?.creditCustomers || 0} customers with pending balances
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <h3 className="text-xl font-black">Top customers</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.topCustomers || []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(x) => Number(x).toLocaleString()} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip formatter={(v) => currency(v)} />
                <Bar dataKey="total" fill="#15803d" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <h3 className="text-xl font-black">Top products</h3>
          <div className="mt-5 space-y-4">
            {(analytics?.topProducts || []).length ? (
              analytics.topProducts.map((p, i) => (
                <div
                  key={p._id || p.name || i}
                  className="flex items-center justify-between border-b pb-4 dark:border-slate-800"
                >
                  <div>
                    <p className="font-black">{p.name || 'Product'}</p>
                    <p className="text-xs text-slate-500">Quantity: {Number(p.quantity || 0).toLocaleString()}</p>
                  </div>
                  <b>{currency(p.revenue)}</b>
                </div>
              ))
            ) : (
              <p className="text-slate-500">Sales data will appear here after transactions.</p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-7 rounded-3xl bg-green-950 p-7 text-white">
        <div className="flex items-center gap-3">
          <Sparkles className="text-lime-300" />
          <h2 className="text-2xl font-black">AI Business Insights</h2>
        </div>
        <p className="mt-4 text-green-100">{ai?.summary || 'Analyzing business data...'}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {ai?.inventoryForecast?.slice(0, 3).map((x) => (
            <div key={x.product} className="rounded-2xl bg-white/10 p-4">
              <b>{x.product}</b>
              <p className="mt-1 text-sm text-green-200">{x.recommendation}</p>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
const fields = {
  customers: ['name', 'fatherName', 'cnic', 'phone', 'village', 'address', 'openingBalance', 'currentBalance', 'notes'],
  suppliers: ['name', 'company', 'phone', 'cnic', 'address', 'openingBalance', 'currentBalance', 'notes'],
  products: [
    'name',
    'category',
    'grade',
    'quality',
    'unit',
    'purchasePrice',
    'salePrice',
    'availableStock',
    'minimumStock',
    'warehouse',
    'barcode',
  ],
  expenses: ['date', 'category', 'amount', 'description', 'paymentMethod'],
  users: ['name', 'email', 'password', 'role'],
};
export function CrudPage({ type, title }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  const [edit, setEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pageFields = fields[type] || [];

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/' + type);
      const payload = response?.data;
      const normalized = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.items)
            ? payload.items
            : [];
      setRows(normalized);
      if (!Array.isArray(payload) && !Array.isArray(payload?.data) && !Array.isArray(payload?.items)) {
        console.warn(`Unexpected ${type} response:`, payload);
      }
    } catch (err) {
      console.error(`Failed to load ${type}:`, err);
      setRows([]);
      setError(err?.response?.data?.message || err.message || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [type]);

  const save = async (e) => {
    e.preventDefault();
    try {
      setError('');
      if (edit) await api.put(`/${type}/${edit}`, form);
      else await api.post('/' + type, form);
      setForm({});
      setEdit(null);
      await load();
    } catch (err) {
      console.error(`Failed to save ${type}:`, err);
      setError(err?.response?.data?.message || err.message || `Failed to save ${title}`);
    }
  };

  if (!pageFields.length) {
    return (
      <Shell title={title}>
        <div className="rounded-2xl bg-red-50 p-5 font-bold text-red-700">Unknown module: {type}</div>
      </Shell>
    );
  }

  return (
    <Shell title={title}>
      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={save} className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            {edit ? 'Edit' : 'Add'} {title.slice(0, -1)}
          </h2>
          <div className="mt-5 space-y-3">
            {pageFields.map((f) => (
              <input
                key={f}
                name={f}
                required={['name', 'phone', 'email', 'category', 'amount'].includes(f)}
                type={
                  [
                    'openingBalance',
                    'currentBalance',
                    'purchasePrice',
                    'salePrice',
                    'availableStock',
                    'minimumStock',
                    'amount',
                  ].includes(f)
                    ? 'number'
                    : f === 'date'
                      ? 'date'
                      : f === 'password'
                        ? 'password'
                        : 'text'
                }
                placeholder={f.replace(/([A-Z])/g, ' $1')}
                value={form[f] ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    [f]:
                      e.target.type === 'number'
                        ? e.target.value === ''
                          ? ''
                          : Number(e.target.value)
                        : e.target.value,
                  }))
                }
                className="input"
              />
            ))}
          </div>
          <button type="submit" className="mt-5 w-full rounded-xl bg-green-700 py-3 font-black text-white">
            {edit ? 'Update' : 'Save'}
          </button>
          {edit && (
            <button
              type="button"
              onClick={() => {
                setEdit(null);
                setForm({});
              }}
              className="mt-2 w-full rounded-xl bg-slate-200 py-3 font-bold"
            >
              Cancel edit
            </button>
          )}
        </form>

        <div className="overflow-auto rounded-3xl bg-white p-5 shadow-sm">
          {loading ? (
            <p className="p-4 text-slate-500">Loading {title.toLowerCase()}...</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {pageFields.slice(0, 6).map((f) => (
                    <th key={f} className="p-3 capitalize">
                      {f}
                    </th>
                  ))}
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={pageFields.slice(0, 6).length + 1} className="p-6 text-center text-slate-500">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, index) => (
                    <tr key={r?._id || `${type}-${index}`} className="border-t">
                      {pageFields.slice(0, 6).map((f) => (
                        <td key={`${r?._id || index}-${f}`} className="p-3">
                          {String(r?.[f] ?? '')}
                        </td>
                      ))}
                      <td className="whitespace-nowrap p-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEdit(r._id);
                            setForm({ ...r });
                          }}
                          className="mr-2 font-bold text-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (confirm('Delete record?')) {
                                await api.delete(`/${type}/${r._id}`);
                                await load();
                              }
                            } catch (err) {
                              setError(err?.response?.data?.message || err.message);
                            }
                          }}
                          className="font-bold text-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}
export function Inventory() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get('/products').then((r) => setRows(r.data));
  }, []);
  return (
    <Shell title="Inventory">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((p) => (
          <div
            key={p._id}
            className={`rounded-3xl bg-white p-6 shadow-sm ${p.availableStock <= p.minimumStock ? 'ring-2 ring-red-400' : ''}`}
          >
            <p className="text-sm font-bold text-green-700">{p.category}</p>
            <h3 className="mt-2 text-2xl font-black">{p.name}</h3>
            <p className="mt-4 text-4xl font-black">
              {p.availableStock} <span className="text-base text-slate-500">{p.unit}</span>
            </p>
            <p className="mt-2 text-sm">Minimum: {p.minimumStock}</p>
            <p className="mt-1 text-sm">Warehouse: {p.warehouse || 'Not set'}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}
export function Reports() {
  const [d, setD] = useState(null),
    [days, setDays] = useState(30);
  useEffect(() => {
    api.get('/reports', { params: { days } }).then((r) => setD(r.data));
  }, [days]);
  return (
    <Shell title="Reports">
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
            className={`rounded-xl px-4 py-2 font-bold ${days === x ? 'bg-green-700 text-white' : 'bg-white'}`}
          >
            {n}
          </button>
        ))}
      </div>
      {d && (
        <>
          <div className="mt-6 grid gap-5 md:grid-cols-4">
            {[
              ['Sales', d.sales.total],
              ['Purchases', d.purchases.total],
              ['Expenses', d.expenses.total],
              ['Profit / Loss', d.profit],
            ].map(([a, b]) => (
              <div key={a} className="rounded-3xl bg-white p-6">
                <p className="text-sm text-slate-500">{a}</p>
                <p className="mt-2 text-2xl font-black">PKR {Number(b || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl bg-white p-6">
              <h3 className="text-xl font-black">Stock Report</h3>
              {d.stock.map((x) => (
                <div key={x._id || x.name} className="flex justify-between border-b py-3">
                  <span>{x.name}</span>
                  <b>{x.availableStock}</b>
                </div>
              ))}
            </div>
            <div className="rounded-3xl bg-white p-6">
              <h3 className="text-xl font-black">Customer Ledger</h3>
              {d.customerLedger.slice(0, 10).map((x) => (
                <div key={x._id || x.name} className="flex justify-between border-b py-3">
                  <span>{x.name}</span>
                  <b>PKR {x.currentBalance}</b>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
export function SettingsPage() {
  const backup = async () => {
    const r = await api.get('/backup');
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hmn-backup.json';
    a.click();
  };
  return (
    <Shell title="Settings">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-7">
          <h2 className="text-2xl font-black">Company Information</h2>
          <div className="mt-5 space-y-3">
            <input className="input" defaultValue="HMN Agri Trade" />
            <input className="input" defaultValue={import.meta.env.VITE_COMPANY_PHONE || ''} />
            <input className="input" defaultValue={import.meta.env.VITE_COMPANY_ADDRESS || 'Hala, Sindh, Pakistan'} />
            <input type="file" className="input" />
            <button className="rounded-xl bg-green-700 px-5 py-3 font-black text-white">Save Settings</button>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-7">
          <h2 className="text-2xl font-black">Backup & Restore</h2>
          <p className="mt-3 text-slate-600">
            Export all operational data as a JSON backup. Restore workflow is intentionally admin-controlled.
          </p>
          <button onClick={backup} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 font-black text-white">
            Download Backup
          </button>
          <input type="file" accept="application/json" className="input mt-4" />
        </div>
        <div className="rounded-3xl bg-white p-7 md:col-span-2">
          <h2 className="text-2xl font-black">Users, Roles & Permissions</h2>
          <p className="mt-2 text-slate-600">
            Use the Users module to create Admin, Manager, Accountant and Viewer accounts.
          </p>
        </div>
      </div>
    </Shell>
  );
}
export function TransactionPage({ type, title }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get('/' + type).then((r) => setRows(r.data));
  }, [type]);
  return (
    <Shell title={title}>
      <div className="rounded-3xl bg-white p-6">
        <p className="mb-5 text-slate-600">
          Create {title.toLowerCase()} through the API-ready module. Existing records are shown below.
        </p>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="p-3">Date</th>
              <th>Party</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-3">{new Date(r.date).toLocaleDateString()}</td>
                <td>{r.customer?.name || r.supplier?.name}</td>
                <td>{r.total}</td>
                <td>{r.payment}</td>
                <td>{r.remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
export function Khata() {
  const [customers, setCustomers] = useState([]),
    [selected, setSelected] = useState(''),
    [entries, setEntries] = useState([]);
  useEffect(() => {
    api.get('/customers').then((r) => setCustomers(Array.isArray(r.data) ? r.data : r.data?.data || []));
  }, []);
  useEffect(() => {
    selected && api.get('/ledger/' + selected).then((r) => setEntries(r.data));
  }, [selected]);
  return (
    <Shell title="Khata / Ledger">
      <select className="input max-w-md" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Select customer</option>
        {customers.map((x) => (
          <option key={x._id} value={x._id}>
            {x.name} — {x.village}
          </option>
        ))}
      </select>
      <div className="mt-6 rounded-3xl bg-white p-6">
        <div className="flex justify-between">
          <h2 className="text-xl font-black">Ledger History</h2>
          <div>
            <button onClick={() => window.print()} className="mr-2 rounded-xl bg-slate-900 px-4 py-2 text-white">
              Print Ledger
            </button>
            <button
              onClick={() => alert('CSV/PDF export can be enabled in deployment build')}
              className="rounded-xl bg-green-700 px-4 py-2 text-white"
            >
              Export PDF
            </button>
          </div>
        </div>
        {entries.map((x) => (
          <div key={x._id} className="grid grid-cols-4 border-b py-4">
            <span>{new Date(x.date).toLocaleDateString()}</span>
            <span className="capitalize">{x.type}</span>
            <span>PKR {x.amount}</span>
            <b>Balance: {x.balanceAfter}</b>
          </div>
        ))}
      </div>
    </Shell>
  );
}
