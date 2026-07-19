# Product Import/Export Part 4 — Enterprise Features

Implemented:

- Persistent import/export job history
- In-process background queue for large product imports and exports
- Progress polling and queue status UI
- Cancel, retry, delete and re-download actions
- Original import file preservation
- Failed rows CSV/XLSX downloads
- Validation reports in CSV/XLSX/PDF
- 25,000-row import ceiling with transactional rollback
- Admin-only job/history endpoints
- Audit logs remain enabled for completed imports

Note: The queue is persisted in MongoDB, while workers run inside the Node process. For multi-server production deployment, migrate execution to BullMQ/Redis.
