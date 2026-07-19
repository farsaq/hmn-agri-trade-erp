import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { calculateRatios, statementRowsForExport } from '../services/financialStatements.js';
import { generateTrialBalance } from '../services/trialBalanceService.js';
import { generateProfitLoss } from '../services/profitLossService.js';
import { generateBalanceSheet } from '../services/balanceSheetService.js';
import { generateCashFlow } from '../services/cashFlowService.js';
import { generateFinancialDashboard } from '../services/financialDashboardService.js';

const fail = (res, error) =>
  res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || 'FINANCIAL_REPORT_ERROR',
    message: error.message || 'Unable to generate financial report',
  });
const reportMeta = (name, dateFrom, dateTo) => ({ name, dateFrom, dateTo, generatedAt: new Date(), currency: 'PKR' });

async function trialBalanceData(query) {
  return generateTrialBalance(query);
}

async function profitLossData(query) {
  return generateProfitLoss(query);
}

async function balanceSheetData(query) {
  return generateBalanceSheet(query);
}

async function cashFlowData(query) {
  return generateCashFlow(query);
}

export async function trialBalance(req, res) {
  try {
    res.json(await trialBalanceData(req.query));
  } catch (e) {
    fail(res, e);
  }
}
export async function profitLoss(req, res) {
  try {
    res.json(await profitLossData(req.query));
  } catch (e) {
    fail(res, e);
  }
}
export async function balanceSheet(req, res) {
  try {
    res.json(await balanceSheetData(req.query));
  } catch (e) {
    fail(res, e);
  }
}
export async function cashFlow(req, res) {
  try {
    res.json(await cashFlowData(req.query));
  } catch (e) {
    fail(res, e);
  }
}
export async function financialRatios(req, res) {
  try {
    const bs = await balanceSheetData(req.query),
      pl = await profitLossData(req.query);
    res.json({
      meta: reportMeta('Financial Ratios', pl.meta.dateFrom, bs.meta.dateTo),
      ratios: calculateRatios({
        assets: bs.assets.items,
        liabilities: bs.liabilities.items,
        equity: bs.equity.items,
        income: pl.income,
        expenses: pl.expenses,
      }),
    });
  } catch (e) {
    fail(res, e);
  }
}
export async function comparative(req, res) {
  try {
    const currentFrom = req.query.currentFrom,
      currentTo = req.query.currentTo,
      previousFrom = req.query.previousFrom,
      previousTo = req.query.previousTo;
    if (!currentFrom || !currentTo || !previousFrom || !previousTo)
      return res.status(422).json({ message: 'currentFrom, currentTo, previousFrom and previousTo are required' });
    const [current, previous] = await Promise.all([
      profitLossData({ dateFrom: currentFrom, dateTo: currentTo }),
      profitLossData({ dateFrom: previousFrom, dateTo: previousTo }),
    ]);
    const change = (a, b) => ({
      amount: Math.round((a - b) * 100) / 100,
      percentage: b ? Math.round(((a - b) / Math.abs(b)) * 10000) / 100 : null,
    });
    res.json({
      current,
      previous,
      variance: {
        income: change(current.totalIncome, previous.totalIncome),
        expenses: change(current.totalExpenses, previous.totalExpenses),
        netProfit: change(current.netProfit, previous.netProfit),
      },
    });
  } catch (e) {
    fail(res, e);
  }
}
export async function dashboard(req, res) {
  try {
    res.json(await generateFinancialDashboard(req.query));
  } catch (e) {
    fail(res, e);
  }
}

const loaders = {
  'trial-balance': trialBalanceData,
  'profit-loss': profitLossData,
  'balance-sheet': balanceSheetData,
  'cash-flow': cashFlowData,
};
async function exportPayload(type, query) {
  const loader = loaders[type];
  if (!loader) throw Object.assign(new Error('Unsupported report type'), { statusCode: 404 });
  return loader(query);
}
function flattenReport(type, data) {
  if (type === 'trial-balance')
    return [
      [
        'Code',
        'Account',
        'Opening Debit',
        'Opening Credit',
        'Period Debit',
        'Period Credit',
        'Closing Debit',
        'Closing Credit',
      ],
      ...data.items.map((x) => [
        x.code,
        x.name,
        x.openingDebit,
        x.openingCredit,
        x.periodDebit,
        x.periodCredit,
        x.closingDebit,
        x.closingCredit,
      ]),
      [
        '',
        'Totals',
        data.totals.openingDebit,
        data.totals.openingCredit,
        data.totals.periodDebit,
        data.totals.periodCredit,
        data.totals.closingDebit,
        data.totals.closingCredit,
      ],
    ];
  if (type === 'cash-flow')
    return [
      ['Section', 'Date', 'Journal', 'Account', 'Description', 'Source Type', 'Inflow', 'Outflow', 'Net Amount'],
      ...['operating', 'investing', 'financing'].flatMap((section) =>
        (data.sections?.[section] || data[section] || []).map((x) => [
          section,
          x.date,
          x.journalNo,
          `${x.accountCode || ''} ${x.accountName || ''}`.trim(),
          x.description,
          x.sourceType,
          x.amount > 0 ? x.amount : 0,
          x.amount < 0 ? Math.abs(x.amount) : 0,
          x.amount,
        ]),
      ),
      ['', '', '', '', 'Opening cash balance', '', '', '', data.openingCashBalance],
      ['', '', '', '', 'Net cash flow', '', '', '', data.netCashFlow],
      ['', '', '', '', 'Closing cash balance', '', '', '', data.closingCashBalance],
      ['', '', '', '', 'Reconciliation difference', '', '', '', data.reconciliationDifference],
    ];
  if (type === 'balance-sheet')
    return [
      ['Section', 'Classification', 'Code', 'Account', 'Balance'],
      ...['assets', 'liabilities', 'equity'].flatMap((section) =>
        data[section].items.map((x) => [section, x.classification, x.code, x.name, x.balance]),
      ),
      ['equity', '', '', 'Retained earnings', data.currentEarnings],
      ['', '', '', 'Difference', data.difference],
    ];
  const rows = statementRowsForExport(data);
  return [['Code', 'Account', 'Balance'], ...rows];
}
export async function exportPdf(req, res) {
  try {
    const data = await exportPayload(req.params.type, req.query),
      rows = flattenReport(req.params.type, data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.pdf"`);
    const doc = new PDFDocument({ margin: 36 });
    doc.pipe(res);
    doc.fontSize(18).text(data.meta.name);
    doc.fontSize(9).text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();
    rows.forEach((row) => doc.text(row.map((x) => String(x ?? '')).join(' | ')));
    doc.end();
  } catch (e) {
    fail(res, e);
  }
}
export async function exportExcel(req, res) {
  try {
    const data = await exportPayload(req.params.type, req.query),
      rows = flattenReport(req.params.type, data),
      wb = new ExcelJS.Workbook(),
      ws = wb.addWorksheet(data.meta.name.slice(0, 31));
    rows.forEach((row) => ws.addRow(row));
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    fail(res, e);
  }
}
export async function exportCsv(req, res) {
  try {
    const data = await exportPayload(req.params.type, req.query),
      rows = flattenReport(req.params.type, data);
    const esc = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.csv"`);
    res.send(rows.map((row) => row.map(esc).join(',')).join('\n'));
  } catch (e) {
    fail(res, e);
  }
}
