import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import api from '../services/api';
export default function ResetPassword() {
  const [params] = useSearchParams(),
    [token, setToken] = useState(params.get('token') || ''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must contain at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    try {
      const r = await api.post('/auth/reset-password', { token, password });
      setMessage(r.data.message);
      setTimeout(() => nav('/admin/login'), 1200);
    } catch (e) {
      setError(e.response?.data?.message || 'Reset failed');
    }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-green-950 px-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-premium">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-green-700 text-white">
          <KeyRound />
        </div>
        <h1 className="mt-6 text-3xl font-black">Reset password</h1>
        <p className="mt-2 text-slate-500">Enter the reset token and a new secure password.</p>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 font-bold text-red-700">{error}</p>}
        {message && <p className="mt-4 rounded-xl bg-green-50 p-3 font-bold text-green-800">{message}</p>}
        <input
          className="input mt-6"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          placeholder="Reset token"
        />
        <input
          type="password"
          className="input mt-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="New password"
        />
        <input
          type="password"
          className="input mt-4"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Confirm password"
        />
        <button className="mt-5 w-full rounded-xl bg-green-700 py-4 font-black text-white">Change password</button>
        <Link to="/admin/login" className="mt-5 block text-center text-sm font-bold text-green-700">
          Back to login
        </Link>
      </form>
    </div>
  );
}
