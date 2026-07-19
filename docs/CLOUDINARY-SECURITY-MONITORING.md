# Cloudinary Security & Monitoring

Implemented: expiring one-time upload tokens, replay protection, role/folder policies, ownership fields, download logging, upload/failure history, assets list, folder/storage analytics, top uploaders/folders and Cloudinary provider usage when available.

Default role policy: admin all; manager upload all; accountant expenses/invoices/temp; sales customers/invoices/temp; warehouse products/temp; operator customers/suppliers/expenses/temp; viewer download only. Delete is admin-only. Custom permission middleware remains active.
