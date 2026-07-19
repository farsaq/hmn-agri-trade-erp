# Product Import Foundation

## Endpoints

- `GET /api/integrations/products/template?format=xlsx`
- `GET /api/integrations/products/template?format=csv`
- `POST /api/integrations/products/import`

The import endpoint accepts multipart form-data:

- `file`: `.xlsx`, `.xls`, or `.csv`
- `duplicateStrategy`: `skip`, `update`, or `error`
- `dryRun`: `true` for validation/preview
- `confirm`: `true` to commit

## Supported columns

`name`, `sku`, `barcode`, `qrCode`, `category`, `brand`, `unit`, `supplier`, `warehouse`, `purchasePrice`, `salePrice`, `availableStock`, `minimumStock`

Common aliases such as `Product Name`, `Current Stock`, `Purchase Price`, `Supplier Name`, and `Warehouse Code` are accepted.

## Validation

- Product name, SKU, and unit are required.
- Category must be one of Cotton, Wheat, DAP, Urea, Bardana, Seeds, Pesticides, or Other.
- Purchase price, sale price, current stock, and minimum stock must be valid non-negative numbers.
- Duplicate SKU and barcode values inside the uploaded file are detected.
- Supplier references may use MongoDB ID, exact supplier name, company name, or phone number.
- Warehouse references may use MongoDB ID, exact warehouse name, or warehouse code.
- Referenced suppliers and warehouses must already exist.
- Existing products are detected by SKU first, then barcode.

## Transaction and rollback

Confirmed imports run inside a MongoDB transaction. If any database operation fails, the entire import is rolled back. This requires MongoDB Atlas or another replica-set deployment, which the HMN project already uses.

## UI

The Enterprise Integrations page includes template downloads, file selection, duplicate strategy, validation preview, confirmation, and downloadable error CSV.
