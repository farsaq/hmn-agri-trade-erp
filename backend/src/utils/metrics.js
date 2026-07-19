const MAX_SAMPLES = 1000;
const state = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalDurationMs: 0,
  durations: [],
  methods: {},
  statusClasses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  routes: new Map(),
  database: { totalCommands: 0, failedCommands: 0, totalDurationMs: 0, durations: [], commands: new Map() },
};
let previousCpu = process.cpuUsage();
let previousCpuAt = process.hrtime.bigint();

export function recordRequest({ method, path, statusCode, durationMs }) {
  state.totalRequests += 1;
  state.totalDurationMs += durationMs;
  state.durations.push(durationMs);
  if (state.durations.length > MAX_SAMPLES) state.durations.shift();
  state.methods[method] = (state.methods[method] || 0) + 1;
  const key = `${Math.floor(statusCode / 100)}xx`;
  state.statusClasses[key] = (state.statusClasses[key] || 0) + 1;
  const route = String(path)
    .split('?')[0]
    .replace(/[a-f\d]{24}/gi, ':id');
  const routeKey = `${method} ${route}`;
  const item = state.routes.get(routeKey) || { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
  item.count += 1;
  item.totalDurationMs += durationMs;
  item.maxDurationMs = Math.max(item.maxDurationMs, durationMs);
  state.routes.set(routeKey, item);
}

export function recordDatabaseCommand({
  commandName = 'unknown',
  collection = 'unknown',
  durationMs = 0,
  success = true,
}) {
  const db = state.database;
  db.totalCommands += 1;
  if (!success) db.failedCommands += 1;
  db.totalDurationMs += durationMs;
  db.durations.push(durationMs);
  if (db.durations.length > MAX_SAMPLES) db.durations.shift();
  const key = `${commandName}:${collection}`;
  const item = db.commands.get(key) || { count: 0, failed: 0, totalDurationMs: 0, maxDurationMs: 0 };
  item.count += 1;
  if (!success) item.failed += 1;
  item.totalDurationMs += durationMs;
  item.maxDurationMs = Math.max(item.maxDurationMs, durationMs);
  db.commands.set(key, item);
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function cpuSnapshot() {
  const now = process.hrtime.bigint();
  const usage = process.cpuUsage(previousCpu);
  const elapsedMicros = Number(now - previousCpuAt) / 1000;
  previousCpu = process.cpuUsage();
  previousCpuAt = now;
  const usedMicros = usage.user + usage.system;
  return {
    usagePercentOneCore: elapsedMicros > 0 ? Number(((usedMicros / elapsedMicros) * 100).toFixed(2)) : 0,
    userMicros: usage.user,
    systemMicros: usage.system,
    loadAverage: process.platform === 'win32' ? [] : awaitImportOs.loadavg?.() || [],
  };
}

// Avoid top-level platform-specific branching in callers.
import os from 'node:os';
const awaitImportOs = os;

export function getMetrics() {
  const memory = process.memoryUsage();
  const durations = state.durations;
  const db = state.database;
  return {
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      cpu: cpuSnapshot(),
      memory: Object.fromEntries(
        Object.entries(memory).map(([key, value]) => [
          key,
          { bytes: value, megabytes: Number((value / 1024 / 1024).toFixed(2)) },
        ]),
      ),
    },
    databaseCommands: {
      totalCommands: db.totalCommands,
      failedCommands: db.failedCommands,
      averageDurationMs: db.totalCommands ? Number((db.totalDurationMs / db.totalCommands).toFixed(2)) : 0,
      p95DurationMs: Number(percentile(db.durations, 95).toFixed(2)),
      p99DurationMs: Number(percentile(db.durations, 99).toFixed(2)),
      slowestCommands: [...db.commands.entries()]
        .map(([command, value]) => ({
          command,
          count: value.count,
          failed: value.failed,
          averageDurationMs: Number((value.totalDurationMs / value.count).toFixed(2)),
          maxDurationMs: Number(value.maxDurationMs.toFixed(2)),
        }))
        .sort((a, b) => b.averageDurationMs - a.averageDurationMs)
        .slice(0, 20),
      rollingSampleSize: db.durations.length,
    },
    api: {
      totalRequests: state.totalRequests,
      averageDurationMs: state.totalRequests ? Number((state.totalDurationMs / state.totalRequests).toFixed(2)) : 0,
      p50DurationMs: Number(percentile(durations, 50).toFixed(2)),
      p95DurationMs: Number(percentile(durations, 95).toFixed(2)),
      p99DurationMs: Number(percentile(durations, 99).toFixed(2)),
      methods: { ...state.methods },
      statusClasses: { ...state.statusClasses },
      slowestRoutes: [...state.routes.entries()]
        .map(([route, value]) => ({
          route,
          count: value.count,
          averageDurationMs: Number((value.totalDurationMs / value.count).toFixed(2)),
          maxDurationMs: Number(value.maxDurationMs.toFixed(2)),
        }))
        .sort((a, b) => b.averageDurationMs - a.averageDurationMs)
        .slice(0, 20),
      rollingSampleSize: durations.length,
    },
  };
}

export function resetMetrics() {
  state.totalRequests = 0;
  state.totalDurationMs = 0;
  state.durations = [];
  state.methods = {};
  state.statusClasses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  state.routes.clear();
  state.database = { totalCommands: 0, failedCommands: 0, totalDurationMs: 0, durations: [], commands: new Map() };
}
