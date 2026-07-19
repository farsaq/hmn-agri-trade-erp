function esc(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
function line(name, value, labels = {}) {
  const labelText = Object.keys(labels).length
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(',')}}`
    : '';
  return `${name}${labelText} ${Number.isFinite(Number(value)) ? Number(value) : 0}`;
}
export function metricsToPrometheus(metrics, database = {}) {
  const out = [
    '# HELP hmn_process_uptime_seconds Process uptime in seconds.',
    '# TYPE hmn_process_uptime_seconds gauge',
    line('hmn_process_uptime_seconds', metrics.process.uptimeSeconds),
    '# HELP hmn_process_memory_bytes Process memory usage.',
    '# TYPE hmn_process_memory_bytes gauge',
  ];
  for (const [kind, value] of Object.entries(metrics.process.memory || {}))
    out.push(line('hmn_process_memory_bytes', value.bytes, { kind }));
  out.push(
    '# HELP hmn_process_cpu_percent Process CPU usage as percent of one core.',
    '# TYPE hmn_process_cpu_percent gauge',
    line('hmn_process_cpu_percent', metrics.process.cpu.usagePercentOneCore),
  );
  out.push(
    '# HELP hmn_http_requests_total Total HTTP requests.',
    '# TYPE hmn_http_requests_total counter',
    line('hmn_http_requests_total', metrics.api.totalRequests),
  );
  for (const [method, value] of Object.entries(metrics.api.methods || {}))
    out.push(line('hmn_http_requests_by_method_total', value, { method }));
  for (const [statusClass, value] of Object.entries(metrics.api.statusClasses || {}))
    out.push(line('hmn_http_requests_by_status_class_total', value, { status_class: statusClass }));
  out.push(
    '# HELP hmn_http_duration_milliseconds HTTP latency summary.',
    '# TYPE hmn_http_duration_milliseconds gauge',
    line('hmn_http_duration_milliseconds', metrics.api.averageDurationMs, { quantile: 'average' }),
    line('hmn_http_duration_milliseconds', metrics.api.p50DurationMs, { quantile: '0.50' }),
    line('hmn_http_duration_milliseconds', metrics.api.p95DurationMs, { quantile: '0.95' }),
    line('hmn_http_duration_milliseconds', metrics.api.p99DurationMs, { quantile: '0.99' }),
  );
  out.push(
    '# HELP hmn_database_commands_total MongoDB commands observed.',
    '# TYPE hmn_database_commands_total counter',
    line('hmn_database_commands_total', metrics.databaseCommands.totalCommands),
    line('hmn_database_command_failures_total', metrics.databaseCommands.failedCommands),
  );
  out.push(
    '# HELP hmn_database_ping_milliseconds MongoDB ping latency.',
    '# TYPE hmn_database_ping_milliseconds gauge',
    line('hmn_database_ping_milliseconds', database.latencyMs || 0),
  );
  out.push(line('hmn_database_connected', database.connected ? 1 : 0));
  return `${out.join('\n')}\n`;
}
