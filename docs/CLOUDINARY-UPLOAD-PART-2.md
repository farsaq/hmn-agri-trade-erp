# Cloudinary Enterprise Part 2

Implemented image processing, automatic folders and queued upload UX.

## Image processing

- Cloudinary quality presets and compression
- Auto orientation and metadata stripping
- Resize-only, square, 16:9 and custom crop
- Eager thumbnail, medium and optimized WEBP variants

## Automatic folders

/company/logo, /products, /products/thumbnails, /customers, /suppliers, /expenses, /invoices, /contracts, /backups, /temp

## Upload UX

- Sequential background queue
- Per-file progress, upload speed and ETA
- Pause/resume queue
- Cancel current upload
- Retry failed uploads
- MongoDB asset metadata persistence and Cloudinary delete synchronization
