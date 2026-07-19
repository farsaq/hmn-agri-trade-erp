# Phases 6–10 implementation

Implemented in this build:

- Enterprise supplier profiles, contracts, bank accounts, payment terms, purchase history, supplier ledger and document attachments.
- Product image uploads, multiple images, barcode PNG generation, QR generation, printable labels, categories, brands, supplier selection and batch/lot/serial/expiry records.
- Warehouse-specific stock using `WarehouseStock` (`product + warehouse + batch + quantity + averageCost`).
- Atomic warehouse transfers, reconciliation approval, stock valuation, inventory history, expiry visibility, damage/return/expiry approval requests.
- Professional multi-item sales invoices with server-side totals, discount, transport, tax, partial payments, credit limit checks, cancellation stock reversal, sale returns, quotations and delivery challans.

## Important operational rules

- Run `npm run seed` once after upgrading so the default warehouse and warehouse-stock rows are created.
- MongoDB Atlas must support transactions for the safest sales and inventory workflows.
- Uploaded files are stored locally under `backend/uploads` in development. Use persistent storage or Cloudinary in production.
