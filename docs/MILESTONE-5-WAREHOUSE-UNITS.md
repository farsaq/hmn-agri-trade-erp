# Milestone 5 — Warehouse & Units Enterprise

Version 4.5.1 adds enterprise warehouse master data, sequential codes, structured location/manager data, capacity/default warehouse controls, assigned users, soft-delete/restore, deletion safety, dedicated reports/exports/timeline, and a global unit catalogue with agriculture defaults and audited conversions.

## Migration

```bash
npm run migrate:warehouses-units
```

## Stock source of truth

`WarehouseStock` remains the operational stock source. Product `availableStock` is a synchronized summary maintained by inventory services.
