import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const emptyForm = {
  code: '',
  name: '',
  type: 'asset',
  subtype: '',
  category: '',
  reportingGroup: '',
  description: '',
  notes: '',
  displayOrder: 0,
  reportingSequence: 0,
  parent: '',
  currency: 'PKR',
  openingBalance: 0,
  allowManualPosting: true,
  active: true,
  isControlAccount: false,
  controlAccountKey: '',
};
const categories = {
  asset: ['Current Assets', 'Non-current Assets', 'Cash & Bank', 'Inventory', 'Receivables', 'Fixed Assets'],
  liability: ['Current Liabilities', 'Non-current Liabilities', 'Payables', 'Loans'],
  equity: ['Owner Equity', 'Retained Earnings', 'Reserves'],
  income: ['Sales Revenue', 'Other Income', 'Finance Income'],
  expense: [
    'Cost of Goods Sold',
    'Operating Expense',
    'Administrative Expense',
    'Selling Expense',
    'Finance Cost',
    'Tax',
    'Depreciation',
  ],
};

function TreeNode({ node, depth = 0, onEdit, onStatus }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b py-2" style={{ paddingLeft: `${depth * 18 + 8}px` }}>
        {node.children?.length > 0 ? (
          <button className="w-6 rounded border" onClick={() => setOpen((v) => !v)}>
            {open ? '−' : '+'}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <span className="font-mono text-xs">{node.code}</span>
        <span className="font-bold">{node.name}</span>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{node.category || node.type}</span>
        {node.isControlAccount && (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">Control</span>
        )}
        {!node.active && <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-900">Inactive</span>}
        <span className="ml-auto flex gap-1">
          <button className="rounded border px-2 py-1 text-xs" onClick={() => onEdit(node)}>
            Edit
          </button>
          <button className="rounded border px-2 py-1 text-xs" onClick={() => onStatus(node)}>
            {node.active ? 'Deactivate' : 'Activate'}
          </button>
        </span>
      </div>
      {open &&
        node.children?.map((child) => (
          <TreeNode key={child._id} node={child} depth={depth + 1} onEdit={onEdit} onStatus={onStatus} />
        ))}
    </div>
  );
}

export default function ChartOfAccountsManager({ onChanged }) {
  const [accounts, setAccounts] = useState([]),
    [tree, setTree] = useState([]),
    [deleted, setDeleted] = useState([]),
    [form, setForm] = useState(emptyForm),
    [editing, setEditing] = useState(null),
    [filters, setFilters] = useState({ search: '', type: '', category: '', active: '', view: 'tree' }),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const query = useMemo(() => {
    const q = new URLSearchParams({ limit: '200' });
    Object.entries(filters).forEach(([k, v]) => {
      if (v && k !== 'view') q.set(k, v);
    });
    return q.toString();
  }, [filters]);
  const load = async () => {
    setBusy(true);
    try {
      const [list, treeRes, deletedRes] = await Promise.all([
        api.get(`/accounting/accounts?${query}`),
        api.get(
          `/accounting/accounts/tree?includeInactive=true${filters.type ? `&type=${filters.type}` : ''}${filters.category ? `&category=${encodeURIComponent(filters.category)}` : ''}`,
        ),
        api.get('/accounting/accounts?deleted=true&limit=200'),
      ]);
      setAccounts(list.data.items || []);
      setTree(treeRes.data || []);
      setDeleted(deletedRes.data.items || []);
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, [query]);
  const reset = () => {
    setEditing(null);
    setForm(emptyForm);
  };
  const edit = (a) => {
    setEditing(a);
    setForm({ ...emptyForm, ...a, parent: a.parent?._id || a.parent || '', openingBalance: a.openingBalance || 0 });
  };
  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        parent: form.parent || null,
        displayOrder: Number(form.displayOrder || 0),
        reportingSequence: Number(form.reportingSequence || 0),
        openingBalance: Number(form.openingBalance || 0),
      };
      if (!payload.isControlAccount) {
        payload.controlAccountKey = undefined;
      }
      if (editing) {
        delete payload.code;
        delete payload.openingBalance;
        await api.put(`/accounting/accounts/${editing._id}`, payload);
        setMessage('Account updated successfully');
      } else {
        await api.post('/accounting/accounts', payload);
        setMessage('Account created successfully');
      }
      reset();
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = async (a) => {
    try {
      await api.post(`/accounting/accounts/${a._id}/status`, { active: !a.active });
      setMessage(`Account ${a.active ? 'deactivated' : 'activated'}`);
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    }
  };
  const remove = async (a) => {
    if (!confirm(`Archive ${a.code} — ${a.name}?`)) return;
    try {
      await api.delete(`/accounting/accounts/${a._id}`);
      setMessage('Account archived');
      reset();
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    }
  };
  const restore = async (a) => {
    try {
      await api.post(`/accounting/accounts/${a._id}/restore`);
      setMessage('Account restored');
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    }
  };
  const adjustOpening = async (a) => {
    const value = prompt(`New opening balance for ${a.code}`, String(a.openingBalance || 0));
    if (value === null) return;
    const reason = prompt('Reason for opening balance adjustment');
    if (!reason) return;
    try {
      await api.post(`/accounting/accounts/${a._id}/opening-balance-adjustment`, {
        newOpeningBalance: Number(value),
        reason,
      });
      setMessage('Opening balance adjusted through journal');
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.message || e.message);
    }
  };
  const allowedParents = accounts.filter((a) => a.type === form.type && a._id !== editing?._id && !a.isDeleted);
  return (
    <div className="space-y-4">
      {message && <div className="rounded-xl border bg-green-50 p-3 text-sm font-bold text-green-900">{message}</div>}
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="min-w-56 rounded-xl border p-2"
            placeholder="Search code, name, category"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select
            className="rounded-xl border p-2"
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value, category: '' })}
          >
            <option value="">All types</option>
            {['asset', 'liability', 'equity', 'income', 'expense'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            className="rounded-xl border p-2"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">All categories</option>
            {Object.values(categories)
              .flat()
              .map((x) => (
                <option key={x}>{x}</option>
              ))}
          </select>
          <select
            className="rounded-xl border p-2"
            value={filters.active}
            onChange={(e) => setFilters({ ...filters, active: e.target.value })}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <button
            className="rounded-xl border px-3 py-2 font-bold"
            onClick={() => setFilters({ ...filters, view: filters.view === 'tree' ? 'table' : 'tree' })}
          >
            {filters.view === 'tree' ? 'Table view' : 'Tree view'}
          </button>
        </div>
        {busy && <div className="text-sm">Loading accounts...</div>}
        {filters.view === 'tree' ? (
          <div>
            {tree.map((n) => (
              <TreeNode key={n._id} node={n} onEdit={edit} onStatus={changeStatus} />
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Group</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a._id} className="border-b">
                    <td className="p-2 font-mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td>{a.type}</td>
                    <td>{a.category || '—'}</td>
                    <td>{a.reportingGroup || '—'}</td>
                    <td>{a.active ? 'Active' : 'Inactive'}</td>
                    <td className="whitespace-nowrap">
                      <button className="mr-1 rounded border px-2 py-1" onClick={() => edit(a)}>
                        Edit
                      </button>
                      <button className="mr-1 rounded border px-2 py-1" onClick={() => changeStatus(a)}>
                        {a.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="rounded border px-2 py-1" onClick={() => adjustOpening(a)}>
                        Opening balance
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
        <h3 className="mb-3 text-lg font-black">{editing ? 'Edit account' : 'Create account'}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            disabled={!!editing}
            className="rounded-xl border p-3 disabled:opacity-60"
            placeholder="Account code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <input
            className="rounded-xl border p-3"
            placeholder="Account name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="rounded-xl border p-3"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value, parent: '', category: '' })}
          >
            {['asset', 'liability', 'equity', 'income', 'expense'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            className="rounded-xl border p-3"
            placeholder="Subtype"
            value={form.subtype || ''}
            onChange={(e) => setForm({ ...form, subtype: e.target.value })}
          />
          <select
            className="rounded-xl border p-3"
            value={form.category || ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">Select category</option>
            {categories[form.type].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            className="rounded-xl border p-3"
            placeholder="Reporting group"
            value={form.reportingGroup || ''}
            onChange={(e) => setForm({ ...form, reportingGroup: e.target.value })}
          />
          <select
            className="rounded-xl border p-3"
            value={form.parent || ''}
            onChange={(e) => setForm({ ...form, parent: e.target.value })}
          >
            <option value="">Root account</option>
            {allowedParents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border p-3"
            type="number"
            min="0"
            placeholder="Display order"
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
          />
          <input
            className="rounded-xl border p-3"
            type="number"
            min="0"
            placeholder="Reporting sequence"
            value={form.reportingSequence}
            onChange={(e) => setForm({ ...form, reportingSequence: e.target.value })}
          />
          {!editing && (
            <input
              className="rounded-xl border p-3"
              type="number"
              step="0.01"
              placeholder="Opening balance"
              value={form.openingBalance}
              onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
            />
          )}
          <input
            className="rounded-xl border p-3 md:col-span-2"
            placeholder="Description"
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <textarea
            className="rounded-xl border p-3 md:col-span-3"
            placeholder="Notes"
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isControlAccount}
              onChange={(e) =>
                setForm({
                  ...form,
                  isControlAccount: e.target.checked,
                  allowManualPosting: e.target.checked ? false : form.allowManualPosting,
                })
              }
            />{' '}
            Control account
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={form.isControlAccount}
              checked={form.allowManualPosting}
              onChange={(e) => setForm({ ...form, allowManualPosting: e.target.checked })}
            />{' '}
            Allow manual posting
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />{' '}
            Active
          </label>
          {form.isControlAccount && (
            <input
              className="rounded-xl border p-3"
              placeholder="Control account key"
              value={form.controlAccountKey || ''}
              onChange={(e) => setForm({ ...form, controlAccountKey: e.target.value })}
            />
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={busy || !form.name || (!editing && !form.code)}
            className="rounded-xl bg-green-700 px-5 py-2 font-bold text-white disabled:opacity-40"
            onClick={save}
          >
            {editing ? 'Save changes' : 'Create account'}
          </button>
          {editing && (
            <>
              <button className="rounded-xl border px-4 py-2" onClick={reset}>
                Cancel
              </button>
              <button
                className="rounded-xl border border-red-300 px-4 py-2 text-red-700"
                onClick={() => remove(editing)}
              >
                Archive
              </button>
              <button className="rounded-xl border px-4 py-2" onClick={() => adjustOpening(editing)}>
                Adjust opening balance
              </button>
            </>
          )}
        </div>
      </div>
      {deleted.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
          <h3 className="mb-3 font-black">Archived accounts</h3>
          {deleted.map((a) => (
            <div key={a._id} className="flex items-center gap-3 border-b py-2">
              <span className="font-mono">{a.code}</span>
              <span>{a.name}</span>
              <button className="ml-auto rounded border px-3 py-1" onClick={() => restore(a)}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
