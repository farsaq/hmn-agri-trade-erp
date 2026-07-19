import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { Sale, Purchase, Customer, Supplier, Ledger, Expense, AuditLog } from '../models/index.js';
import { Warehouse } from '../models/enterprise.js';
import { ProductBatch, SaleReturn } from '../models/operations.js';
import { Payment, PurchaseReturn, CreditNote, PurchaseOrder, GoodsReceipt } from '../models/transactions.js';
import { adjustStock } from '../services/inventoryService.js';
import { nextSequence, hydrateLines, totals, n } from '../services/transactionService.js';
import { saleSchema, purchaseSchema, paymentSchema, returnSchema, parse } from '../validators/transactions.js';

const isAdmin = (u) => ['admin', 'manager'].includes(u?.role);
async function warehouseAllowed(user, warehouseId) {
  if (isAdmin(user)) return true;
  const wh = await Warehouse.findById(warehouseId).lean();
  if (!wh) return false;
  return (wh.assignedUsers || []).some((x) => String(x.user || x) === String(user._id));
}
async function ensureWarehouse(user, id) {
  if (!(await warehouseAllowed(user, id)))
    throw Object.assign(new Error('Warehouse access denied'), { statusCode: 403, code: 'WAREHOUSE_ACCESS_DENIED' });
}
async function ensureBatch({ batch, product, warehouse, session }) {
  if (!batch) return null;
  const b = await ProductBatch.findById(batch).session(session);
  if (!b || String(b.product) !== String(product) || String(b.warehouse || '') !== String(warehouse))
    throw Object.assign(new Error('Batch does not belong to product/warehouse'), {
      statusCode: 422,
      code: 'BATCH_CONTEXT_INVALID',
    });
  if (b.status === 'quarantined' || b.status === 'expired' || (b.expiryDate && b.expiryDate < new Date()))
    throw Object.assign(new Error('Batch is not saleable'), { statusCode: 409, code: 'BATCH_NOT_SALEABLE' });
  return b;
}
async function idempotent(Model, key) {
  return key ? Model.findOne({ idempotencyKey: key }) : null;
}
async function audit(session, user, action, entity, entityId, metadata) {
  await AuditLog.create([{ user: user._id, action, entity, entityId, metadata }], { session });
}

export async function createSale(req, res) {
  const body = parse(saleSchema, req.body);
  await ensureWarehouse(req.user, body.warehouse);
  const existing = await idempotent(Sale, body.idempotencyKey);
  if (existing) return res.status(200).json(existing);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const items = await hydrateLines(body.items, { session });
      const calc = totals(body, items);
      if (calc.payment > calc.total)
        throw Object.assign(new Error('Payment exceeds invoice total'), { statusCode: 409, code: 'SALE_OVERPAYMENT' });
      const invoiceNo = await nextSequence('sale-invoice', 'INV', { session });
      for (const i of items) {
        await ensureBatch({ batch: i.batch, product: i.product, warehouse: body.warehouse, session });
        if (body.status !== 'draft')
          await adjustStock(
            {
              productId: i.product,
              warehouseId: body.warehouse,
              batchId: i.batch,
              quantity: -i.baseQuantity,
              type: 'stock-out',
              reason: `Sale ${invoiceNo}`,
              createdBy: req.user._id,
            },
            { session },
          );
      }
      const status =
        body.status === 'draft' ? 'draft' : calc.remaining <= 0 ? 'paid' : calc.payment > 0 ? 'partial' : 'confirmed';
      [result] = await Sale.create(
        [
          {
            ...body,
            ...calc,
            invoiceNo,
            status,
            items: items.map(({ _productDoc, ...x }) => x),
            idempotencyKey: body.idempotencyKey,
            stateHistory: [{ state: status, at: new Date(), by: req.user._id }],
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      if (body.status !== 'draft') {
        if (calc.remaining > 0) {
          const c = await Customer.findByIdAndUpdate(
            body.customer,
            { $inc: { currentBalance: calc.remaining } },
            { new: true, session },
          );
          if (!c) throw new Error('Customer not found');
          if (n(c.creditLimit) > 0 && n(c.currentBalance) > n(c.creditLimit) && !isAdmin(req.user))
            throw Object.assign(new Error('Credit limit exceeded'), {
              statusCode: 409,
              code: 'CUSTOMER_CREDIT_LIMIT_EXCEEDED',
            });
          await Ledger.create(
            [
              {
                partyType: 'customer',
                party: c._id,
                partyModel: 'Customer',
                type: 'credit',
                amount: calc.remaining,
                description: `Invoice ${invoiceNo}`,
                referenceType: 'sale',
                referenceId: result._id,
                balanceAfter: c.currentBalance,
              },
            ],
            { session },
          );
        }
        if (calc.payment > 0)
          await createPaymentInternal(
            {
              direction: 'receipt',
              partyType: 'customer',
              party: body.customer,
              amount: calc.payment,
              method: body.paymentMethod || 'cash',
              allocations: [{ documentType: 'sale', document: result._id, amount: calc.payment }],
            },
            req.user,
            session,
          );
      }
      await audit(session, req.user, 'SALE_CREATED', 'Sale', result._id, { invoiceNo, status });
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(e.statusCode || 400).json({
      success: false,
      error: { code: e.code || 'SALE_CREATE_FAILED', message: e.message, details: e.details },
    });
  } finally {
    await session.endSession();
  }
}

export async function confirmSale(req, res) {
  await ensureWarehouse(req.user, req.body.warehouse || req.params.warehouse);
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale || sale.status !== 'draft')
        throw Object.assign(new Error('Only draft sale can be confirmed'), {
          statusCode: 409,
          code: 'SALE_STATE_INVALID',
        });
      await ensureWarehouse(req.user, sale.warehouse);
      for (const i of sale.items) {
        await ensureBatch({ batch: i.batch, product: i.product, warehouse: sale.warehouse, session });
        await adjustStock(
          {
            productId: i.product,
            warehouseId: sale.warehouse,
            batchId: i.batch,
            quantity: -n(i.baseQuantity || i.quantity),
            type: 'stock-out',
            reason: `Sale ${sale.invoiceNo}`,
            createdBy: req.user._id,
          },
          { session },
        );
      }
      sale.status = sale.remaining <= 0 ? 'paid' : sale.payment > 0 ? 'partial' : 'confirmed';
      sale.stateHistory.push({ state: sale.status, at: new Date(), by: req.user._id });
      await sale.save({ session });
      if (n(sale.remaining) > 0) {
        const c = await Customer.findByIdAndUpdate(
          sale.customer,
          { $inc: { currentBalance: sale.remaining } },
          { new: true, session },
        );
        await Ledger.create(
          [
            {
              partyType: 'customer',
              party: c._id,
              partyModel: 'Customer',
              type: 'credit',
              amount: sale.remaining,
              description: `Invoice ${sale.invoiceNo}`,
              referenceType: 'sale',
              referenceId: sale._id,
              balanceAfter: c.currentBalance,
            },
          ],
          { session },
        );
      }
      await audit(session, req.user, 'SALE_CONFIRMED', 'Sale', sale._id, { invoiceNo: sale.invoiceNo });
    });
    res.json(sale);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}

async function createPaymentInternal(body, user, session) {
  const sum = (body.allocations || []).reduce((a, x) => a + n(x.amount), 0);
  if (sum > n(body.amount))
    throw Object.assign(new Error('Allocation exceeds payment'), {
      statusCode: 409,
      code: 'PAYMENT_ALLOCATION_EXCEEDS_AMOUNT',
    });
  const paymentNo = await nextSequence(
    body.direction === 'receipt' ? 'customer-receipt' : 'supplier-payment',
    body.direction === 'receipt' ? 'RCP' : 'PAY',
    { session },
  );
  const [p] = await Payment.create(
    [
      {
        ...body,
        paymentNo,
        allocatedAmount: sum,
        unallocatedAmount: n(body.amount) - sum,
        status: 'completed',
        createdBy: user._id,
      },
    ],
    { session },
  );
  for (const a of body.allocations || []) {
    if (a.documentType === 'sale') {
      const s = await Sale.findById(a.document).session(session);
      if (!s || n(a.amount) > n(s.remaining))
        throw Object.assign(new Error('Invalid sale allocation'), { statusCode: 409, code: 'SALE_ALLOCATION_INVALID' });
      s.payment = n(s.payment) + n(a.amount);
      s.remaining = Math.max(0, n(s.total) - n(s.payment));
      s.status = s.remaining <= 0 ? 'paid' : 'partial';
      await s.save({ session });
    } else {
      const pch = await Purchase.findById(a.document).session(session);
      if (!pch || n(a.amount) > n(pch.remaining))
        throw Object.assign(new Error('Invalid purchase allocation'), {
          statusCode: 409,
          code: 'PURCHASE_ALLOCATION_INVALID',
        });
      pch.payment = n(pch.payment) + n(a.amount);
      pch.remaining = Math.max(0, n(pch.total) - n(pch.payment));
      await pch.save({ session });
    }
  }
  const Model = body.partyType === 'customer' ? Customer : Supplier;
  const delta = body.direction === 'receipt' ? -n(body.amount) : -n(body.amount);
  const party = await Model.findByIdAndUpdate(body.party, { $inc: { currentBalance: delta } }, { new: true, session });
  await Ledger.create(
    [
      {
        partyType: body.partyType,
        party: body.party,
        partyModel: body.partyType === 'customer' ? 'Customer' : 'Supplier',
        type: 'debit',
        amount: body.amount,
        description: `Payment ${paymentNo}`,
        referenceType: 'payment',
        referenceId: p._id,
        balanceAfter: party?.currentBalance,
      },
    ],
    { session },
  );
  return p;
}
export async function createPayment(req, res) {
  const body = parse(paymentSchema, req.body);
  const existing = await idempotent(Payment, body.idempotencyKey);
  if (existing) return res.json(existing);
  const session = await mongoose.startSession();
  try {
    let p;
    await session.withTransaction(async () => {
      p = await createPaymentInternal(body, req.user, session);
      await audit(session, req.user, 'PAYMENT_CREATED', 'Payment', p._id, { paymentNo: p.paymentNo });
    });
    res.status(201).json(p);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function reversePayment(req, res) {
  const session = await mongoose.startSession();
  try {
    let p;
    await session.withTransaction(async () => {
      p = await Payment.findById(req.params.id).session(session);
      if (!p || p.status === 'reversed') throw new Error('Payment cannot be reversed');
      for (const a of p.allocations) {
        const M = a.documentType === 'sale' ? Sale : Purchase;
        const doc = await M.findById(a.document).session(session);
        if (doc) {
          doc.payment = Math.max(0, n(doc.payment) - n(a.amount));
          doc.remaining = Math.max(0, n(doc.total) - n(doc.payment));
          if (a.documentType === 'sale')
            doc.status = doc.remaining <= 0 ? 'paid' : doc.payment > 0 ? 'partial' : 'confirmed';
          await doc.save({ session });
        }
      }
      const Model = p.partyType === 'customer' ? Customer : Supplier;
      const party = await Model.findByIdAndUpdate(
        p.party,
        { $inc: { currentBalance: n(p.amount) } },
        { new: true, session },
      );
      await Ledger.create(
        [
          {
            partyType: p.partyType,
            party: p.party,
            partyModel: p.partyType === 'customer' ? 'Customer' : 'Supplier',
            type: 'credit',
            amount: p.amount,
            description: `Reversal ${p.paymentNo}`,
            referenceType: 'payment-reversal',
            referenceId: p._id,
            balanceAfter: party?.currentBalance,
          },
        ],
        { session },
      );
      p.status = 'reversed';
      p.reversedBy = req.user._id;
      p.reversedAt = new Date();
      p.reversalReason = req.body.reason;
      await p.save({ session });
      await audit(session, req.user, 'PAYMENT_REVERSED', 'Payment', p._id, { reason: req.body.reason });
    });
    res.json(p);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}

export async function cancelSale(req, res) {
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale || sale.status === 'cancelled') throw new Error('Invalid sale');
      await ensureWarehouse(req.user, sale.warehouse);
      for (const i of sale.items)
        await adjustStock(
          {
            productId: i.product,
            warehouseId: sale.warehouse,
            batchId: i.batch,
            quantity: n(i.baseQuantity || i.quantity),
            type: 'return',
            reason: `Cancel ${sale.invoiceNo}`,
            createdBy: req.user._id,
          },
          { session },
        );
      const payments = await Payment.find({
        allocations: { $elemMatch: { document: sale._id } },
        status: { $ne: 'reversed' },
      }).session(session);
      if (payments.length)
        throw Object.assign(new Error('Reverse allocated payments before cancellation'), {
          statusCode: 409,
          code: 'SALE_HAS_ACTIVE_PAYMENTS',
        });
      if (n(sale.remaining) > 0) {
        const c = await Customer.findByIdAndUpdate(
          sale.customer,
          { $inc: { currentBalance: -n(sale.remaining) } },
          { new: true, session },
        );
        await Ledger.create(
          [
            {
              partyType: 'customer',
              party: sale.customer,
              partyModel: 'Customer',
              type: 'debit',
              amount: sale.remaining,
              description: `Reversal ${sale.invoiceNo}`,
              referenceType: 'sale-cancellation',
              referenceId: sale._id,
              balanceAfter: c.currentBalance,
            },
          ],
          { session },
        );
      }
      sale.status = 'cancelled';
      sale.cancelledAt = new Date();
      sale.cancelledBy = req.user._id;
      sale.cancellationReason = req.body.reason;
      sale.stateHistory.push({ state: 'cancelled', at: new Date(), by: req.user._id });
      await sale.save({ session });
      await audit(session, req.user, 'SALE_CANCELLED', 'Sale', sale._id, { reason: req.body.reason });
    });
    res.json(sale);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}

export async function createSaleReturn(req, res) {
  const body = parse(returnSchema, req.body);
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      const sale = await Sale.findById(body.sale).session(session);
      if (!sale || sale.status === 'cancelled') throw new Error('Sale not returnable');
      await ensureWarehouse(req.user, body.warehouse);
      const previous = await SaleReturn.find({ sale: sale._id, status: { $ne: 'cancelled' } })
        .session(session)
        .lean();
      const prev = new Map();
      for (const r of previous)
        for (const i of r.items)
          prev.set(
            String(i.product) + ':' + String(i.batch || ''),
            (prev.get(String(i.product) + ':' + String(i.batch || '')) || 0) + n(i.quantity),
          );
      const items = [];
      for (const x of body.items) {
        const sold = sale.items.find(
          (i) => String(i.product) === String(x.product) && String(i.batch || '') === String(x.batch || ''),
        );
        if (!sold)
          throw Object.assign(new Error('Returned item not on invoice'), {
            statusCode: 422,
            code: 'RETURN_ITEM_INVALID',
          });
        const key = String(x.product) + ':' + String(x.batch || '');
        if (n(x.quantity) + n(prev.get(key)) > n(sold.quantity))
          throw Object.assign(new Error('Return quantity exceeds remaining sold quantity'), {
            statusCode: 409,
            code: 'RETURN_QUANTITY_EXCEEDED',
          });
        const amount = n(x.quantity) * n(x.rate || sold.rate);
        items.push({ ...x, rate: n(x.rate || sold.rate), amount });
        if (x.disposition !== 'damage' && x.disposition !== 'expiry')
          await adjustStock(
            {
              productId: x.product,
              warehouseId: body.warehouse,
              batchId: x.batch,
              quantity: n(x.quantity),
              type: 'return',
              reason: body.reason,
              createdBy: req.user._id,
            },
            { session },
          );
      }
      const gross = items.reduce((a, i) => a + i.amount, 0),
        ratio = n(sale.subtotal) ? gross / n(sale.subtotal) : 0,
        total = Math.max(0, gross - n(sale.discount) * ratio + n(sale.tax) * ratio);
      const returnNo = await nextSequence('sale-return', 'SR', { session });
      [ret] = await SaleReturn.create(
        [{ ...body, returnNo, customer: sale.customer, items, total, status: 'completed', createdBy: req.user._id }],
        { session },
      );
      const c = await Customer.findByIdAndUpdate(
        sale.customer,
        { $inc: { currentBalance: -total } },
        { new: true, session },
      );
      await Ledger.create(
        [
          {
            partyType: 'customer',
            party: sale.customer,
            partyModel: 'Customer',
            type: 'debit',
            amount: total,
            description: `Credit for ${returnNo}`,
            referenceType: 'sale-return',
            referenceId: ret._id,
            balanceAfter: c.currentBalance,
          },
        ],
        { session },
      );
      const [note] = await CreditNote.create(
        [
          {
            noteNo: await nextSequence('customer-credit-note', 'CN', { session }),
            type: 'customer-credit',
            partyType: 'customer',
            party: sale.customer,
            referenceType: 'sale-return',
            referenceId: ret._id,
            amount: total,
            reason: body.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      ret.creditNote = note._id;
      await ret.save({ session });
      await audit(session, req.user, 'SALE_RETURN_CREATED', 'SaleReturn', ret._id, { returnNo, total });
    });
    res.status(201).json(ret);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}

export async function createPurchase(req, res) {
  const body = parse(purchaseSchema, req.body);
  await ensureWarehouse(req.user, body.warehouse);
  const existing = await idempotent(Purchase, body.idempotencyKey);
  if (existing) return res.json(existing);
  if (body.supplierInvoiceNo) {
    const dup = await Purchase.findOne({
      supplier: body.supplier,
      supplierInvoiceNo: body.supplierInvoiceNo,
      status: { $ne: 'cancelled' },
    });
    if (dup) return res.status(409).json({ message: 'Duplicate supplier invoice', code: 'SUPPLIER_INVOICE_DUPLICATE' });
  }
  const session = await mongoose.startSession();
  try {
    let purchase;
    await session.withTransaction(async () => {
      const items = await hydrateLines(body.items, { session }),
        calc = totals(body, items);
      if (calc.payment > calc.total) throw new Error('Payment exceeds purchase total');
      const purchaseNo = await nextSequence('purchase', 'PUR', { session });
      [purchase] = await Purchase.create(
        [
          {
            ...body,
            ...calc,
            purchaseNo,
            items: items.map(({ _productDoc, ...x }) => x),
            idempotencyKey: body.idempotencyKey,
            stateHistory: [{ state: body.status, at: new Date(), by: req.user._id }],
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      if (body.status === 'received') {
        for (const i of items) {
          let batch = i.batch;
          if (!batch && i.batchNo) {
            const [b] = await ProductBatch.create(
              [
                {
                  product: i.product,
                  warehouse: body.warehouse,
                  batchNo: i.batchNo,
                  expiryDate: i.expiryDate,
                  purchasePrice: i.rate,
                  quantity: 0,
                },
              ],
              { session },
            );
            batch = b._id;
          }
          if (batch) {
            const b = await ProductBatch.findById(batch).session(session);
            if (!b || String(b.product) !== String(i.product) || String(b.warehouse || '') !== String(body.warehouse))
              throw Object.assign(new Error('Invalid purchase batch'), {
                statusCode: 422,
                code: 'PURCHASE_BATCH_INVALID',
              });
          }
          await adjustStock(
            {
              productId: i.product,
              warehouseId: body.warehouse,
              batchId: batch,
              quantity: i.baseQuantity,
              type: 'stock-in',
              reason: `Purchase ${purchaseNo}`,
              unitCost: i.rate,
              createdBy: req.user._id,
            },
            { session },
          );
        }
        if (calc.remaining > 0) {
          const s = await Supplier.findByIdAndUpdate(
            body.supplier,
            { $inc: { currentBalance: calc.remaining } },
            { new: true, session },
          );
          await Ledger.create(
            [
              {
                partyType: 'supplier',
                party: s._id,
                partyModel: 'Supplier',
                type: 'credit',
                amount: calc.remaining,
                description: `Purchase ${purchaseNo}`,
                referenceType: 'purchase',
                referenceId: purchase._id,
                balanceAfter: s.currentBalance,
              },
            ],
            { session },
          );
        }
        if (calc.payment > 0)
          await createPaymentInternal(
            {
              direction: 'payment',
              partyType: 'supplier',
              party: body.supplier,
              amount: calc.payment,
              method: body.paymentMethod || 'cash',
              allocations: [{ documentType: 'purchase', document: purchase._id, amount: calc.payment }],
            },
            req.user,
            session,
          );
        await GoodsReceipt.create(
          [
            {
              grnNo: await nextSequence('goods-receipt', 'GRN', { session }),
              purchase: purchase._id,
              supplier: body.supplier,
              warehouse: body.warehouse,
              items: purchase.items,
              receivedBy: req.user._id,
            },
          ],
          { session },
        );
      }
      await audit(session, req.user, 'PURCHASE_CREATED', 'Purchase', purchase._id, { purchaseNo, status: body.status });
    });
    res.status(201).json(purchase);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function cancelPurchase(req, res) {
  const session = await mongoose.startSession();
  try {
    let p;
    await session.withTransaction(async () => {
      p = await Purchase.findById(req.params.id).session(session);
      if (!p || p.status === 'cancelled') throw new Error('Invalid purchase');
      await ensureWarehouse(req.user, p.warehouse);
      const pays = await Payment.find({
        allocations: { $elemMatch: { document: p._id } },
        status: { $ne: 'reversed' },
      }).session(session);
      if (pays.length)
        throw Object.assign(new Error('Reverse allocated supplier payments first'), {
          statusCode: 409,
          code: 'PURCHASE_HAS_ACTIVE_PAYMENTS',
        });
      if (p.status === 'received')
        for (const i of p.items)
          await adjustStock(
            {
              productId: i.product,
              warehouseId: p.warehouse,
              batchId: i.batch,
              quantity: -n(i.baseQuantity || i.quantity),
              type: 'return',
              reason: `Cancel ${p.purchaseNo}`,
              createdBy: req.user._id,
            },
            { session },
          );
      if (n(p.remaining) > 0) {
        const s = await Supplier.findByIdAndUpdate(
          p.supplier,
          { $inc: { currentBalance: -n(p.remaining) } },
          { new: true, session },
        );
        await Ledger.create(
          [
            {
              partyType: 'supplier',
              party: p.supplier,
              partyModel: 'Supplier',
              type: 'debit',
              amount: p.remaining,
              description: `Reversal ${p.purchaseNo}`,
              referenceType: 'purchase-cancellation',
              referenceId: p._id,
              balanceAfter: s.currentBalance,
            },
          ],
          { session },
        );
      }
      p.status = 'cancelled';
      p.cancelledAt = new Date();
      p.cancelledBy = req.user._id;
      p.cancellationReason = req.body.reason;
      await p.save({ session });
      await audit(session, req.user, 'PURCHASE_CANCELLED', 'Purchase', p._id, { reason: req.body.reason });
    });
    res.json(p);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function createPurchaseReturn(req, res) {
  const body = parse(returnSchema, req.body);
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      const p = await Purchase.findById(body.purchase).session(session);
      if (!p || p.status !== 'received') throw new Error('Purchase not returnable');
      await ensureWarehouse(req.user, body.warehouse);
      const previous = await PurchaseReturn.find({ purchase: p._id, status: { $ne: 'cancelled' } })
          .session(session)
          .lean(),
        prev = new Map();
      for (const r of previous)
        for (const i of r.items)
          prev.set(
            String(i.product) + ':' + String(i.batch || ''),
            (prev.get(String(i.product) + ':' + String(i.batch || '')) || 0) + n(i.quantity),
          );
      const items = [];
      for (const x of body.items) {
        const bought = p.items.find(
          (i) => String(i.product) === String(x.product) && String(i.batch || '') === String(x.batch || ''),
        );
        if (!bought) throw new Error('Return item not on purchase');
        const key = String(x.product) + ':' + String(x.batch || '');
        if (n(x.quantity) + n(prev.get(key)) > n(bought.quantity))
          throw Object.assign(new Error('Return quantity exceeded'), {
            statusCode: 409,
            code: 'PURCHASE_RETURN_QUANTITY_EXCEEDED',
          });
        const baseQuantity = n(x.quantity) * (n(bought.baseQuantity || bought.quantity) / n(bought.quantity));
        items.push({
          ...x,
          baseQuantity,
          rate: n(x.rate || bought.rate),
          amount: n(x.quantity) * n(x.rate || bought.rate),
        });
        await adjustStock(
          {
            productId: x.product,
            warehouseId: body.warehouse,
            batchId: x.batch,
            quantity: -baseQuantity,
            type: 'return',
            reason: body.reason,
            createdBy: req.user._id,
          },
          { session },
        );
      }
      const total = items.reduce((a, i) => a + i.amount, 0),
        returnNo = await nextSequence('purchase-return', 'PR', { session });
      [ret] = await PurchaseReturn.create(
        [{ ...body, returnNo, supplier: p.supplier, items, total, subtotal: total, createdBy: req.user._id }],
        { session },
      );
      const s = await Supplier.findByIdAndUpdate(
        p.supplier,
        { $inc: { currentBalance: -total } },
        { new: true, session },
      );
      await Ledger.create(
        [
          {
            partyType: 'supplier',
            party: p.supplier,
            partyModel: 'Supplier',
            type: 'debit',
            amount: total,
            description: `Debit note ${returnNo}`,
            referenceType: 'purchase-return',
            referenceId: ret._id,
            balanceAfter: s.currentBalance,
          },
        ],
        { session },
      );
      const [note] = await CreditNote.create(
        [
          {
            noteNo: await nextSequence('supplier-debit-note', 'DN', { session }),
            type: 'supplier-debit',
            partyType: 'supplier',
            party: p.supplier,
            referenceType: 'purchase-return',
            referenceId: ret._id,
            amount: total,
            reason: body.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      ret.debitNote = note._id;
      await ret.save({ session });
      await audit(session, req.user, 'PURCHASE_RETURN_CREATED', 'PurchaseReturn', ret._id, { returnNo, total });
    });
    res.status(201).json(ret);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}

export async function createPurchaseOrder(req, res) {
  const body = parse(purchaseSchema, { ...req.body, payment: 0, status: 'draft' });
  const items = await hydrateLines(body.items),
    calc = totals(body, items);
  res.status(201).json(
    await PurchaseOrder.create({
      ...body,
      ...calc,
      expectedDate: req.body.expectedDate,
      orderNo: await nextSequence('purchase-order', 'PO'),
      items: items.map(({ _productDoc, ...x }) => x),
      createdBy: req.user._id,
    }),
  );
}
export async function timeline(req, res) {
  const type = req.params.type,
    id = req.params.id;
  const entity = type === 'sale' ? 'Sale' : 'Purchase';
  const [audits, payments, returns] = await Promise.all([
    AuditLog.find({ entity, entityId: id }).sort({ createdAt: 1 }),
    Payment.find({ 'allocations.document': id }).sort({ createdAt: 1 }),
    type === 'sale'
      ? SaleReturn.find({ sale: id }).sort({ createdAt: 1 })
      : PurchaseReturn.find({ purchase: id }).sort({ createdAt: 1 }),
  ]);
  res.json({ audits, payments, returns });
}
export async function documentPdf(req, res) {
  const Model = req.params.type === 'sale' ? Sale : Purchase;
  const doc = await Model.findById(req.params.id).populate(req.params.type === 'sale' ? 'customer' : 'supplier');
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  res.type('application/pdf');
  const pdf = new PDFDocument({ margin: 40 });
  pdf.pipe(res);
  pdf.fontSize(20).text(`${req.params.type === 'sale' ? 'Invoice' : 'Purchase'} ${doc.invoiceNo || doc.purchaseNo}`);
  pdf.moveDown();
  for (const i of doc.items || [])
    pdf.fontSize(10).text(`${i.name || i.product}  ${i.quantity} ${i.unit || ''} × ${i.rate} = ${i.amount}`);
  pdf
    .moveDown()
    .fontSize(13)
    .text(`Total: PKR ${n(doc.total).toLocaleString()}`);
  pdf.text(`Paid: PKR ${n(doc.payment).toLocaleString()}`);
  pdf.text(`Remaining: PKR ${n(doc.remaining).toLocaleString()}`);
  pdf.end();
}

export async function hardenExpenseCreate(req, res) {
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      const amount = n(req.body.amount),
        taxRate = n(req.body.taxRate),
        taxAmount = (amount * taxRate) / 100;
      if (amount <= 0) throw new Error('Expense amount required');
      const expenseNo = await nextSequence('expense', 'EXP', { session });
      [doc] = await Expense.create(
        [
          {
            ...req.body,
            expenseNo,
            amount,
            taxRate,
            taxAmount,
            totalAmount: amount + taxAmount,
            status: req.body.status || 'pending',
            isDeleted: false,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      await audit(session, req.user, 'EXPENSE_CREATED', 'Expense', doc._id, { expenseNo });
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function approveExpense(req, res) {
  const doc = await Expense.findById(req.params.id);
  if (!doc || doc.isDeleted) return res.status(404).json({ message: 'Expense not found' });
  if (doc.status === 'paid') return res.status(409).json({ message: 'Paid expense cannot be changed' });
  doc.status = req.body.status || 'approved';
  doc.rejectionReason = req.body.rejectionReason;
  doc.approvedBy = req.user._id;
  doc.approvedAt = new Date();
  await doc.save();
  res.json(doc);
}
export async function payExpense(req, res) {
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      doc = await Expense.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'approved') throw new Error('Only approved expense can be paid');
      doc.status = 'paid';
      doc.paidAt = new Date();
      doc.paidBy = req.user._id;
      doc.account = req.body.account;
      await doc.save({ session });
      await audit(session, req.user, 'EXPENSE_PAID', 'Expense', doc._id, { account: req.body.account });
    });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  } finally {
    await session.endSession();
  }
}
export async function deleteExpense(req, res) {
  const doc = await Expense.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Expense not found' });
  if (doc.status === 'paid') return res.status(409).json({ message: 'Paid expense must be reversed first' });
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  doc.deletedBy = req.user._id;
  await doc.save();
  res.json({ success: true });
}
export async function restoreExpense(req, res) {
  const doc = await Expense.findByIdAndUpdate(
    req.params.id,
    { isDeleted: false, $unset: { deletedAt: 1, deletedBy: 1 } },
    { new: true },
  );
  res.json(doc);
}
