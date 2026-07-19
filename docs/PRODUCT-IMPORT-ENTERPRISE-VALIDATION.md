# Product Import — Part 2 Enterprise Validation

Implemented validation and confirmation controls:

- Duplicate SKU detection inside the uploaded file and against MongoDB.
- Duplicate barcode detection inside the uploaded file and against MongoDB.
- Duplicate product detection using normalized product name + brand + unit.
- Purchase price, sale price, current stock, and minimum stock numeric validation.
- Negative price and stock rejection.
- Warning when sale price is below purchase price.
- Warning when minimum stock exceeds current stock.
- Category validation against supported active ERP categories.
- Supplier validation by ObjectId, name, company name, or phone.
- Warehouse validation by ObjectId, name, or code.
- Server-generated error CSV content.
- Preview summary with insert/update/skip/duplicate counts.
- Duplicate match reason shown as SKU, barcode, or name-brand-unit.
- Explicit import confirmation using a SHA-256 file/strategy fingerprint.
- Confirmation rejected when the file or duplicate strategy changes after preview.
- Transaction-based import and rollback remain enabled.

## Duplicate strategies

- `skip`: keep existing database products and skip matching rows.
- `update`: update the matching product.
- `error`: stop confirmation when duplicate or validation errors exist.
