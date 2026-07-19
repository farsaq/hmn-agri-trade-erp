export function aggregateLowStockRows(stocks = []) {
  const grouped = new Map();
  for (const row of stocks) {
    const productId = String(row.product?._id || row.product || '');
    if (!productId) continue;
    const current = grouped.get(productId) || {
      product: row.product,
      quantity: 0,
      reserved: 0,
      available: 0,
      batches: 0,
    };
    current.quantity += Number(row.quantity || 0);
    current.reserved += Number(row.reserved || 0);
    current.available = current.quantity - current.reserved;
    current.batches += 1;
    grouped.set(productId, current);
  }
  return [...grouped.values()].filter((x) => x.quantity <= Number(x.product?.minimumStock || 0));
}
