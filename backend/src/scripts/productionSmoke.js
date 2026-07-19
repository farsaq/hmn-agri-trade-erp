import { env } from '../config/env.js';
const base = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${env.port}`;
const checks = ['/api/v1/health/live', '/api/v1/health/ready', '/api/v1/health/status'];
let failed = false;
for (const path of checks) {
  try {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
    console.log(`${response.status} ${path}`);
    if (!response.ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FAIL ${path}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
