# Milestone 1.1 — Enterprise Hardening

Implemented:

- Date-based log rotation and retention cleanup.
- Separate application, error, security, and audit log files.
- CPU, memory, uptime, MongoDB latency, and aggregate API latency metrics.
- Runtime JSON configuration reload by file watcher, SIGHUP, or protected endpoint.
- Feature flags and maintenance mode.
- Compression middleware.
- Zod environment schema validation.
- ESLint, Prettier, EditorConfig, Husky, and Commitlint.
- GitHub Actions backend verification, frontend build, and dependency audit jobs.
- Dependabot weekly dependency updates.

## Operational endpoints

- `GET /api/v1/health`
- `GET /api/v1/health/ready`
- `GET /api/v1/health/live`
- `GET /api/v1/health/metrics`
- `POST /api/v1/health/config/reload`

Set `METRICS_TOKEN` and pass it in `x-metrics-token` in production.
Copy `backend/config/runtime.example.json` to `backend/config/runtime.json` to override feature flags at runtime.
Runtime config is watched automatically. On Unix, `SIGHUP` also reloads it.

## Log files

Daily files are written under `backend/logs` by default:

- `application-YYYY-MM-DD.log`
- `error-YYYY-MM-DD.log`
- `security-YYYY-MM-DD.log`
- `audit-YYYY-MM-DD.log`
  Retention is controlled by `LOG_RETENTION_DAYS`.
