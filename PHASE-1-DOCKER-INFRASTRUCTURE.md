# Phase 1 — Docker & Infrastructure

## Existing assets retained and upgraded

- `backend/Dockerfile`: upgraded to development and production targets, non-root runtime, `tini`, and health check.
- `frontend/Dockerfile`: upgraded to development and production targets with build-time API configuration and Nginx health check.
- `docker-compose.yml`: upgraded from backend/frontend only to a complete local stack with MongoDB replica set, Redis, persistent volumes, and health-gated startup.
- `frontend/nginx.conf`: retained and hardened with WebSocket proxying, compression, cache policy, and health endpoint.

## Newly added

- `docker-compose.prod.yml`
- `backend/.dockerignore`
- `frontend/.dockerignore`
- `.env.example`
- `.env.docker`
- `.env.production`
- `scripts/start-dev.ps1`
- `scripts/start-prod.ps1`
- `scripts/start-dev.sh`
- `scripts/start-prod.sh`
- `docker/mongo-init/init-replica.sh`

## Local development

```powershell
.\scripts\start-dev.ps1
```

or:

```bash
./scripts/start-dev.sh
```

## Production template

1. Replace all `CHANGE_ME` values in `.env.production`.
2. Use a real HTTPS domain in `PUBLIC_APP_URL` and `CLIENT_URL`.
3. Run:

```powershell
.\scripts\start-prod.ps1
```

The local MongoDB service runs as a single-node replica set because ERP transactions require MongoDB transaction support.
