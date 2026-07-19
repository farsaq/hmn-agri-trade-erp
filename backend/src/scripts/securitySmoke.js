const base = process.env.BASE_URL || 'http://localhost:5000';
const r = await fetch(`${base}/api/v1/health`);
const required = ['x-content-type-options', 'x-frame-options'];
const missing = required.filter((h) => !r.headers.get(h));
console.log(JSON.stringify({ status: r.status, missingHeaders: missing }, null, 2));
if (!r.ok || missing.length) process.exitCode = 1;
