# Milestone 4 — Product Enterprise

Version 4.4.0 adds sequential product codes, normalized unique SKU/barcode, multi-unit conversion, pricing controls and history, warehouse stock as source of truth, transactional stock adjustment, negative-stock prevention, soft delete/restore, advanced list filters, timeline, reports, migration, tests and OpenAPI documentation.

## Migration

`npm run migrate:products`

## Important stock rule

`WarehouseStock` is the operational source of truth. `Product.availableStock` is a synchronized summary maintained by inventory services.
