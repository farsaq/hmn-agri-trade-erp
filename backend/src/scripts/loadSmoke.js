const base = process.env.LOAD_BASE_URL || 'http://127.0.0.1:5000';
const concurrency = Math.max(1, Number(process.env.LOAD_CONCURRENCY || 10));
const requests = Math.max(concurrency, Number(process.env.LOAD_REQUESTS || 100));
const started = performance.now();
let next = 0,
  ok = 0,
  failed = 0;
async function worker() {
  while (true) {
    const slot = next++;
    if (slot >= requests) return;
    try {
      const r = await fetch(`${base}/api/v1/health/live`, { signal: AbortSignal.timeout(5000) });
      r.ok ? ok++ : failed++;
    } catch {
      failed++;
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const seconds = (performance.now() - started) / 1000;
console.log(
  JSON.stringify(
    {
      requests,
      ok,
      failed,
      concurrency,
      durationSeconds: Number(seconds.toFixed(2)),
      requestsPerSecond: Number((requests / seconds).toFixed(2)),
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
