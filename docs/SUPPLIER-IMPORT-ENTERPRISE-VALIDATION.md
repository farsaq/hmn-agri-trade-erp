# Supplier Import/Export — Part 2 Enterprise Validation

Implemented validation and import safety:

- Duplicate detection inside the uploaded file and against MongoDB for supplier code, supplier name, company, phone, WhatsApp, email, CNIC, NTN, tax number and GST number.
- Duplicate strategy: skip, update, or stop with an error.
- Phone/WhatsApp/secondary/emergency number validation (10–15 digits).
- Email, CNIC, NTN, GST, IBAN, SWIFT/BIC and bank-account format validation.
- Currency, payment method, payment cycle, supplier type and status validation.
- Negative credit limit, opening balance, current balance, due days and delivery time rejection.
- Invalid warehouse detection using warehouse ID, name or code.
- Village format validation and warning when a village is not yet present in ERP master data.
- Blacklisted/preferred-supplier conflict validation.
- Import preview with duplicate match reason.
- Server-generated error CSV and validation report (CSV/JSON from UI).
- SHA-256 confirmation fingerprint. The import is rejected if the file or duplicate strategy changes after preview.
- MongoDB transaction and complete rollback on failure.
- Existing sidebar scrolling, dashboard scrolling and logout layout fixes preserved.

## Validation workflow

1. Select an XLSX or CSV file.
2. Choose duplicate strategy.
3. Click **Validate & preview**.
4. Review errors, warnings, duplicates and matched fields.
5. Download the error CSV or validation report when needed.
6. Click **Confirm transactional import** without changing the file or strategy.

## Audit

- Backend dependency installation: passed.
- Backend syntax and controller import: passed.
- Frontend dependency installation: passed.
- Frontend production build: passed.
- Mongoose reserved `errors` field warning fixed by using `errorDetails` for transfer jobs.
