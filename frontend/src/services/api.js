import axios from 'axios';
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
export const apiOrigin = apiBaseUrl.replace(/\/api(?:\/v1)?\/?$/, '');
export const assetUrl = (value) =>
  !value || /^(?:https?:|data:|blob:)/i.test(value)
    ? value
    : apiOrigin + (String(value).startsWith('/') ? '' : '/') + value;
const api = axios.create({ baseURL: apiBaseUrl, withCredentials: true, headers: { 'X-HMN-CSRF': '1' } });
let refreshing = null;
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('hmn_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original?._retry &&
      !original?.url?.includes('/auth/login') &&
      !original?.url?.includes('/auth/refresh')
    ) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            {},
            { withCredentials: true, headers: { 'X-HMN-CSRF': '1' } },
          );
        const r = await refreshing;
        refreshing = null;
        localStorage.setItem('hmn_token', r.data.token);
        localStorage.setItem('hmn_user', JSON.stringify(r.data.user));
        original.headers.Authorization = `Bearer ${r.data.token}`;
        return api(original);
      } catch {
        refreshing = null;
        localStorage.removeItem('hmn_token');
        localStorage.removeItem('hmn_user');
        if (location.pathname.startsWith('/admin')) location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  },
);
export default api;
