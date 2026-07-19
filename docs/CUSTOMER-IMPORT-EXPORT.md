# Customer Excel/CSV Import-Export

## Features

- Download XLSX and CSV import templates.
- Export all customers to XLSX or CSV.
- Validate spreadsheet before writing to MongoDB.
- Preview insert/update/skip actions.
- Required-field validation for name and phone.
- CNIC validation (13 digits).
- Numeric validation for balances and credit limit.
- Status validation: active, inactive, blocked.
- Header aliases such as `Customer Name`, `Father Name`, `Mobile`, and `Opening Balance`.
- Duplicate detection inside the uploaded file by phone and CNIC.
- Duplicate detection against existing MongoDB customers.
- Duplicate strategies: skip, update, or stop with error.
- Downloadable CSV error report.
- Explicit confirmation before import.
- Maximum 5,000 rows per file.
- Audit log entry after each confirmed import.
- Permission enforcement through `integrations.view` and `integrations.manage`.

## Endpoints

- `GET /api/integrations/customers/template?format=xlsx|csv`
- `GET /api/integrations/customers/export?format=xlsx|csv`
- `POST /api/integrations/customers/import`

Import form fields:

- `file`: XLSX, XLS, or CSV file
- `duplicateStrategy`: `skip`, `update`, or `error`
- `dryRun`: `true` for validation and preview
- `confirm`: `true` to write valid rows

## Recommended workflow

1. Download a template.
2. Fill customer rows without changing header names.
3. Upload and select a duplicate strategy.
4. Click **Validate & preview**.
5. Review issues and download the error CSV if needed.
6. Correct the spreadsheet or click **Confirm import**.
