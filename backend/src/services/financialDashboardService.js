import { generateTrialBalance } from './trialBalanceService.js';
import { generateProfitLoss } from './profitLossService.js';
import { generateBalanceSheet } from './balanceSheetService.js';
import { generateCashFlow } from './cashFlowService.js';
import { calculateRatios } from './financialStatements.js';

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const pct = (current, previous) => (previous ? round(((current - previous) / Math.abs(previous)) * 100) : null);
const iso = (date) => date.toISOString().slice(0, 10);

function range(query = {}) {
  const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(dateTo.getFullYear(), 0, 1);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime()) || dateFrom > dateTo) {
    throw Object.assign(new Error('Invalid dashboard date range'), {
      statusCode: 422,
      code: 'ACCOUNTING_INVALID_DATE_RANGE',
    });
  }
  return { dateFrom, dateTo };
}

function previousRange(dateFrom, dateTo) {
  const days = Math.max(1, Math.ceil((dateTo - dateFrom) / 86400000) + 1);
  const previousTo = new Date(dateFrom);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - days + 1);
  return { previousFrom, previousTo };
}

async function monthlyTrend(query, dateFrom, dateTo) {
  const points = [];
  const latestWindowStart = new Date(dateTo.getFullYear(), dateTo.getMonth() - 23, 1);
  const trendFrom = dateFrom > latestWindowStart ? dateFrom : latestWindowStart;
  const cursor = new Date(trendFrom.getFullYear(), trendFrom.getMonth(), 1);
  while (cursor <= dateTo) {
    const start = cursor < trendFrom ? new Date(trendFrom) : new Date(cursor);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    if (end > dateTo) end.setTime(dateTo.getTime());
    const report = await generateProfitLoss({ ...query, dateFrom: iso(start), dateTo: iso(end), comparative: 'false' });
    points.push({
      period: iso(start).slice(0, 7),
      revenue: report.totalIncome,
      expenses: report.totalExpenses,
      netProfit: report.netProfit,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

export async function generateFinancialDashboard(query = {}) {
  const { dateFrom, dateTo } = range(query);
  const { previousFrom, previousTo } = previousRange(dateFrom, dateTo);
  const currentQuery = { ...query, dateFrom: iso(dateFrom), dateTo: iso(dateTo), comparative: 'false' };
  const previousQuery = { ...query, dateFrom: iso(previousFrom), dateTo: iso(previousTo), comparative: 'false' };

  const [tb, pl, bs, cf, previousPl, trend] = await Promise.all([
    generateTrialBalance(currentQuery),
    generateProfitLoss(currentQuery),
    generateBalanceSheet(currentQuery),
    generateCashFlow(currentQuery),
    generateProfitLoss(previousQuery),
    monthlyTrend(query, dateFrom, dateTo),
  ]);

  const ratios = calculateRatios({
    assets: bs.assets.items,
    liabilities: bs.liabilities.items,
    equity: bs.equity.items,
    income: pl.income,
    expenses: pl.expenses,
  });
  const workingCapital = round((ratios.currentAssets || 0) - (ratios.currentLiabilities || 0));
  const alerts = [];
  if (!tb.balanced)
    alerts.push({
      severity: 'critical',
      code: 'TRIAL_BALANCE',
      message: `Trial balance difference is PKR ${round(tb.difference)}`,
    });
  if (pl.netProfit < 0)
    alerts.push({
      severity: 'high',
      code: 'NET_LOSS',
      message: 'Business is reporting a net loss for the selected period.',
    });
  if ((ratios.currentRatio ?? 99) < 1)
    alerts.push({ severity: 'high', code: 'LIQUIDITY', message: 'Current ratio is below 1.00.' });
  if ((ratios.debtToEquity ?? 0) > 2)
    alerts.push({ severity: 'medium', code: 'LEVERAGE', message: 'Debt-to-equity ratio is above 2.00.' });
  if (cf.closingCashBalance < 0)
    alerts.push({ severity: 'critical', code: 'NEGATIVE_CASH', message: 'Closing cash balance is negative.' });
  if (Math.abs(cf.reconciliationDifference || 0) > 0.01)
    alerts.push({
      severity: 'critical',
      code: 'CASH_RECONCILIATION',
      message: 'Cash-flow statement does not reconcile with ledger cash.',
    });

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        (tb.balanced ? 0 : 25) -
        (pl.netProfit >= 0 ? 0 : 20) -
        ((ratios.currentRatio ?? 2) >= 1 ? 0 : 15) -
        ((ratios.debtToEquity ?? 0) <= 2 ? 0 : 10) -
        (cf.closingCashBalance >= 0 ? 0 : 20) -
        (Math.abs(cf.reconciliationDifference || 0) <= 0.01 ? 0 : 10),
    ),
  );

  return {
    meta: {
      name: 'Executive Financial Dashboard',
      dateFrom,
      dateTo,
      previousFrom,
      previousTo,
      generatedAt: new Date(),
      currency: 'PKR',
    },
    kpis: {
      revenue: pl.totalIncome,
      expenses: pl.totalExpenses,
      grossProfit: pl.grossProfit,
      operatingProfit: pl.operatingProfit,
      netProfit: pl.netProfit,
      assets: bs.totalAssets,
      liabilities: bs.totalLiabilities,
      equity: bs.totalEquity,
      openingCash: cf.openingCashBalance,
      netCashFlow: cf.netCashFlow,
      closingCash: cf.closingCashBalance,
      workingCapital,
      healthScore: score,
    },
    variance: {
      revenue: {
        amount: round(pl.totalIncome - previousPl.totalIncome),
        percentage: pct(pl.totalIncome, previousPl.totalIncome),
      },
      expenses: {
        amount: round(pl.totalExpenses - previousPl.totalExpenses),
        percentage: pct(pl.totalExpenses, previousPl.totalExpenses),
      },
      netProfit: {
        amount: round(pl.netProfit - previousPl.netProfit),
        percentage: pct(pl.netProfit, previousPl.netProfit),
      },
    },
    ratios,
    trend,
    alerts,
    controls: {
      trialBalanceBalanced: tb.balanced,
      trialBalanceDifference: tb.difference,
      balanceSheetBalanced: bs.balanced,
      balanceSheetDifference: bs.difference,
      cashFlowReconciled: Math.abs(cf.reconciliationDifference || 0) <= 0.01,
      cashFlowReconciliationDifference: cf.reconciliationDifference,
    },
  };
}
