import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000'] },
};
export default function () {
  const base = __ENV.BASE_URL || 'http://localhost:5000';
  const r = http.get(`${base}/api/v1/health`);
  check(r, { 'health 200': (x) => x.status === 200 });
  sleep(1);
}
