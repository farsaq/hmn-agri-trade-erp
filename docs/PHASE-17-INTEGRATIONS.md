# Phase 17 — Enterprise Integrations

Implemented adapters and admin workflows:

- Cloudinary upload/delete, optimized delivery and folder selection.
- SMTP/domain email, generic SMS provider adapter and Meta WhatsApp Business messaging.
- Google Maps distance matrix and geocoding.
- Local JSON backup, Google Drive upload, history, checksum verification, download and transaction-protected restore.
- XLSX/CSV import-export with dry-run validation for customers, suppliers, products, sales, purchases, expenses and warehouse inventory.
- Payment transaction registry, Stripe PaymentIntent/refund support and provider-ready PayPal/JazzCash/Easypaisa/bank workflows.
- Incoming/outgoing webhooks, HMAC signing, API-key protection, delivery logs, retries and test delivery.

External services require credentials in `backend/.env`; without credentials the project reports the provider as unconfigured instead of pretending delivery succeeded.
