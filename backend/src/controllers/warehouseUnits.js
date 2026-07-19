import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import * as svc from '../services/warehouseUnitService.js';
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const warehouses = async (req, res, next) => {
  try {
    ok(res, await svc.listWarehouses(req.query, false, req.user));
  } catch (e) {
    next(e);
  }
};
export const deletedWarehouses = async (req, res, next) => {
  try {
    ok(res, await svc.listWarehouses(req.query, true, req.user));
  } catch (e) {
    next(e);
  }
};
export const createWarehouse = async (req, res, next) => {
  try {
    const x = await svc.createWarehouse(req.body, req.user);
    await svc.audit(req, 'warehouse.created', 'Warehouse', x._id);
    ok(res, x, 201);
  } catch (e) {
    next(e);
  }
};
export const updateWarehouse = async (req, res, next) => {
  try {
    const x = await svc.updateWarehouse(req.params.id, req.body, req.user);
    await svc.audit(req, 'warehouse.updated', 'Warehouse', x._id);
    ok(res, x);
  } catch (e) {
    next(e);
  }
};
export const warehouse = async (req, res, next) => {
  try {
    ok(res, await svc.warehouseDetail(req.params.id));
  } catch (e) {
    next(e);
  }
};
export const removeWarehouse = async (req, res, next) => {
  try {
    const x = await svc.deleteWarehouse(req.params.id, req.user);
    await svc.audit(req, 'warehouse.deleted', 'Warehouse', x._id);
    ok(res, x);
  } catch (e) {
    next(e);
  }
};
export const restoreWarehouse = async (req, res, next) => {
  try {
    const x = await svc.restoreWarehouse(req.params.id, req.user);
    await svc.audit(req, 'warehouse.restored', 'Warehouse', x._id);
    ok(res, x);
  } catch (e) {
    next(e);
  }
};
export const warehouseTimeline = async (req, res, next) => {
  try {
    ok(res, await svc.warehouseTimeline(req.params.id));
  } catch (e) {
    next(e);
  }
};
export const warehouseTransfers = async (req, res, next) => {
  try {
    const d = await svc.warehouseDetail(req.params.id);
    ok(
      res,
      d.movements.filter((x) => x.type === 'transfer'),
    );
  } catch (e) {
    next(e);
  }
};
export const warehouseReconciliations = async (req, res, next) => {
  try {
    ok(res, (await svc.warehouseDetail(req.params.id)).reconciliations);
  } catch (e) {
    next(e);
  }
};
export const lowStock = async (req, res, next) => {
  try {
    ok(res, await svc.warehouseReport(req.params.id, 'low-stock'));
  } catch (e) {
    next(e);
  }
};
export const expiry = async (req, res, next) => {
  try {
    ok(res, await svc.warehouseReport(req.params.id, 'expiry', req.query));
  } catch (e) {
    next(e);
  }
};
export const warehousePdf = async (req, res, next) => {
  try {
    const d = await svc.warehouseDetail(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${d.warehouse.code}-warehouse-report.pdf"`);
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text('HMN Agri Trade - Warehouse Report');
    doc
      .moveDown()
      .fontSize(12)
      .text(`${d.warehouse.name} (${d.warehouse.warehouseCode})`)
      .text(`Code: ${d.warehouse.code}`)
      .text(`Type: ${d.warehouse.type}`)
      .text(
        `Location: ${[d.warehouse.address, d.warehouse.city, d.warehouse.district, d.warehouse.province].filter(Boolean).join(', ')}`,
      )
      .moveDown()
      .text(`Stock lines: ${d.summary.stockLines}`)
      .text(`Total quantity: ${d.summary.totalQuantity}`)
      .text(`Reserved: ${d.summary.reservedQuantity}`)
      .text(`Stock value: PKR ${d.summary.stockValue.toFixed(2)}`)
      .text(`Capacity utilization: ${d.summary.utilizationPercent.toFixed(2)}%`);
    doc.moveDown().fontSize(14).text('Warehouse Stock');
    for (const x of d.stocks.slice(0, 150))
      doc
        .fontSize(9)
        .text(`${x.product?.name || ''} | Qty ${x.quantity} | Reserved ${x.reserved} | Avg cost ${x.averageCost}`);
    doc.end();
  } catch (e) {
    next(e);
  }
};
export const warehouseExcel = async (req, res, next) => {
  try {
    const d = await svc.warehouseDetail(req.params.id),
      wb = new ExcelJS.Workbook(),
      ws = wb.addWorksheet('Warehouse Stock');
    ws.columns = [
      { header: 'Product', key: 'product', width: 30 },
      { header: 'SKU', key: 'sku', width: 18 },
      { header: 'Batch', key: 'batch', width: 18 },
      { header: 'Quantity', key: 'quantity', width: 15 },
      { header: 'Reserved', key: 'reserved', width: 15 },
      { header: 'Average Cost', key: 'averageCost', width: 15 },
      { header: 'Value', key: 'value', width: 18 },
    ];
    for (const x of d.stocks)
      ws.addRow({
        product: x.product?.name,
        sku: x.product?.sku,
        batch: x.batch?.batchNo,
        quantity: x.quantity,
        reserved: x.reserved,
        averageCost: x.averageCost,
        value: Number(x.quantity || 0) * Number(x.averageCost || 0),
      });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${d.warehouse.code}-warehouse-stock.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
};
export const units = async (req, res, next) => {
  try {
    ok(res, await svc.listUnits(req.query));
  } catch (e) {
    next(e);
  }
};
export const unit = async (req, res, next) => {
  try {
    ok(res, await svc.unitDetail(req.params.id));
  } catch (e) {
    next(e);
  }
};
export const deletedUnits = async (req, res, next) => {
  try {
    ok(res, await svc.listUnits(req.query, true));
  } catch (e) {
    next(e);
  }
};
export const createUnit = async (req, res, next) => {
  try {
    const x = await svc.createUnit(req.body, req.user);
    await svc.audit(req, 'unit.created', 'Unit', x._id);
    ok(res, x, 201);
  } catch (e) {
    next(e);
  }
};
export const updateUnit = async (req, res, next) => {
  try {
    const x = await svc.updateUnit(req.params.id, req.body, req.user);
    await svc.audit(req, 'unit.updated', 'Unit', x._id);
    ok(res, x);
  } catch (e) {
    next(e);
  }
};
export const removeUnit = async (req, res, next) => {
  try {
    const x = await svc.deleteUnit(req.params.id, req.user);
    await svc.audit(req, 'unit.deleted', 'Unit', x._id);
    ok(res, x);
  } catch (e) {
    next(e);
  }
};
export const restoreUnit = async (req, res, next) => {
  try {
    const x = await svc.restoreUnit(req.params.id, req.user);
    await svc.audit(req, 'unit.restored', 'Unit', x._id);
    ok(res, x);
  } catch (e) {
    next(e);
  }
};
export const convert = async (req, res, next) => {
  try {
    ok(res, await svc.convertUnits(req.body, req.user));
  } catch (e) {
    next(e);
  }
};
export const seedUnits = async (req, res, next) => {
  try {
    ok(res, await svc.seedDefaultUnits(req.user), 201);
  } catch (e) {
    next(e);
  }
};
export const conversionAudit = async (req, res, next) => {
  try {
    ok(res, await svc.unitAudit(req.query));
  } catch (e) {
    next(e);
  }
};
