# v5.0.1 Dependency Hardening

- Replaced vulnerable `xlsx`/SheetJS usage with the existing `exceljs` dependency.
- Spreadsheet import now supports XLSX and CSV through ExcelJS.
- Spreadsheet exports use ExcelJS for XLSX and CSV.
- Upgraded Nodemailer requirement to `^9.0.3`.
- ESLint excludes local source-backup directories.

Run `npm install`, `npm run verify`, and `npm audit` in `backend`.
