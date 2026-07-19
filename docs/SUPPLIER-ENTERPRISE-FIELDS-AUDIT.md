# Supplier Enterprise Fields Audit

This update extends the supplier model and supplier Excel/CSV import/export workflow.

## Added supplier identity

- Auto-generated supplier code
- Supplier type: local or international
- Business type
- Registration date

## Added tax fields

- GST number
- Sales tax registration flag
- Tax category

## Added payment fields

- Currency
- Payment method
- Payment cycle
- Due days

## Added banking fields

- SWIFT/BIC code
- Bank country
- Bank currency

## Added business/contact fields

- Website
- Facebook
- LinkedIn
- Secondary phone
- Emergency contact

## Added document links

- CNIC attachment
- NTN attachment
- Agreement PDF
- Bank cheque image

## Added supplier performance fields

- Rating from 0 to 5
- Blacklisted flag
- Preferred supplier flag

## Added accounting/logistics fields

- Ledger ID
- Default expense account
- Default payable account
- Default warehouse
- Delivery time in days
- Transport type

## Audit behavior

- Created By and Updated By are set automatically from the authenticated ERP user during import.
- Last transaction and last purchase date are supported in the model and import/export template.

## Import validation

- Supplier type validation
- Rating range validation
- Numeric validation for due days, credit limit, balances and delivery time
- Default warehouse matching by MongoDB ID, name, or warehouse code
- Duplicate supplier-code detection
- Existing duplicate detection by supplier code, CNIC, tax number, email, or phone
- URL warnings for web/social/document links

## Verification performed

- Backend JavaScript syntax passed
- Backend controller imports passed
- Frontend production build passed
- No new runtime dependency was required
