import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = () => ({ account: '', description: '', debit: '', credit: '' });
const blankDraft = () => ({
  date: today(),
  type: 'manual',
  narration: '',
  reference: '',
  referenceDocumentNo: '',
  requiredApprovalLevel: 1,
  lines: [blankLine(), blankLine()],
});
const money = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function JournalManager({ mode = 'list', accounts = [], onChanged }) {
  const [draft, setDraft] = useState(blankDraft());
  const [editingId, setEditingId] = useState('');
  const [journals, setJournals] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: mode === 'approval' ? 'pending-approval' : '',
    type: '',
    dateFrom: '',
    dateTo: '',
  });

  const postableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.active && !account.isDeleted && account.allowManualPosting && !account.isControlAccount,
      ),
    [accounts],
  );
  const totals = useMemo(
    () =>
      draft.lines.reduce(
        (sum, line) => ({ debit: sum.debit + Number(line.debit || 0), credit: sum.credit + Number(line.credit || 0) }),
        { debit: 0, credit: 0 },
      ),
    [draft.lines],
  );
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.005;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
      const response = await api.get(`/accounting/journals?${params}`);
      setJournals(response.data.items || []);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== 'create') load();
  }, [mode]);

  const updateLine = (index, key, value) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [key]: value,
              ...(key === 'debit' && Number(value) > 0 ? { credit: '' } : {}),
              ...(key === 'credit' && Number(value) > 0 ? { debit: '' } : {}),
            }
          : line,
      ),
    }));

  const payload = () => ({
    ...draft,
    requiredApprovalLevel: Number(draft.requiredApprovalLevel || 1),
    lines: draft.lines.map((line) => ({
      account: line.account,
      description: line.description || undefined,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    })),
  });

  const save = async () => {
    setLoading(true);
    try {
      if (editingId) await api.put(`/accounting/journals/${editingId}`, payload());
      else await api.post('/accounting/journals', payload());
      setMessage(editingId ? 'Journal draft updated' : 'Journal draft created');
      setDraft(blankDraft());
      setEditingId('');
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const edit = async (id) => {
    try {
      const response = await api.get(`/accounting/journals/${id}`);
      const journal = response.data;
      setDraft({
        date: String(journal.date).slice(0, 10),
        type: journal.type,
        narration: journal.narration,
        reference: journal.reference || '',
        referenceDocumentNo: journal.referenceDocumentNo || '',
        requiredApprovalLevel: journal.requiredApprovalLevel || 1,
        lines: journal.lines.map((line) => ({
          account: line.account?._id || line.account,
          description: line.description || '',
          debit: line.debit || '',
          credit: line.credit || '',
        })),
      });
      setEditingId(id);
      setDetail(null);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const view = async (id) => {
    try {
      const response = await api.get(`/accounting/journals/${id}`);
      setDetail(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const action = async (id, name, body = {}) => {
    try {
      await api.post(`/accounting/journals/${id}/${name}`, body);
      setMessage(`Journal ${name} completed`);
      setDetail(null);
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this draft journal?')) return;
    try {
      await api.delete(`/accounting/journals/${id}`);
      setMessage('Draft journal deleted');
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const form = (
    <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-black">{editingId ? 'Edit Journal Draft' : 'Create Journal Draft'}</h3>
        {editingId && (
          <button
            className="rounded-xl border px-3 py-2"
            onClick={() => {
              setEditingId('');
              setDraft(blankDraft());
            }}
          >
            Cancel edit
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <input
          className="rounded-xl border p-3"
          type="date"
          value={draft.date}
          onChange={(event) => setDraft({ ...draft, date: event.target.value })}
        />
        <select
          className="rounded-xl border p-3"
          value={draft.type}
          onChange={(event) => setDraft({ ...draft, type: event.target.value })}
        >
          <option value="manual">Manual</option>
          <option value="adjustment">Adjustment</option>
          <option value="opening">Opening</option>
        </select>
        <input
          className="rounded-xl border p-3"
          type="number"
          min="1"
          max="5"
          value={draft.requiredApprovalLevel}
          onChange={(event) => setDraft({ ...draft, requiredApprovalLevel: event.target.value })}
          placeholder="Approval levels"
        />
        <input
          className="rounded-xl border p-3 md:col-span-2"
          value={draft.narration}
          onChange={(event) => setDraft({ ...draft, narration: event.target.value })}
          placeholder="Narration"
        />
        <input
          className="rounded-xl border p-3"
          value={draft.reference}
          onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
          placeholder="Reference"
        />
        <input
          className="rounded-xl border p-3 md:col-span-3"
          value={draft.referenceDocumentNo}
          onChange={(event) => setDraft({ ...draft, referenceDocumentNo: event.target.value })}
          placeholder="Reference document number"
        />
      </div>
      <div className="mt-4 space-y-2">
        {draft.lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-5">
            <select
              className="rounded-xl border p-3"
              value={line.account}
              onChange={(event) => updateLine(index, 'account', event.target.value)}
            >
              <option value="">Select account</option>
              {postableAccounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.code} — {account.name}
                </option>
              ))}
            </select>
            <input
              className="rounded-xl border p-3 md:col-span-2"
              value={line.description}
              onChange={(event) => updateLine(index, 'description', event.target.value)}
              placeholder="Line description"
            />
            <input
              className="rounded-xl border p-3"
              type="number"
              min="0"
              step="0.01"
              value={line.debit}
              onChange={(event) => updateLine(index, 'debit', event.target.value)}
              placeholder="Debit"
            />
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border p-3"
                type="number"
                min="0"
                step="0.01"
                value={line.credit}
                onChange={(event) => updateLine(index, 'credit', event.target.value)}
                placeholder="Credit"
              />
              <button
                className="rounded-xl border px-3"
                disabled={draft.lines.length <= 2}
                onClick={() =>
                  setDraft((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded-xl border px-4 py-2 font-bold"
          onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, blankLine()] }))}
        >
          Add line
        </button>
        <div
          className={`rounded-xl px-4 py-2 font-black ${balanced ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
        >
          Debit {money(totals.debit)} · Credit {money(totals.credit)}
        </div>
        <button
          disabled={
            loading || !balanced || draft.narration.trim().length < 3 || draft.lines.some((line) => !line.account)
          }
          className="rounded-xl bg-green-700 px-5 py-2 font-bold text-white disabled:opacity-40"
          onClick={save}
        >
          {editingId ? 'Update draft' : 'Save draft'}
        </button>
      </div>
    </div>
  );

  if (mode === 'create')
    return (
      <div className="space-y-3">
        {message && <div className="rounded-xl bg-green-50 p-3 font-bold text-green-900">{message}</div>}
        {form}
      </div>
    );

  return (
    <div className="space-y-4">
      {message && <div className="rounded-xl bg-green-50 p-3 font-bold text-green-900">{message}</div>}
      <div className="grid gap-2 rounded-2xl border bg-white p-4 md:grid-cols-6 dark:bg-slate-900">
        <input
          className="rounded-xl border p-2 md:col-span-2"
          placeholder="Search journal, narration or reference"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <select
          className="rounded-xl border p-2"
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
        >
          <option value="">All statuses</option>
          {['draft', 'pending-approval', 'approved', 'rejected', 'posted', 'reversed'].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select
          className="rounded-xl border p-2"
          value={filters.type}
          onChange={(event) => setFilters({ ...filters, type: event.target.value })}
        >
          <option value="">All types</option>
          {['manual', 'adjustment', 'opening', 'sale', 'purchase', 'receipt', 'payment', 'expense', 'reversal'].map(
            (type) => (
              <option key={type}>{type}</option>
            ),
          )}
        </select>
        <input
          className="rounded-xl border p-2"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}
        />
        <button className="rounded-xl bg-green-700 px-4 py-2 font-bold text-white" onClick={load}>
          Apply filters
        </button>
      </div>
      {editingId && form}
      <div className="overflow-auto rounded-2xl border bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Journal</th>
              <th>Date</th>
              <th>Type</th>
              <th>Narration</th>
              <th>Status</th>
              <th>Debit</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {journals.map((journal) => (
              <tr key={journal._id} className="border-b">
                <td className="p-3 font-mono">{journal.journalNo}</td>
                <td>{String(journal.date).slice(0, 10)}</td>
                <td>{journal.type}</td>
                <td>{journal.narration}</td>
                <td>
                  <span className="rounded-full border px-2 py-1 text-xs font-bold">{journal.status}</span>
                </td>
                <td>{money(journal.totalDebit)}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="rounded border px-2 py-1" onClick={() => view(journal._id)}>
                    View
                  </button>
                  {['draft', 'rejected'].includes(journal.status) && (
                    <>
                      <button className="rounded border px-2 py-1" onClick={() => edit(journal._id)}>
                        Edit
                      </button>
                      <button className="rounded border px-2 py-1" onClick={() => remove(journal._id)}>
                        Delete
                      </button>
                    </>
                  )}
                  {journal.status === 'draft' && (
                    <button className="rounded border px-2 py-1" onClick={() => action(journal._id, 'submit')}>
                      Submit
                    </button>
                  )}
                  {journal.status === 'pending-approval' && (
                    <>
                      <button
                        className="rounded border px-2 py-1"
                        onClick={() => action(journal._id, 'approve', { reason: 'Approved from journal manager' })}
                      >
                        Approve
                      </button>
                      <button
                        className="rounded border px-2 py-1"
                        onClick={() =>
                          action(journal._id, 'reject', { reason: window.prompt('Rejection reason') || '' })
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {journal.status === 'approved' && (
                    <button className="rounded border px-2 py-1" onClick={() => action(journal._id, 'post')}>
                      Post
                    </button>
                  )}
                  {journal.status === 'posted' && (
                    <button
                      className="rounded border px-2 py-1"
                      onClick={() =>
                        action(journal._id, 'reverse', {
                          reason: window.prompt('Reversal reason') || 'Journal reversal',
                        })
                      }
                    >
                      Reverse
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!journals.length && <div className="p-6 text-center text-slate-500">No journals found.</div>}
      </div>
      {detail && (
        <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
          <div className="mb-4 flex justify-between">
            <div>
              <h3 className="text-lg font-black">{detail.journalNo}</h3>
              <p className="text-sm text-slate-500">{detail.narration}</p>
            </div>
            <button onClick={() => setDetail(null)}>Close</button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <div>
              <b>Status:</b> {detail.status}
            </div>
            <div>
              <b>Date:</b> {String(detail.date).slice(0, 10)}
            </div>
            <div>
              <b>Reference:</b> {detail.reference || '—'}
            </div>
            <div>
              <b>Approval:</b> {detail.approvalLevel}/{detail.requiredApprovalLevel}
            </div>
          </div>
          <div className="mt-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Account</th>
                  <th>Description</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines?.map((line) => (
                  <tr key={line._id} className="border-b">
                    <td className="p-2">
                      {line.accountCode} — {line.accountName}
                    </td>
                    <td>{line.description || '—'}</td>
                    <td>{money(line.debit)}</td>
                    <td>{money(line.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
