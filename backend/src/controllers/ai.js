import { Customer, Supplier, Product, Sale, Purchase, Expense } from '../models/index.js';
import { WarehouseStock, ProductBatch } from '../models/operations.js';
import { AIQueryLog } from '../models/ai.js';
import { synthesizeWithAI } from '../services/aiProvider.js';
import { writeAudit } from './governance.js';
const money = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const rangeDays = (days) => new Date(Date.now() - Number(days) * 86400000);
const totals = async (from) => {
  const [s, p, e] = await Promise.all([
    Sale.aggregate([
      { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          paid: { $sum: '$payment' },
          remaining: { $sum: '$remaining' },
          count: { $sum: 1 },
        },
      },
    ]),
    Purchase.aggregate([
      { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          paid: { $sum: '$payment' },
          remaining: { $sum: '$remaining' },
          count: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      { $match: { date: { $gte: from }, status: { $in: ['approved', 'paid'] } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);
  return {
    sales: s[0] || { total: 0, paid: 0, remaining: 0, count: 0 },
    purchases: p[0] || { total: 0, paid: 0, remaining: 0, count: 0 },
    expenses: e[0] || { total: 0, count: 0 },
  };
};
const linearForecast = (values) => {
  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  const n = values.length,
    sx = (n * (n - 1)) / 2,
    sy = values.reduce((a, b) => a + b, 0),
    sxx = values.reduce((a, _, i) => a + i * i, 0),
    sxy = values.reduce((a, b, i) => a + i * b, 0),
    den = n * sxx - sx * sx;
  const slope = den ? (n * sxy - sx * sy) / den : 0;
  const intercept = (sy - slope * sx) / n;
  return Math.max(0, intercept + slope * n);
};
async function monthlySeries(Model, valueField = 'total', months = 12) {
  const from = new Date();
  from.setMonth(from.getMonth() - (months - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const rows = await Model.aggregate([
    { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
    { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, value: { $sum: `$${valueField}` } } },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const map = new Map(rows.map((r) => [`${r._id.y}-${r._id.m}`, r.value]));
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    out.push({
      month: d.toLocaleString('en', { month: 'short', year: '2-digit' }),
      value: Number(map.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0),
    });
  }
  return out;
}
async function expenseMonthlySeries(months = 12) {
  const from = new Date();
  from.setMonth(from.getMonth() - (months - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const rows = await Expense.aggregate([
    { $match: { date: { $gte: from }, status: { $in: ['approved', 'paid'] } } },
    { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, value: { $sum: '$amount' } } },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const map = new Map(rows.map((r) => [`${r._id.y}-${r._id.m}`, r.value]));
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    out.push({
      month: d.toLocaleString('en', { month: 'short', year: '2-digit' }),
      value: Number(map.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0),
    });
  }
  return out;
}
async function customerBuyingTrends(from) {
  return Sale.aggregate([
    { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { customer: '$customer', product: '$items.product' },
        quantity: { $sum: '$items.quantity' },
        value: { $sum: '$items.amount' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { value: -1 } },
    { $limit: 30 },
    { $lookup: { from: 'customers', localField: '_id.customer', foreignField: '_id', as: 'customer' } },
    { $lookup: { from: 'products', localField: '_id.product', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        customerId: '$_id.customer',
        customer: '$customer.name',
        village: '$customer.village',
        productId: '$_id.product',
        product: '$product.name',
        category: '$product.category',
        quantity: 1,
        value: 1,
        orders: 1,
      },
    },
  ]);
}
async function topVillageForProduct(question, from) {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (x) =>
        x.length > 2 &&
        ![
          'which',
          'village',
          'bought',
          'most',
          'sabse',
          'zyada',
          'kis',
          'kharidi',
          'khareedi',
          'highest',
          'sales',
          'product',
        ].includes(x),
    );
  if (!tokens.length) return null;
  const rx = new RegExp(tokens.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const products = await Product.find({ $or: [{ name: rx }, { category: rx }, { sku: rx }, { brand: rx }] })
    .select('_id name category')
    .lean();
  if (!products.length) return null;
  const rows = await Sale.aggregate([
    { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: products.map((x) => x._id) } } },
    {
      $group: {
        _id: { $ifNull: ['$village', 'Unknown'] },
        quantity: { $sum: '$items.quantity' },
        sales: { $sum: '$items.amount' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { quantity: -1, sales: -1 } },
    { $limit: 1 },
  ]);
  return rows[0] ? { ...rows[0], products: products.map((x) => x.name) } : null;
}
async function productVelocity(days = 90) {
  const from = rangeDays(days);
  return Sale.aggregate([
    { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.amount' },
        avgRate: { $avg: '$items.rate' },
        orders: { $sum: 1 },
      },
    },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    {
      $project: {
        name: '$product.name',
        category: '$product.category',
        availableStock: '$product.availableStock',
        minimumStock: '$product.minimumStock',
        purchasePrice: '$product.purchasePrice',
        salePrice: '$product.salePrice',
        quantity: 1,
        revenue: 1,
        avgRate: 1,
        orders: 1,
      },
    },
  ]);
}
async function intelligence(days = 30) {
  const from = rangeDays(days),
    now = new Date(),
    soon = new Date(Date.now() + 30 * 86400000);
  const [t, topCustomers, topProducts, lowStock, expiring, overdue, byVillage, velocity, buyingTrends] =
    await Promise.all([
      totals(from),
      Sale.aggregate([
        { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: '$customer',
            sales: { $sum: '$total' },
            remaining: { $sum: '$remaining' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { sales: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
        { $unwind: '$customer' },
        { $project: { name: '$customer.name', village: '$customer.village', sales: 1, remaining: 1, orders: 1 } },
      ]),
      productVelocity(days),
      Product.find({ $expr: { $lte: ['$availableStock', '$minimumStock'] } })
        .select('name category availableStock minimumStock purchasePrice salePrice')
        .lean(),
      ProductBatch.find({ expiryDate: { $gte: now, $lte: soon }, status: { $nin: ['expired', 'depleted'] } })
        .populate('product', 'name category')
        .lean(),
      Sale.find({ remaining: { $gt: 0 }, dueDate: { $lt: now }, status: { $nin: ['paid', 'cancelled'] } })
        .populate('customer', 'name village creditLimit currentBalance')
        .sort({ remaining: -1 })
        .limit(20)
        .lean(),
      Sale.aggregate([
        { $match: { date: { $gte: from }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $ifNull: ['$village', 'Unknown'] }, sales: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { sales: -1 } },
        { $limit: 10 },
      ]),
      productVelocity(90),
      customerBuyingTrends(from),
    ]);
  topProducts.sort((a, b) => b.revenue - a.revenue);
  const profit = t.sales.total - t.purchases.total - t.expenses.total;
  const outstanding = await Customer.aggregate([{ $group: { _id: null, total: { $sum: '$currentBalance' } } }]);
  const suggestions = [];
  for (const p of lowStock)
    suggestions.push({
      type: 'reorder',
      severity: 'critical',
      title: `Reorder ${p.name}`,
      message: `Stock ${p.availableStock}; minimum ${p.minimumStock}. Suggested minimum order: ${Math.max(p.minimumStock * 2 - p.availableStock, 0)}.`,
      entityId: p._id,
    });
  for (const p of velocity) {
    const daily = p.quantity / 90,
      daysCover = daily > 0 ? p.availableStock / daily : 999;
    if (daysCover < 30)
      suggestions.push({
        type: 'inventory',
        severity: daysCover < 14 ? 'critical' : 'warning',
        title: `${p.name} stock cover`,
        message: `Approximately ${Math.round(daysCover)} days of stock remain based on 90-day demand.`,
      });
    if (p.avgRate && p.purchasePrice) {
      const margin = ((p.avgRate - p.purchasePrice) / p.purchasePrice) * 100;
      if (margin < 8)
        suggestions.push({
          type: 'price',
          severity: 'warning',
          title: `Review ${p.name} price`,
          message: `Recent gross margin is approximately ${margin.toFixed(1)}%. Consider reviewing selling price or purchase cost.`,
        });
    }
  }
  for (const s of overdue.slice(0, 5))
    suggestions.push({
      type: 'credit-risk',
      severity: 'critical',
      title: `Credit risk: ${s.customer?.name || 'Customer'}`,
      message: `Overdue ${money(s.remaining)}${s.customer?.creditLimit ? `; credit usage ${Math.round((s.customer.currentBalance / s.customer.creditLimit) * 100)}%` : ''}.`,
    });
  return {
    periodDays: days,
    summary: {
      sales: t.sales.total,
      purchases: t.purchases.total,
      expenses: t.expenses.total,
      profit,
      cashReceived: t.sales.paid,
      cashPaid: t.purchases.paid + t.expenses.total,
      outstanding: outstanding[0]?.total || 0,
      orders: t.sales.count,
    },
    topCustomers,
    topProducts: topProducts.slice(0, 10),
    fastMoving: velocity.sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    slowMoving: velocity.sort((a, b) => a.quantity - b.quantity).slice(0, 10),
    lowStock,
    expiring,
    overdue,
    byVillage,
    customerBuyingTrends: buyingTrends,
    suggestions: suggestions.slice(0, 30),
  };
}
function summaryText(label, d) {
  const s = d.summary;
  return `${label}: sales ${money(s.sales)}, purchases ${money(s.purchases)}, expenses ${money(s.expenses)}, estimated profit ${money(s.profit)}, outstanding customer balance ${money(s.outstanding)}. ${d.lowStock.length} products are at or below minimum stock and ${d.overdue.length} invoices are overdue.`;
}
export async function dashboard(req, res) {
  const [daily, weekly, monthly, salesSeries, purchaseSeries, expenseSeries] = await Promise.all([
    intelligence(1),
    intelligence(7),
    intelligence(30),
    monthlySeries(Sale),
    monthlySeries(Purchase),
    expenseMonthlySeries(),
  ]);
  const recommendations = monthly.suggestions.slice(0, 8);
  res.json({
    businessSummary: summaryText('Current month', monthly),
    daily: { text: summaryText('Today', daily), data: daily.summary },
    weekly: { text: summaryText('Last 7 days', weekly), data: weekly.summary },
    monthly: { text: summaryText('Last 30 days', monthly), data: monthly.summary },
    recommendations,
    charts: { sales: salesSeries, purchases: purchaseSeries, expenses: expenseSeries },
    warnings: { lowStock: monthly.lowStock, expiry: monthly.expiring, overdue: monthly.overdue },
    customerBuyingTrends: monthly.customerBuyingTrends,
    fastMoving: monthly.fastMoving,
    slowMoving: monthly.slowMoving,
  });
}
export async function forecasts(req, res) {
  const [sales, purchases, expenses, velocity, products, stockTotals, buyingTrends] = await Promise.all([
    monthlySeries(Sale),
    monthlySeries(Purchase),
    expenseMonthlySeries(),
    productVelocity(90),
    Product.find().lean(),
    WarehouseStock.aggregate([
      {
        $group: {
          _id: '$product',
          quantity: { $sum: '$quantity' },
          value: { $sum: { $multiply: ['$quantity', '$averageCost'] } },
        },
      },
    ]),
    customerBuyingTrends(rangeDays(90)),
  ]);
  const salesPrediction = linearForecast(sales.map((x) => x.value)),
    purchasePrediction = linearForecast(purchases.map((x) => x.value)),
    expensePrediction = linearForecast(expenses.map((x) => x.value));
  const stockMap = new Map(stockTotals.map((x) => [String(x._id), x]));
  const inventory = products
    .map((p) => {
      const v = velocity.find((x) => String(x._id) === String(p._id));
      const stock = stockMap.get(String(p._id));
      const currentStock = Number(stock?.quantity ?? p.availableStock ?? 0);
      const monthlyDemand = (v?.quantity || 0) / 3;
      return {
        productId: p._id,
        name: p.name,
        currentStock,
        stockValue: Number(stock?.value || 0),
        predictedMonthlyDemand: Math.round(monthlyDemand),
        predictedClosingStock: Math.round(currentStock - monthlyDemand),
        recommendedOrder: Math.max(0, Math.ceil(monthlyDemand + Number(p.minimumStock || 0) - currentStock)),
      };
    })
    .sort((a, b) => b.recommendedOrder - a.recommendedOrder);
  const month = new Date().getMonth() + 1;
  const seasonal = await Sale.aggregate([
    { $match: { $expr: { $eq: [{ $month: '$date' }, month] }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', quantity: { $sum: '$items.quantity' } } },
    { $sort: { quantity: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: { name: '$product.name', quantity: 1 } },
  ]);
  const priceRecommendations = velocity
    .filter((x) => x.purchasePrice > 0)
    .map((x) => ({
      productId: x._id,
      name: x.name,
      currentAverageRate: x.avgRate,
      currentSalePrice: x.salePrice,
      purchasePrice: x.purchasePrice,
      grossMarginPercent: Number(((((x.avgRate || x.salePrice) - x.purchasePrice) / x.purchasePrice) * 100).toFixed(1)),
      recommendation:
        ((x.avgRate || x.salePrice) - x.purchasePrice) / x.purchasePrice < 0.08
          ? 'Review price or purchase cost'
          : 'Margin appears acceptable',
    }))
    .sort((a, b) => a.grossMarginPercent - b.grossMarginPercent)
    .slice(0, 15);
  const observations = sales.filter((x) => x.value > 0).length;
  res.json({
    nextMonth: {
      sales: salesPrediction,
      purchases: purchasePrediction,
      expenses: expensePrediction,
      profit: salesPrediction - purchasePrediction - expensePrediction,
    },
    series: { sales, purchases, expenses },
    inventory,
    seasonalDemand: seasonal,
    customerBuyingTrends: buyingTrends,
    priceRecommendations,
    dataQuality: {
      monthsWithSales: observations,
      confidence: observations >= 9 ? 'medium' : observations >= 4 ? 'low' : 'very-low',
    },
    method:
      'Linear trend from up to 12 monthly observations; inventory demand uses recent 90-day sales. Treat forecasts as decision support, not guaranteed outcomes.',
  });
}
async function answerLocal(question) {
  const q = question.toLowerCase(),
    days = q.includes('week') ? 7 : q.includes('today') ? 1 : q.includes('month') ? 30 : 30,
    d = await intelligence(days);
  let intent = 'business-summary',
    answer = summaryText(days === 1 ? 'Today' : days === 7 ? 'This week' : 'This month', d),
    data = d.summary;
  if (/highest|top.*pending|pending.*customer|outstanding customer/.test(q)) {
    intent = 'highest-pending-customer';
    const c = await Customer.findOne({ currentBalance: { $gt: 0 } })
      .sort({ currentBalance: -1 })
      .lean();
    answer = c
      ? `${c.name}${c.village ? ` from ${c.village}` : ''} has the highest pending balance: ${money(c.currentBalance)}.`
      : 'No customer has a pending balance.';
    data = c;
  } else if (/profit/.test(q)) {
    intent = 'profit';
    answer = `Estimated ${days === 7 ? 'weekly' : days === 1 ? 'daily' : 'monthly'} profit is ${money(d.summary.profit)} (sales minus purchases and approved/paid expenses).`;
    data = d.summary;
  } else if (/low stock|reorder/.test(q)) {
    intent = 'low-stock';
    answer = d.lowStock.length
      ? `${d.lowStock.length} products need attention: ${d.lowStock
          .slice(0, 8)
          .map((x) => `${x.name} (${x.availableStock}/${x.minimumStock})`)
          .join(', ')}.`
      : 'No products are currently below minimum stock.';
    data = d.lowStock;
  } else if (/top\s*(10)?\s*customers|best customers/.test(q)) {
    intent = 'top-customers';
    answer = d.topCustomers.length
      ? `Top customers: ${d.topCustomers.map((x, i) => `${i + 1}. ${x.name} — ${money(x.sales)}`).join('; ')}`
      : 'No sales data is available.';
    data = d.topCustomers;
  } else if (/sales/.test(q) && /week|today|month|how much|kitni|kitna/.test(q)) {
    intent = 'sales-total';
    answer = `Sales for the selected ${days}-day period are ${money(d.summary.sales)} across ${d.summary.orders} orders.`;
    data = d.summary;
  } else if (/village/.test(q) && /(wheat|cotton|urea|dap|product|bought|kharidi|khareedi)/.test(q)) {
    intent = 'product-village';
    const v = await topVillageForProduct(question, rangeDays(days));
    answer = v
      ? `${v._id} bought the highest quantity of ${v.products.join(', ')}: ${Number(v.quantity || 0).toLocaleString()} units worth ${money(v.sales)}.`
      : 'No matching product-wise village sales data is available.';
    data = v;
  } else if (/village/.test(q)) {
    intent = 'top-village';
    const v = d.byVillage[0];
    answer = v
      ? `${v._id} has the highest sales in this period: ${money(v.sales)} across ${v.orders} orders.`
      : 'No village sales data is available.';
    data = v;
  } else if (/purchase|kharid/.test(q) && /(how much|kitni|kitna|total|month|week|today)/.test(q)) {
    intent = 'purchase-total';
    answer = `Purchases for the selected ${days}-day period are ${money(d.summary.purchases)}.`;
    data = d.summary;
  } else if (/expense|kharcha/.test(q)) {
    intent = 'expense-total';
    answer = `Approved and paid expenses for the selected ${days}-day period are ${money(d.summary.expenses)}.`;
    data = d.summary;
  } else if (/customer buying|buying trend|customer trend/.test(q)) {
    intent = 'customer-buying-trends';
    answer = d.customerBuyingTrends.length
      ? `Leading customer-product trends: ${d.customerBuyingTrends
          .slice(0, 10)
          .map(
            (x) =>
              `${x.customer || 'Unknown'} — ${x.product || 'Product'} (${Number(x.quantity || 0).toLocaleString()} units)`,
          )
          .join('; ')}`
      : 'No customer buying trend data is available.';
    data = d.customerBuyingTrends;
  } else if (/price recommendation|pricing|price review/.test(q)) {
    intent = 'price-recommendations';
    const low = d.suggestions.filter((x) => x.type === 'price');
    answer = low.length
      ? low.map((x) => x.message).join(' ')
      : 'No urgent price-margin warnings were found in recent sales.';
    data = low;
  } else if (/cash outstanding|outstanding|receivable/.test(q)) {
    intent = 'outstanding';
    answer = `Total customer outstanding balance is ${money(d.summary.outstanding)}.`;
    data = { outstanding: d.summary.outstanding };
  } else if (/fast moving/.test(q)) {
    intent = 'fast-moving';
    answer = d.fastMoving.length
      ? `Fast-moving products: ${d.fastMoving
          .slice(0, 10)
          .map((x) => `${x.name} (${x.quantity})`)
          .join(', ')}.`
      : 'No product movement data is available.';
    data = d.fastMoving;
  } else if (/slow moving/.test(q)) {
    intent = 'slow-moving';
    answer = d.slowMoving.length
      ? `Slow-moving products: ${d.slowMoving
          .slice(0, 10)
          .map((x) => `${x.name} (${x.quantity})`)
          .join(', ')}.`
      : 'No product movement data is available.';
    data = d.slowMoving;
  } else if (/predict|forecast/.test(q)) {
    intent = 'forecast';
    const f = await Promise.all([monthlySeries(Sale), monthlySeries(Purchase), expenseMonthlySeries()]);
    const values = {
      sales: linearForecast(f[0].map((x) => x.value)),
      purchases: linearForecast(f[1].map((x) => x.value)),
      expenses: linearForecast(f[2].map((x) => x.value)),
    };
    values.profit = values.sales - values.purchases - values.expenses;
    answer = `Next-month trend forecast: sales ${money(values.sales)}, purchases ${money(values.purchases)}, expenses ${money(values.expenses)}, estimated profit ${money(values.profit)}.`;
    data = values;
  }
  return {
    intent,
    answer,
    data,
    context: {
      periodDays: days,
      summary: d.summary,
      warnings: { lowStock: d.lowStock.slice(0, 10), overdue: d.overdue.slice(0, 10) },
      recommendations: d.suggestions.slice(0, 10),
    },
  };
}
export async function query(req, res) {
  const question = String(req.body.question || '').trim();
  if (question.length < 3) return res.status(400).json({ message: 'Enter a business question' });
  const started = Date.now();
  try {
    const local = await answerLocal(question);
    const generated = await synthesizeWithAI({ question, context: local.context, localAnswer: local.answer });
    const log = await AIQueryLog.create({
      user: req.user._id,
      question,
      intent: local.intent,
      answer: generated.answer,
      data: local.data,
      provider: generated.provider,
      durationMs: Date.now() - started,
      error: generated.providerError,
    });
    await writeAudit({
      req,
      action: 'AI_QUERY',
      entity: 'AIQueryLog',
      entityId: log._id,
      description: 'AI business query executed',
      metadata: { intent: local.intent, provider: generated.provider },
    });
    res.json({
      answer: generated.answer,
      intent: local.intent,
      data: local.data,
      provider: generated.provider,
      providerError: generated.providerError,
    });
  } catch (error) {
    await AIQueryLog.create({
      user: req.user._id,
      question,
      error: error.message,
      durationMs: Date.now() - started,
    }).catch(() => {});
    throw error;
  }
}
export async function search(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, total: 0, groups: {} });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [customers, suppliers, products, sales, purchases] = await Promise.all([
    Customer.find({ $or: [{ name: rx }, { phone: rx }, { cnic: rx }, { village: rx }, { whatsapp: rx }] })
      .limit(20)
      .lean(),
    Supplier.find({ $or: [{ name: rx }, { company: rx }, { phone: rx }, { village: rx }] })
      .limit(20)
      .lean(),
    Product.find({ $or: [{ name: rx }, { sku: rx }, { barcode: rx }, { qrCode: rx }, { brand: rx }, { category: rx }] })
      .limit(20)
      .lean(),
    Sale.find({ $or: [{ invoiceNo: rx }, { vehicle: rx }, { driver: rx }, { village: rx }] })
      .populate('customer', 'name')
      .limit(20)
      .lean(),
    Purchase.find({ $or: [{ purchaseNo: rx }, { vehicle: rx }, { driver: rx }, { reference: rx }] })
      .populate('supplier', 'name')
      .limit(20)
      .lean(),
  ]);
  const groups = { customers, suppliers, products, sales, purchases };
  res.json({ query: q, total: Object.values(groups).reduce((n, a) => n + a.length, 0), groups });
}
export async function reportSummary(req, res) {
  const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365),
    d = await intelligence(days);
  const warnings = [
    ...d.lowStock.slice(0, 5).map((x) => `${x.name} is low in stock.`),
    ...d.overdue.slice(0, 5).map((x) => `${x.customer?.name || 'Customer'} has overdue ${money(x.remaining)}.`),
  ];
  const actions = d.suggestions.slice(0, 8).map((x) => x.message);
  res.json({
    periodDays: days,
    summary: summaryText(`${days}-day report`, d),
    insights: [
      `Gross sales: ${money(d.summary.sales)}.`,
      `Estimated profit: ${money(d.summary.profit)}.`,
      `Cash collected: ${money(d.summary.cashReceived)}.`,
      d.topProducts[0]
        ? `Top product: ${d.topProducts[0].name} with ${money(d.topProducts[0].revenue)} revenue.`
        : 'No product-sales ranking available.',
      d.byVillage[0]
        ? `Top village: ${d.byVillage[0]._id} with ${money(d.byVillage[0].sales)} sales.`
        : 'No village ranking available.',
      d.fastMoving[0]
        ? `Fastest-moving product: ${d.fastMoving[0].name} (${Number(d.fastMoving[0].quantity || 0).toLocaleString()} units).`
        : 'No movement ranking available.',
      d.customerBuyingTrends[0]
        ? `Strongest customer buying trend: ${d.customerBuyingTrends[0].customer || 'Unknown'} buying ${d.customerBuyingTrends[0].product || 'product'}.`
        : 'No customer trend available.',
    ],
    warnings,
    actions,
    data: d,
  });
}
export async function history(req, res) {
  const items = await AIQueryLog.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit || 30), 100));
  res.json(items);
}
