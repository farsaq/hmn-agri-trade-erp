# Cloudinary Enterprise v2.1 Audit

Implemented:

- AVIF and WEBP eager variants
- Responsive breakpoints
- Face-aware crop
- LQIP blur placeholder
- Configurable EXIF preservation
- Optional virus-scan webhook and infected-file blocking
- File magic, MIME, extension, size and image dimension validation
- SHA-256 duplicate-content detection in batch and database
- Folder statistics and quotas
- Configurable archival of old assets
- Multi-folder browser selection and drag/drop
- IndexedDB queue persistence and reconnect resume
- Configurable parallel upload concurrency
- High/normal/low queue priority

Notes:

- Browser folder selection uses `webkitdirectory` where supported.
- Virus scanning is active only when VIRUS_SCAN_WEBHOOK_URL is configured.
- Automatic archive marks database assets as archived; it does not delete Cloudinary files.
