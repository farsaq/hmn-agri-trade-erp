# Supplier Import/Export — Part 1 Foundation

Implemented in the Integrations admin page.

## Features

- Excel and CSV supplier template downloads
- Excel and CSV supplier exports
- Excel/CSV import parsing
- Validation and preview before confirmation
- Duplicate strategies: skip, update, stop on duplicate
- Transaction-based import with rollback on failure
- Error CSV download
- 10,000 row limit
- Audit log on confirmed import

## Validated supplier fields

Name, company, phone, WhatsApp, email, CNIC, NTN/tax number, contact person,
village, taluka, district, city, province, country, address, payment terms,
credit limit, opening/current balances, bank name, account title, account number,
IBAN, branch, status, reference and notes.

## API routes

- GET `/api/integrations/suppliers/template?format=xlsx|csv`
- GET `/api/integrations/suppliers/export?format=xlsx|csv`
- POST `/api/integrations/suppliers/import`

Confirmed imports use a MongoDB transaction. MongoDB Atlas supports this workflow.
