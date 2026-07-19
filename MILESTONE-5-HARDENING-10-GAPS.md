# Milestone 5.1 Warehouse & Units Hardening

Implemented: warehouse-level access enforcement, assigned-user list scoping, product-aggregated low-stock reporting, unified warehouse timeline (audit/sales/purchases/inventory), calculated-only utilization reporting, direct ProductBatch warehouse linkage and deletion checks, transactional unit update validation, explicit cycle/self-reference protection, unit detail endpoint, configurable expiry reports, and additional regression tests.

Expiry examples: `?days=7`, `?days=90`, `?status=expired`, `?status=all`.

`currentUtilization` remains only for backward compatibility and is not used as the authoritative value. Reports calculate utilization from warehouse stock.
