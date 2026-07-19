# Product Export — Part 3

Implemented formats: XLSX, CSV, PDF, barcode-label PDF and QR-label PDF.

Filters: category, brand, supplier ObjectId, warehouse ObjectId, low stock, out of stock, expired/expiring products, and created date range.

API endpoints:

- `GET /api/integrations/products/export?format=xlsx|csv|pdf`
- `GET /api/integrations/products/export/barcode`
- `GET /api/integrations/products/export/qr`
