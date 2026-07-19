# Milestone 6.1 — Financial Hardening

This release makes `/api/v1` the canonical financial transaction engine.

## Critical fixes

- Initial sale and purchase payments are posted exactly once.
- Draft sales cannot carry an unposted payment.
- Draft confirmation loads the sale before checking warehouse access.
- Payment direction, party, and allocated document ownership are validated.
- Payment reversal is race-protected and reverses document, party ledger, and cash/bank account entries.

## Sales

- Draft stock reservation and release.
- Confirmation consumes reservations and posts stock/receivable transactionally.
- Immutable state transitions, fulfilment marker, cancellation reversal.
- Base-unit return limits, approval, credit note, disposition, PDF.

## Purchases

- Draft, confirm, receive/GRN, cancel workflow.
- Partial GRN quantities, accepted/rejected inspection quantities.
- Landed-cost allocation across freight, expenses, tax, and discount.
- PO approval, GRN cancellation, purchase-return approval/debit note.

## Payments and accounts

- Unified payment list/detail/PDF.
- Cash/bank accounts and account entries.
- Cheque lifecycle.
- Advance/unallocated payment preserved.

## Expenses

- Strict Zod whitelist validation.
- Maker-checker approval history.
- Cash/bank posting, voucher number/PDF, reversal, listing/detail/timeline.

## Compatibility

Legacy sales workspace write routes are wrappers around the canonical transaction controller. Duplicate business logic is no longer used for those routes.
