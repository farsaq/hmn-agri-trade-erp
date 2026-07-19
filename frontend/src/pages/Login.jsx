import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wheat, ShieldCheck, KeyRound, Mail, Eye, EyeOff } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/Auth';
export default function Login() {
  const [mode, setMode] = useState('password'),
    [email, setEmail] = useState('admin@hmn.com'),
    [password, setPassword] = useState('Admin12345'),
    [otp, setOtp] = useState(''),
    [rememberMe, setRememberMe] = useState(true),
    [show, setShow] = useState(false),
    [err, setErr] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [needs2fa, setNeeds2fa] = useState(false),
    [twoFactorCode, setTwoFactorCode] = useState(''),
    [recoveryCode, setRecoveryCode] = useState(''),
    { login } = useAuth(),
    nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setNotice('');
    setLoading(true);
    try {
      const r =
        mode === 'otp'
          ? await api.post('/auth/otp/verify', { email, otp, rememberMe })
          : await api.post('/auth/login', { email, password, rememberMe, twoFactorCode, recoveryCode });
      login(r.data.token, r.data.user);
      nav('/admin');
    } catch (e) {
      if (e.response?.data?.code === 'TWO_FACTOR_REQUIRED') setNeeds2fa(true);
      if (e.response?.data?.code === 'EMAIL_NOT_VERIFIED')
        setNotice('Your email is not verified. Use resend verification below.');
      setErr(e.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  const requestOtp = async () => {
    setErr('');
    try {
      const r = await api.post('/auth/otp/request', { email });
      setMode('otp');
      setNotice(
        r.data.developmentOtp
          ? `Development OTP: ${r.data.developmentOtp}`
          : 'OTP generated. Check your configured email/SMS provider.',
      );
    } catch (e) {
      setErr(e.response?.data?.message || 'Unable to generate OTP');
    }
  };
  const resend = async () => {
    try {
      const r = await api.post('/auth/resend-verification', { email });
      setNotice(r.data.developmentVerificationUrl || r.data.message);
    } catch (e) {
      setErr(e.response?.data?.message || 'Unable to resend verification');
    }
  };
  const forgot = async () => {
    setErr('');
    try {
      const r = await api.post('/auth/forgot-password', { email });
      setNotice(
        r.data.developmentResetToken ? `Development reset token: ${r.data.developmentResetToken}` : r.data.message,
      );
    } catch (e) {
      setErr(e.response?.data?.message || 'Unable to create reset request');
    }
  };
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#14532d_0,#052e16_45%,#020617_100%)] px-5 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2.25rem] bg-white shadow-2xl lg:grid-cols-[1.08fr_.92fr]">
        <section className="hidden bg-green-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-lime-300 text-green-950">
                <Wheat />
              </div>
              <div>
                <p className="font-black">HMN Agri Trade</p>
                <p className="text-sm text-green-300">Enterprise ERP v5.7.8</p>
              </div>
            </div>
            <h1 className="mt-16 max-w-xl text-5xl font-black leading-tight">
              Secure business control for every trade, stock movement and payment.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-green-100">
              Protected sessions, role-aware access, analytics and operational visibility for HMN management.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['Secure access', ShieldCheck],
              ['Session control', KeyRound],
              ['Verified account', Mail],
            ].map(([t, I]) => (
              <div key={t} className="rounded-2xl bg-white/10 p-4">
                <I className="text-lime-300" />
                <p className="mt-3 text-sm font-bold">{t}</p>
              </div>
            ))}
          </div>
        </section>
        <form onSubmit={submit} className="flex flex-col justify-center p-7 sm:p-12">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-green-700 text-white lg:hidden">
            <Wheat />
          </div>
          <p className="mt-6 text-sm font-black uppercase tracking-[.2em] text-green-700">Protected portal</p>
          <h2 className="mt-2 text-4xl font-black">Welcome back</h2>
          <p className="mt-3 text-slate-500">Sign in with password or one-time code.</p>
          {err && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{err}</p>}
          {notice && <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-800">{notice}</p>}
          <label className="mt-7 text-sm font-bold">Email address</label>
          <input
            className="input mt-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="admin@hmn.com"
          />
          {mode === 'password' ? (
            <>
              <label className="mt-4 text-sm font-bold">Password</label>
              <div className="relative mt-2">
                <input
                  type={show ? 'text' : 'password'}
                  className="input pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-4 top-3.5 text-slate-500"
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="mt-4 text-sm font-bold">One-time code</label>
              <input
                className="input mt-2 tracking-[.4em]"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                maxLength="6"
                placeholder="000000"
              />
            </>
          )}
          {needs2fa && (
            <div className="mt-4 rounded-2xl border p-4">
              <label className="text-sm font-bold">Authenticator code</label>
              <input
                className="input mt-2"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="123456"
              />
              <label className="mt-3 block text-sm font-bold">Or recovery code</label>
              <input
                className="input mt-2"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="Recovery code"
              />
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember
              me
            </label>
            <button type="button" onClick={forgot} className="font-bold text-green-700">
              Forgot password?
            </button>
          </div>
          <button
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-green-700 py-4 font-black text-white disabled:opacity-60"
          >
            {loading ? 'Signing in...' : mode === 'otp' ? 'Verify OTP' : 'Secure Login'}
          </button>
          <button
            type="button"
            onClick={mode === 'password' ? requestOtp : () => setMode('password')}
            className="mt-3 w-full rounded-2xl border border-slate-200 py-3 font-bold"
          >
            {mode === 'password' ? 'Use one-time code' : 'Use password instead'}
          </button>
          <button type="button" onClick={resend} className="mt-3 text-sm font-bold text-green-700">
            Resend verification email
          </button>
          <a href="/" className="mt-6 text-center text-sm font-bold text-green-700">
            Back to public website
          </a>
        </form>
      </div>
    </div>
  );
}
