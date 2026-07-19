# Cloudinary Security & Monitoring Audit

Implemented in this build:

- Expiring one-time upload tokens with configurable TTL
- Token timestamp validation and replay prevention
- Server-side signed Cloudinary uploads
- Role/folder upload policy and admin-only delete policy
- Read-only authenticated download access
- Uploaded-by, owner role, department and branch ownership fields
- Last modified/accessed tracking and download counters
- Download access logs with user, IP, user-agent, timestamp, version and success/failure
- Persistent upload attempt history
- Persistent failed/blocked upload history with error categories and stack references
- Search and status filtering in admin monitoring UI
- Storage dashboard, folder usage, largest files and top uploaders
- Daily upload/download metrics and storage growth visualization
- Cloudinary provider storage, bandwidth and transformation usage when supported
- Existing Cloudinary image processing, validation, queue and folder features preserved

Environment controls:

```env
CLOUDINARY_SIGNED_UPLOAD_TTL_SECONDS=300
CLOUDINARY_REQUIRE_UPLOAD_TOKEN=true
CLOUDINARY_ACCOUNT_QUOTA_MB=0
CLOUDINARY_DOWNLOAD_TIMEOUT_MS=30000
```

Default role policy:

- admin: upload/download/delete/monitor all folders
- manager: upload/download/monitor all folders, no delete
- accountant: expenses, invoices and temp uploads
- sales: customers, invoices and temp uploads
- warehouse: products, product thumbnails and temp uploads
- operator: customers, suppliers, expenses and temp uploads
- viewer: download/monitor only where route permission permits
