# HMN ERP Production Runbook

## Pre-deployment

1. Copy `.env.production` to a protected secret store and replace every placeholder.
2. Set strong JWT, cookie, Redis and metrics secrets.
3. Run `npm run test:all`, backend coverage, lint and frontend build.
4. Create and verify a database backup; record restore time.
5. Review migrations and confirm backward compatibility.

## Deployment

- Docker: `docker compose -f docker-compose.prod.yml up -d --build`
- PM2: `pm2 start ecosystem.config.cjs && pm2 save`
- Verify `/health/live`, `/health/ready` and `/health/status`.

## Incident response

- 5xx spike: inspect requestId-correlated error logs and recent release changes.
- Database unavailable: stop write traffic, check replica-set health and storage, then verify readiness.
- High latency: inspect p95/p99 API metrics, slow routes and MongoDB slow commands.
- Memory growth: capture PM2/process metrics and restart only after preserving evidence.

## Rollback

1. Disable traffic to the new release.
2. Deploy the previous immutable image/artifact.
3. Roll back database only when the migration plan explicitly supports it.
4. Verify health endpoints and core accounting workflows.
5. Record incident timeline and corrective actions.
