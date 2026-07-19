import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { Shell } from './AdminApp';
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
export function NotificationsPage() {
  const [data, setData] = useState({ items: [], unread: 0 }),
    [prefs, setPrefs] = useState(null),
    [filter, setFilter] = useState('all');
  const load = async () => {
    const [a, b] = await Promise.all([api.get('/notifications-realtime'), api.get('/notification-preferences')]);
    setData(a.data);
    setPrefs(b.data);
  };
  useEffect(() => {
    void load();
  }, []);
  const rows = useMemo(
    () =>
      filter === 'all' ? data.items : data.items.filter((x) => (filter === 'unread' ? !x.read : x.type === filter)),
    [data, filter],
  );
  const savePrefs = async (next) => {
    setPrefs(next);
    await api.put('/notification-preferences', next);
  };
  return (
    <Shell title="Realtime Notifications">
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Notification Center</h2>
              <p className="text-sm text-slate-500">{data.unread} unread alerts</p>
            </div>
            <div className="flex gap-2">
              <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="low-stock">Low stock</option>
                <option value="expiry">Expiry</option>
                <option value="sale">Sales</option>
                <option value="purchase">Purchases</option>
                <option value="expense-approval">Expense approvals</option>
              </select>
              <button
                className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white"
                onClick={async () => {
                  await api.post('/notifications-realtime/read-all');
                  await load();
                }}
              >
                Mark all read
              </button>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {rows.map((n) => (
              <button
                key={n._id}
                onClick={async () => {
                  if (!n.read) await api.patch(`/notifications-realtime/${n._id}/read`);
                  if (n.link) location.href = n.link;
                  else await load();
                }}
                className={`w-full rounded-2xl border p-4 text-left ${n.read ? 'bg-white dark:bg-slate-900' : 'border-green-300 bg-green-50 dark:bg-green-950'}`}
              >
                <div className="flex justify-between gap-3">
                  <b>{n.title}</b>
                  <span className="text-xs text-slate-500">{fmt(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{n.message}</p>
                <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize dark:bg-slate-800">
                  {n.severity}
                </span>
              </button>
            ))}
            {!rows.length && <p className="p-6 text-center text-slate-500">No notifications found.</p>}
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
          <h2 className="text-xl font-black">Email Preferences</h2>
          {prefs && (
            <div className="mt-5 space-y-4">
              <label className="flex items-center justify-between">
                <span>In-app alerts</span>
                <input
                  type="checkbox"
                  checked={prefs.inApp}
                  onChange={(e) => savePrefs({ ...prefs, inApp: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between">
                <span>Email alerts</span>
                <input
                  type="checkbox"
                  checked={prefs.email}
                  onChange={(e) => savePrefs({ ...prefs, email: e.target.checked })}
                />
              </label>
              {Object.entries(prefs.events || {}).map(([k, v]) => (
                <label key={k} className="flex items-center justify-between capitalize">
                  <span>{k.replace(/([A-Z])/g, ' $1')}</span>
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) => savePrefs({ ...prefs, events: { ...prefs.events, [k]: e.target.checked } })}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export function AuditLogsPage() {
  const [rows, setRows] = useState([]),
    [q, setQ] = useState({ action: '', entity: '', from: '', to: '' });
  const load = async () => {
    const r = await api.get('/audit-logs-pro', { params: q });
    setRows(r.data.items || r.data);
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <Shell title="Audit Logs">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <div className="flex flex-wrap gap-3">
          <input
            className="input"
            placeholder="Action"
            value={q.action}
            onChange={(e) => setQ({ ...q, action: e.target.value })}
          />
          <input
            className="input"
            placeholder="Entity"
            value={q.entity}
            onChange={(e) => setQ({ ...q, entity: e.target.value })}
          />
          <input
            className="input"
            placeholder="User ID"
            value={q.user || ''}
            onChange={(e) => setQ({ ...q, user: e.target.value })}
          />
          <input
            className="input"
            placeholder="Path"
            value={q.path || ''}
            onChange={(e) => setQ({ ...q, path: e.target.value })}
          />
          <input
            className="input"
            placeholder="IP"
            value={q.ip || ''}
            onChange={(e) => setQ({ ...q, ip: e.target.value })}
          />
          <input
            className="input"
            placeholder="Status"
            type="number"
            value={q.statusCode || ''}
            onChange={(e) => setQ({ ...q, statusCode: e.target.value })}
          />
          <input className="input" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} />
          <input className="input" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
          <button className="rounded-xl bg-green-700 px-5 py-3 font-bold text-white" onClick={load}>
            Filter
          </button>
          <button
            className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
            onClick={async () => {
              const r = await api.get('/audit-logs-pro/export.csv', { responseType: 'blob' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(r.data);
              a.download = 'hmn-audit-logs.csv';
              a.click();
            }}
          >
            Export CSV
          </button>
        </div>
        <div className="mt-6 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Date</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Description</th>
                <th>IP / Device</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x._id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap">{fmt(x.createdAt)}</td>
                  <td>
                    {x.user?.name || 'System'}
                    <div className="text-xs text-slate-500">{x.user?.email}</div>
                  </td>
                  <td className="font-bold">{x.action}</td>
                  <td>{x.entity}</td>
                  <td>{x.description}</td>
                  <td>
                    {x.ip}
                    <div className="max-w-xs truncate text-xs text-slate-500">{x.device}</div>
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer font-bold">View</summary>
                      <pre className="max-w-md whitespace-pre-wrap text-xs">
                        {JSON.stringify(x.changes || {}, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

export function RolesPage() {
  const [roles, setRoles] = useState([]),
    [users, setUsers] = useState([]),
    [catalog, setCatalog] = useState([]),
    [form, setForm] = useState({ id: null, name: '', description: '', permissions: [] });
  const load = async () => {
    const [r, u, p] = await Promise.all([api.get('/roles'), api.get('/users-access'), api.get('/permissions')]);
    setRoles(r.data);
    setUsers(u.data);
    setCatalog(p.data.permissions);
  };
  useEffect(() => {
    void load();
  }, []);
  const toggle = (x) =>
    setForm({
      ...form,
      permissions: form.permissions.includes(x) ? form.permissions.filter((p) => p !== x) : [...form.permissions, x],
    });
  return (
    <Shell title="Roles & Permissions">
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form
          className="rounded-3xl bg-white p-6 dark:bg-slate-900"
          onSubmit={async (e) => {
            e.preventDefault();
            if (form.id) await api.put(`/roles/${form.id}`, form);
            else await api.post('/roles', form);
            setForm({ id: null, name: '', description: '', permissions: [] });
            await load();
          }}
        >
          <h2 className="text-xl font-black">{form.id ? 'Edit Custom Role' : 'Create Custom Role'}</h2>
          <input
            className="input mt-4"
            required
            placeholder="Role name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input mt-3"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="mt-4 max-h-96 overflow-auto rounded-2xl border p-3">
            {catalog.map((p) => (
              <label key={p} className="flex items-center gap-2 border-b py-2 text-sm">
                <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => toggle(p)} />
                {p}
              </label>
            ))}
          </div>
          <button className="mt-4 w-full rounded-xl bg-green-700 py-3 font-black text-white">
            {form.id ? 'Save Role' : 'Create Role'}
          </button>
          {form.id && (
            <button
              type="button"
              className="mt-2 w-full rounded-xl border py-3 font-black"
              onClick={() => setForm({ id: null, name: '', description: '', permissions: [] })}
            >
              Cancel Edit
            </button>
          )}
        </form>
        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
            <h2 className="text-xl font-black">Available Roles</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {roles.map((r) => (
                <div key={r._id} className="rounded-2xl border p-4">
                  <div className="flex justify-between">
                    <b className="capitalize">{r.name}</b>
                    <span className="text-xs">{r.system ? 'System' : 'Custom'}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {r.description || `${r.permissions.length} permissions`}
                  </p>
                  <div className="mt-2 text-xs">
                    {r.permissions.slice(0, 5).join(', ')}
                    {r.permissions.length > 5 ? '…' : ''}
                  </div>
                  {!r.system && (
                    <div className="mt-3 flex gap-3">
                      <button
                        className="text-sm font-bold text-green-700"
                        onClick={() =>
                          setForm({
                            id: r._id,
                            name: r.name,
                            description: r.description || '',
                            permissions: r.permissions || [],
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="text-sm font-bold text-red-700"
                        onClick={async () => {
                          if (confirm('Delete custom role?')) {
                            await api.delete(`/roles/${r._id}`);
                            await load();
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
            <h2 className="text-xl font-black">User Access Assignment</h2>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-3">User</th>
                    <th>Current</th>
                    <th>Assign role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} className="border-t">
                      <td className="p-3">
                        <b>{u.name}</b>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td>{u.customRole?.name || u.role}</td>
                      <td>
                        <select
                          className="input"
                          defaultValue={u.customRole?._id || u.role}
                          onChange={async (e) => {
                            const v = e.target.value;
                            const custom = roles.find((r) => r._id === v);
                            await api.put(
                              `/users-access/${u._id}`,
                              custom
                                ? { role: custom.name, customRole: custom._id, permissions: [] }
                                : { role: v, permissions: [] },
                            );
                            await load();
                          }}
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="accountant">Accountant</option>
                          <option value="sales">Salesman</option>
                          <option value="warehouse">Warehouse</option>
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer</option>
                          {roles
                            .filter((r) => !r.system)
                            .map((r) => (
                              <option key={r._id} value={r._id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
