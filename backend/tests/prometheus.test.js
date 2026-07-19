import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsToPrometheus } from '../src/utils/prometheus.js';
test('exports operational metrics in Prometheus text format', () => {
  const text = metricsToPrometheus(
    {
      process: { uptimeSeconds: 5, memory: { rss: { bytes: 100 } }, cpu: { usagePercentOneCore: 2 } },
      api: {
        totalRequests: 3,
        methods: { GET: 3 },
        statusClasses: { '2xx': 3, '5xx': 0 },
        averageDurationMs: 10,
        p50DurationMs: 8,
        p95DurationMs: 20,
        p99DurationMs: 25,
      },
      databaseCommands: { totalCommands: 2, failedCommands: 0 },
    },
    { connected: true, latencyMs: 4 },
  );
  assert.match(text, /hmn_http_requests_total 3/);
  assert.match(text, /hmn_database_connected 1/);
  assert.match(text, /status_class="2xx"/);
});
