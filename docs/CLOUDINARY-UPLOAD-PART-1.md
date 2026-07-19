# Cloudinary Enterprise Upload — Part 1

Implemented:

- Single and multiple file upload
- Drag-and-drop upload UI
- Browser folder selection where supported
- Purposes/folders for products, company, customers, suppliers, expenses and invoices
- JPG, PNG, WEBP, PDF, DOCX and XLSX validation
- Configurable maximum file size and count
- Allowed MIME/extension verification
- Duplicate filename detection inside each selection
- Empty-file rejection
- Magic-byte checks for corrupt or disguised files
- Upload progress and per-file results
- Signed server-side Cloudinary uploads
- Audit logging

Environment:

```env
CLOUDINARY_MAX_FILE_SIZE_MB=15
CLOUDINARY_MAX_FILES=20
```
