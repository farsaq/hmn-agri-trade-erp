import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
const C = createContext(null);
function storedUser() {
  try {
    const v = localStorage.getItem('hmn_user');
    if (!v || v === 'undefined' || v === 'null') return null;
    return JSON.parse(v);
  } catch {
    localStorage.removeItem('hmn_user');
    return null;
  }
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser),
    [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const t = localStorage.getItem('hmn_token');
        if (t && t !== 'undefined') {
          const r = await api.get('/auth/me');
          setUser(r.data.user);
          localStorage.setItem('hmn_user', JSON.stringify(r.data.user));
        } else {
          localStorage.removeItem('hmn_token');
          localStorage.removeItem('hmn_user');
        }
      } catch {
        localStorage.removeItem('hmn_token');
        localStorage.removeItem('hmn_user');
        setUser(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const login = (token, u) => {
    if (token) localStorage.setItem('hmn_token', token);
    else localStorage.removeItem('hmn_token');
    if (u) localStorage.setItem('hmn_user', JSON.stringify(u));
    else localStorage.removeItem('hmn_user');
    setUser(u || null);
  };
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    localStorage.removeItem('hmn_token');
    localStorage.removeItem('hmn_user');
    setUser(null);
  };
  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useAuth = () => useContext(C);
