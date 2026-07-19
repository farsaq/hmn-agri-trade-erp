# HMN Agri Trade ERP v5.7.8 — Enterprise Release

Production-oriented foundation for the HMN Agri Trade ERP. Existing business features remain intact while project structure, configuration, API standards, health checks, error handling and logging have been stabilized.

## Local setup

### Backend

```powershell
cd backend
Copy-Item .env.example .env
notepad .env
npm install
npm run verify
npm run dev
```

Backend: `http://localhost:5000`

Health check: `http://localhost:5000/api/v1/health`

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend normally starts at `http://localhost:5173`; Vite may select `5174` when 5173 is occupied.

Frontend `.env`:

```env
VITE_API_URL=http://localhost:5000/api/v1
```

## Milestone 1 standards

- separated app and process startup
- centralized validated configuration
- API versioning with temporary legacy compatibility
- liveness, readiness and full health endpoints
- standard success/error contracts
- request IDs
- structured JSON logging with secret redaction
- normalized global error handling
- Helmet, CORS allow-list and rate limiting
- graceful shutdown
- baseline automated tests
- clean professional source package

Detailed implementation notes: `backend/docs/MILESTONE-1-PROJECT-STANDARDS.md`.

## Important security note

Do not distribute `.env`. Rotate any real credentials that were previously included in an archive.

## Milestone 1.1 Enterprise Hardening

See `docs/MILESTONE-1-ENTERPRISE-HARDENING.md` for logging, metrics, runtime configuration, developer tooling, and CI/CD details.

## v4.4 Milestone 4 — Product Enterprise

See `backend/docs/PRODUCT_ENTERPRISE_MILESTONE_4.md`. Run `npm run migrate:products` once after copying `.env`.

## v4.5 Warehouse & Units Enterprise

Run `npm run migrate:warehouses-units` in backend after upgrading. See `docs/MILESTONE-5-WAREHOUSE-UNITS.md`.

## v4.7.0 — Accounting Engine

Run `cd backend && npm run migrate:accounting` to seed the Chart of Accounts.

## Phase 2 Task 4 — Testing, Monitoring & Production Readiness

See `docs/PHASE-2-TASK-4-TESTING-MONITORING-PRODUCTION.md`, `docs/PRODUCTION-RUNBOOK.md`, and `docs/RELEASE-CHECKLIST.md`.
