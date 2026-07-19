# Milestone 2 — Customer Enterprise

## Implemented

- Sequential customer codes (`CUS-000001`) backed by an atomic counter
- Normalized, database-unique phone, CNIC and email identities
- Zod create/update validation and input-field whitelisting
- Transactional customer creation plus opening-balance ledger posting
- Transactional opening-balance reconciliation on edit
- MongoDB rollback for customer/ledger failures
- Soft delete, restore and deleted-record listing
- Deletion block when sales or non-opening ledger activity exists
- Search, stable pagination metadata, filter set and sort whitelist
- Village, district, balance, credit-exceeded, status, category, tag and registration-date filters
- Tags, category and registration date
- Unified customer activity timeline
- Outstanding ageing buckets: current, 1–30, 31–60, 61–90 and 90+
- JSON and PDF customer statements
- CNIC display formatter
- Customer migration command
- Automated validation/query tests
- OpenAPI 3.1 customer API document

## Database migration

Run once after copying the existing `.env`:

```powershell
cd backend
npm install
npm run migrate:customers
npm run verify
npm run dev
```

The migration backfills codes and normalized identity fields. It prints duplicate conflicts. Conflicting historic records must be corrected in the application before strict unique indexes are synchronized in production.

## API routes

- `GET /api/v1/customers`
- `GET /api/v1/customers-deleted`
- `POST /api/v1/customers`
- `GET /api/v1/customers/{id}`
- `PUT /api/v1/customers/{id}`
- `DELETE /api/v1/customers/{id}`
- `POST /api/v1/customers/{id}/restore`
- `GET /api/v1/customers/{id}/timeline`
- `GET /api/v1/customers/{id}/ageing`
- `GET /api/v1/customers/{id}/statement`
- `GET /api/v1/customers/{id}/statement.pdf`
