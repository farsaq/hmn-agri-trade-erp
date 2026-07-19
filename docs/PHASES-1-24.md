# HMN Agri Trade ERP v3.0 — Phase Coverage

1. Premium public website: landing, services, products, contact and lead API.
2. Authentication: JWT, refresh sessions, remember me, forgot/reset, OTP workflow, session revocation.
3. Dashboard: KPIs, charts, profit, cash flow, top customers/products, low stock and notifications.
4. Customers: extended profile, balances, notes, ledger, transactions and attachment-ready API.
5. Suppliers: profile, balances, purchases, payments and documents.
6. Products: category, grade, prices, tax, warehouse, minimum/current stock, barcode and image fields.
7. Inventory: warehouses and stock-in/out, transfer, adjustment, damage, returns and expiry movements.
8. Sales: invoice records, items, discounts, transport, payment, remaining and status-ready schema.
9. Purchases: supplier, item, weight, rate, vehicle/driver/reference and attachment-ready records.
10. Khata: credit/debit entries, running balance, print and export-ready data.
11. Expenses: categorized operational expenses.
12. Reports: daily/weekly/monthly/yearly sales, purchases, profit/loss, stock and party ledgers.
13. Invoice: invoice API with company profile, QR payload and barcode payload; browser print/export workflow.
14. Notifications: generated low-stock and pending-payment notices plus persisted notifications.
15. AI assistant: local business-query engine and provider-ready adapter using OPENAI_API_KEY.
16. Barcode: product barcode field and scanner-compatible search/input model.
17. QR: invoice/customer/product/supplier payload-ready architecture.
18. Audit logs: authentication and enterprise CRUD actions.
19. Multi-user: admin, manager, accountant, sales, warehouse and viewer roles plus custom role records.
20. Backup/restore: JSON export and administrator-only restore endpoint; scheduled cloud backup adapter-ready.
21. Mobile/PWA: responsive admin, manifest and service worker.
22. Security: Helmet, rate limiting, bcrypt, JWT, HTTP-only refresh cookie, validation-ready middleware and RBAC.
23. Performance: pagination on enterprise modules, lazy-route-ready frontend, indexed MongoDB fields and cache adapter flags.
24. Deployment: Vercel/Render/Atlas/Cloudinary/Redis environment templates and HTTPS-ready configuration.

External services need their own credentials: SMTP/email, SMS/WhatsApp, Cloudinary, hosted AI, Redis, scheduled cloud backup and production domain/DNS.
