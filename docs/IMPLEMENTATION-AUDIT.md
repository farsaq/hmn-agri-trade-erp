# Implementation audit — v3.0.1

## Critical correction

- Enterprise routes are now mounted under `/api`, so warehouses, inventory movements, vehicles, payments, attachments, roles, integrations, company profile, invoice payload, restore, AI query and system health endpoints are reachable.

## Expanded data models

- Customers: photo, WhatsApp, taluka, district, credit limit, status, reference and attachments.
- Suppliers: photo, WhatsApp, location fields, credit limit, status, bank details and attachments.
- Products: SKU, brand, wholesale/retail prices, tax, warehouse reference, barcode, QR code, multiple images and expiry.
- Purchases: purchase number, weight/rate, vehicle, driver, expenses, payment method, status and attachments.
- Sales: tax, subtotal, grand total, payment method, status and attachments.

## Requires external credentials or infrastructure

The following are integration-ready but cannot work as a live service without credentials or infrastructure: SMTP/email delivery, WhatsApp/SMS delivery, Cloudinary uploads, hosted AI provider calls, Redis caching, automated cloud backups, custom domain and SSL.

## Important scope note

Barcode and QR values are stored and exposed by APIs; physical scanner hardware works as keyboard input. Fully styled PDF rendering, real outbound WhatsApp/email delivery, and scheduled backups require the relevant provider configuration and deployment jobs.
