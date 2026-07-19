import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import * as service from '../services/productService.js';
import { adjustStock, withInventoryTransaction } from '../services/inventoryService.js';
export async function list(req, res) {
  res.json(await service.listProducts(req.query));
}
export async function deleted(req, res) {
  res.json(await service.listProducts({ ...req.query, deleted: 'true' }));
}
export async function create(req, res) {
  res.status(201).json(await service.createProduct(req.body, req.user));
}
export async function update(req, res) {
  res.json(await service.updateProduct(req.params.id, req.body, req.user));
}
export async function remove(req, res) {
  res.json({ success: true, data: await service.softDeleteProduct(req.params.id, req.user) });
}
export async function restore(req, res) {
  res.json({ success: true, data: await service.restoreProduct(req.params.id, req.user) });
}
export async function detail(req, res) {
  res.json(await service.detail(req.params.id));
}
export async function timeline(req, res) {
  const d = await service.detail(req.params.id);
  const items = [
    ...d.movements.map((x) => ({
      date: x.createdAt,
      type: 'inventory',
      action: x.type,
      quantity: x.quantity,
      reference: x.reference,
      reason: x.reason,
    })),
    ...d.purchases.map((x) => ({ date: x.date, type: 'purchase', id: x._id, reference: x.purchaseNo, total: x.total })),
    ...d.sales.map((x) => ({ date: x.date, type: 'sale', id: x._id, reference: x.invoiceNo, total: x.total })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ items });
}
export async function adjust(req, res) {
  const result = await withInventoryTransaction((session) =>
    adjustStock(
      {
        productId: req.params.id,
        warehouseId: req.body.warehouse,
        batchId: req.body.batch,
        quantity: Number(req.body.quantity),
        type: 'adjustment',
        reason: req.body.reason,
        reference: req.body.reference,
        createdBy: req.user?._id,
        unitCost: req.body.unitCost,
      },
      { session },
    ),
  );
  res.status(201).json(result);
}
export async function reconcile(req, res) {
  res.json(await service.reconcileStock(req.params.id));
}
export async function statementPdf(req, res) {
  const d = await service.detail(req.params.id),
    p = d.product,
    doc = new PDFDocument({ margin: 42 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${p.productCode}-report.pdf`);
  doc.pipe(res);
  doc.fontSize(20).text('HMN Agri Trade - Product Report', { align: 'center' });
  doc.moveDown().fontSize(13).text(`${p.productCode} - ${p.name}`);
  doc.fontSize(10).text(`SKU: ${p.sku} | Barcode: ${p.barcode || '-'} | Category: ${p.category}`);
  doc.text(`Available: ${p.availableStock} ${p.baseUnit} | Reserved: ${p.reservedQuantity}`);
  doc.text(`Purchase price: PKR ${p.purchasePrice} | Sale price: PKR ${p.salePrice}`);
  doc.moveDown().fontSize(12).text('Summary');
  for (const [k, v] of Object.entries(d.summary)) doc.fontSize(10).text(`${k}: ${Number(v || 0).toLocaleString()}`);
  doc.moveDown().fontSize(12).text('Warehouse Stock');
  for (const s of d.stocks)
    doc
      .fontSize(9)
      .text(`${s.warehouse?.name || 'Warehouse'}: ${s.quantity} | Reserved ${s.reserved} | Avg cost ${s.averageCost}`);
  doc.end();
}
export async function exportExcel(req, res) {
  const d = await service.listProducts({ ...req.query, page: 1, limit: 100 }),
    wb = new ExcelJS.Workbook(),
    ws = wb.addWorksheet('Products');
  ws.columns = [
    ['Code', 'productCode'],
    ['Name', 'name'],
    ['SKU', 'sku'],
    ['Barcode', 'barcode'],
    ['Category', 'category'],
    ['Brand', 'brand'],
    ['Base Unit', 'baseUnit'],
    ['Stock', 'availableStock'],
    ['Purchase Price', 'purchasePrice'],
    ['Sale Price', 'salePrice'],
    ['Tax %', 'tax'],
    ['Active', 'active'],
  ].map(([header, key]) => ({ header, key, width: 18 }));
  ws.addRows(d.items.map((x) => x.toObject()));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
  await wb.xlsx.write(res);
  res.end();
}
