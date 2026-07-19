# Phase 2 — Task 4: Testing, Monitoring and Production Readiness

Version: 5.6.0

## Delivered

- Backend unit/integration test commands and coverage command.
- Frontend structural smoke tests.
- Production smoke and concurrent load-smoke scripts.
- Liveness, readiness, SLO status, JSON metrics and Prometheus endpoints.
- CPU, memory, API percentile, HTTP status and MongoDB command telemetry.
- PM2 cluster configuration and graceful-shutdown compatibility.
- Prometheus scrape configuration and baseline alert rules.
- Production runbook, release checklist and rollback procedure.

## Operational endpoints

- `GET /api/v1/health/live` — liveness
- `GET /api/v1/health/ready` — database readiness
- `GET /api/v1/health/status` — SLO/readiness summary
- `GET /api/v1/health/metrics` — protected JSON metrics
- `GET /api/v1/health/prometheus` — protected Prometheus metrics

In production, configure `METRICS_TOKEN` and provide it as `x-metrics-token`. Never expose protected operational endpoints publicly without network restrictions.

## Verification

```bash
npm run test:all
npm run build --prefix frontend
npm run test:coverage:ci --prefix backend
npm run smoke:production --prefix backend
```

## Acceptance criteria

1. All automated tests pass.
2. Frontend production build succeeds.
3. Liveness returns 200 independent of database availability.
4. Readiness returns 503 when MongoDB is unavailable.
5. Metrics require a token in production.
6. Graceful shutdown completes within the orchestrator timeout.
7. Backup restoration is rehearsed before release.
8. Rollback artifact and database compatibility are confirmed.
