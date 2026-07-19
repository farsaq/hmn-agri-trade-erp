# Supplier Import/Export Part 4 — Enterprise Features

Implemented:

- Persistent supplier import and export history in MongoDB
- Background supplier import jobs
- Existing background supplier export jobs included in unified history
- Progress, stage, processed, remaining, success, failed and duplicate counters
- Import retry, cancel and history deletion
- Original import file download
- Export result re-download
- Failed rows CSV and Excel
- Validation reports in CSV, Excel and PDF
- 25,000-row supplier import limit
- Transactional supplier import rollback
- Admin-only job/history endpoints
- Audit events for queue creation, completion, failure, retry, cancellation and deletion

Notes:

- Background work currently runs in the Node process. Use Redis/BullMQ for multi-instance production deployments.
- Cancellation is cooperative: queued jobs cancel immediately; a transaction already committing may finish before cancellation is observed.
