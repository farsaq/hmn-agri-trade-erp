# Milestone 6 — Transactions Enterprise (v4.6.0)

Implemented targeted hardening for Sales, Purchases, Returns, Payments and Expenses while preserving existing invoice, quotation, challan, reporting and sharing features.

## Safety controls

- Atomic Counter-based document numbers
- Database unique indexes and idempotency keys
- MongoDB transactions for stock, balances, ledgers, payments and audit entries
- Warehouse access checks
- Product unit conversion to base stock quantity
- Batch product/warehouse and expiry/quarantine validation
- Overpayment and allocation validation
- Draft sale confirmation and cancellation state controls
- Cumulative sales/purchase return quantity controls
- Customer credit notes and supplier debit notes
- Payment reversal and reversal ledger entries
- Supplier invoice duplicate prevention
- Purchase receiving, batch creation, weighted-average inventory updates and GRN records
- Expense tax, approval, payment, soft delete and restore lifecycle

Run `npm run migrate:transactions`, then `npm run verify`.
