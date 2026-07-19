import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
export default function VerifyEmail() {
  const [q] = useSearchParams(),
    [state, setState] = useState('Verifying your email...');
  useEffect(() => {
    api
      .post('/auth/verify-email', { token: q.get('token') })
      .then((r) => setState(r.data.message))
      .catch((e) => setState(e.response?.data?.message || 'Verification failed'));
  }, []);
  return (
    <div className="grid min-h-screen place-items-center bg-green-950 p-6">
      <div className="max-w-lg rounded-3xl bg-white p-10 text-center shadow-2xl">
        <h1 className="text-3xl font-black">Email verification</h1>
        <p className="mt-4 text-slate-600">{state}</p>
        <Link to="/admin/login" className="mt-7 inline-block rounded-xl bg-green-700 px-6 py-3 font-black text-white">
          Go to login
        </Link>
      </div>
    </div>
  );
}
