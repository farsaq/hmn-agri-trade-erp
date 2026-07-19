import { useEffect, useState } from 'react';
import api from '../services/api';
import { Shell } from './AdminApp';
export default function SecurityPage() {
  const [qr, setQr] = useState(''),
    [secret, setSecret] = useState(''),
    [code, setCode] = useState(''),
    [recovery, setRecovery] = useState([]),
    [sessions, setSessions] = useState([]),
    [msg, setMsg] = useState('');
  const load = () => api.get('/auth/sessions').then((r) => setSessions(r.data));
  useEffect(() => {
    load();
  }, []);
  const setup = async () => {
    const r = await api.post('/auth/2fa/setup');
    setQr(r.data.qrCode);
    setSecret(r.data.secret);
  };
  const enable = async () => {
    const r = await api.post('/auth/2fa/enable', { code });
    setRecovery(r.data.recoveryCodes);
    setMsg(r.data.message);
  };
  return (
    <Shell title="Security & Sessions">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 dark:bg-slate-900">
          <h2 className="text-2xl font-black">Two-factor authentication</h2>
          <p className="mt-2 text-slate-500">Use Google Authenticator, Microsoft Authenticator or Authy.</p>
          {!qr ? (
            <button onClick={setup} className="mt-5 rounded-xl bg-green-700 px-5 py-3 font-black text-white">
              Set up 2FA
            </button>
          ) : (
            <>
              <img src={qr} alt="Two-factor authentication QR code" className="mt-5 h-56 w-56" />
              <p className="mt-3 break-all text-xs">Secret: {secret}</p>
              <input
                className="input mt-4"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button onClick={enable} className="mt-3 rounded-xl bg-green-700 px-5 py-3 font-black text-white">
                Verify and enable
              </button>
            </>
          )}
          {msg && <p className="mt-4 font-bold text-green-700">{msg}</p>}
          {recovery.length > 0 && (
            <div className="mt-5 rounded-xl bg-amber-50 p-4">
              <b>Save these recovery codes once:</b>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono">
                {recovery.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="rounded-3xl bg-white p-6 dark:bg-slate-900">
          <h2 className="text-2xl font-black">Active sessions</h2>
          <div className="mt-4 space-y-3">
            {sessions.map((s) => (
              <div key={s._id} className="rounded-xl border p-4">
                <p className="font-bold">{s.userAgent || 'Unknown device'}</p>
                <p className="text-xs text-slate-500">
                  {s.ip} · {new Date(s.createdAt).toLocaleString()}
                </p>
                <button
                  onClick={async () => {
                    await api.delete('/auth/sessions/' + s._id);
                    load();
                  }}
                  className="mt-2 text-sm font-bold text-red-600"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
