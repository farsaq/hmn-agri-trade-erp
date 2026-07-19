# HMN Agri Trade ERP v5.7.8 — Financial Dashboard & KPI Analytics

## Added

- Enterprise executive financial dashboard service
- Current-period vs previous-period variance analytics
- Monthly revenue, expense and net-profit trend
- Financial health score (0–100)
- Liquidity, leverage, profitability and cash KPI display
- Trial-balance, balance-sheet and cash-flow control checks
- Automated financial risk alerts
- Date-range and accounting-dimension compatibility
- Responsive executive dashboard UI and print support

## New files

- backend/src/services/financialDashboardService.js
- frontend/src/admin/FinancialDashboard.jsx

## Modified files

- backend/src/controllers/financialStatements.js
- frontend/src/admin/AccountingPage.jsx

## Compatibility

Apply after v5.7.7. Existing `/accounting/reports/dashboard` route is retained and upgraded; no route-file replacement is required.
