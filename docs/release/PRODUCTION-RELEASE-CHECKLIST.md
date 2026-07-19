# Production release checklist

## Automated gates

- `npm run verify`
- `npm run audit:security --prefix backend`
- `npm run reconcile --prefix backend`
- Docker images build successfully
- k6 smoke thresholds pass

## Required operator verification

- Rotate all secrets and use production-only `.env`
- MongoDB Atlas backup/restore drill
- SMTP, Cloudinary, Drive and payment credentials verified
- TLS certificate and DNS verified
- Admin, RBAC and warehouse-scope acceptance tests
- Trial balance and stock/balance reconciliation show zero unexplained differences

This package adds release infrastructure and automated checks. A real penetration test, production load test, and backup restore drill must be run against the deployment environment before declaring production approval.
