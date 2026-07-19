import { Router } from 'express';
import mongoose from 'mongoose';
import { APP_NAME, API_VERSION } from '../constants/app.js';
import { env } from '../config/env.js';
import { getRuntimeConfig, loadRuntimeConfig } from '../config/runtime.js';
import { getMetrics } from '../utils/metrics.js';
import { metricsToPrometheus } from '../utils/prometheus.js';

const router = Router();
const startedAt = Date.now();
const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
const databaseState = () => states[mongoose.connection.readyState] || 'unknown';

async function databaseLatency() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return { connected: false, latencyMs: null };
  const started = process.hrtime.bigint();
  await mongoose.connection.db.admin().ping();
  return { connected: true, latencyMs: Number((Number(process.hrtime.bigint() - started) / 1_000_000).toFixed(2)) };
}

function requireMetricsAccess(req, res, next) {
  if (!env.metricsToken && !env.isProduction) return next();
  if (!env.metricsToken && env.isProduction)
    return res.status(503).json({
      success: false,
      message: 'Operational endpoints are disabled until METRICS_TOKEN is configured',
      error: { code: 'METRICS_DISABLED' },
      requestId: req.requestId,
    });
  const supplied = req.get('x-metrics-token');
  if (supplied === env.metricsToken) return next();
  return res.status(401).json({
    success: false,
    message: 'Metrics authentication required',
    error: { code: 'METRICS_AUTH_REQUIRED' },
    requestId: req.requestId,
  });
}

router.get('/health', async (req, res, next) => {
  try {
    const db = databaseState();
    const healthy = db === 'connected';
    const latency = await databaseLatency();
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      message: healthy ? 'Service is healthy' : 'Service is not ready',
      data: {
        service: APP_NAME,
        apiVersion: API_VERSION,
        status: healthy ? 'healthy' : 'degraded',
        database: db,
        databaseLatencyMs: latency.latencyMs,
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt: new Date(startedAt).toISOString(),
        timestamp: new Date().toISOString(),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
});
router.get('/health/live', (req, res) =>
  res.success({ message: 'Service is alive', data: { status: 'alive', timestamp: new Date().toISOString() } }),
);
router.get('/health/ready', async (req, res) => {
  try {
    const latency = await databaseLatency();
    return res.status(latency.connected ? 200 : 503).json({
      success: latency.connected,
      message: latency.connected ? 'Service is ready' : 'Database is not ready',
      data: { database: databaseState(), databaseLatencyMs: latency.latencyMs, timestamp: new Date().toISOString() },
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Database readiness check failed',
      data: { database: databaseState(), error: error.message },
      requestId: req.requestId,
    });
  }
});
router.get('/health/metrics', requireMetricsAccess, async (req, res, next) => {
  try {
    return res.success({
      message: 'Operational metrics',
      data: {
        ...getMetrics(),
        database: await databaseLatency(),
        runtime: getRuntimeConfig(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/health/status', async (req, res) => {
  try {
    const db = await databaseLatency();
    const metrics = getMetrics();
    const p95 = metrics.api.p95DurationMs;
    const errorCount = metrics.api.statusClasses['5xx'] || 0;
    const requestCount = metrics.api.totalRequests || 0;
    const errorRate = requestCount ? Number(((errorCount / requestCount) * 100).toFixed(3)) : 0;
    const healthy = db.connected && p95 < 2000 && errorRate < 5;
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      message: healthy ? 'Operational SLOs are within limits' : 'One or more operational SLOs are breached',
      data: {
        database: db,
        slo: { p95LatencyMs: p95, p95TargetMs: 2000, errorRatePercent: errorRate, errorRateTargetPercent: 5 },
        status: healthy ? 'operational' : 'degraded',
        timestamp: new Date().toISOString(),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Operational status check failed',
      error: { code: 'STATUS_CHECK_FAILED', detail: error.message },
      requestId: req.requestId,
    });
  }
});
router.get('/health/prometheus', requireMetricsAccess, async (req, res, next) => {
  try {
    const database = await databaseLatency();
    res.type('text/plain; version=0.0.4; charset=utf-8');
    return res.send(metricsToPrometheus(getMetrics(), database));
  } catch (error) {
    return next(error);
  }
});

router.post('/health/config/reload', requireMetricsAccess, (req, res, next) => {
  try {
    return res.success({ message: 'Runtime configuration reloaded', data: loadRuntimeConfig() });
  } catch (error) {
    return next(error);
  }
});
export default router;
