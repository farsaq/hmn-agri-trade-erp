# Milestone 3 — Supplier Enterprise Hardening

Implemented sequential supplier codes, normalized unique identity fields, Zod CRUD validation, transactional opening balance ledger, reconciliation, rollback, soft delete/restore, deleted listing, financial activity protection, advanced listing/filtering/pagination, ageing, timeline, PDF statement, tests, migration and API routes.

## Migration

`npm run migrate:suppliers`

## Endpoints

- GET/POST `/api/v1/suppliers`
- GET `/api/v1/suppliers-deleted`
- GET/PUT/DELETE `/api/v1/suppliers/:id`
- POST `/api/v1/suppliers/:id/restore`
- GET `/api/v1/suppliers/:id/timeline`
- GET `/api/v1/suppliers/:id/ageing`
- GET `/api/v1/suppliers/:id/statement.pdf`
