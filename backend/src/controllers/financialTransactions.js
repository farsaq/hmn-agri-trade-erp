import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { Sale, Purchase, Customer, Supplier, Ledger, Expense, AuditLog, Product } from '../models/index.js';
import { Warehouse } from '../models/enterprise.js';
import { WarehouseStock, ProductBatch, SaleReturn } from '../models/operations.js';
import { Payment, PurchaseReturn, CreditNote, PurchaseOrder, GoodsReceipt } from '../models/transactions.js';
import { adjustStock } from '../services/inventoryService.js';
import { nextSequence, hydrateLines, totals, n } from '../services/transactionService.js';
import {
  saleSchema,
  purchaseSchema,
  paymentSchema,
  returnSchema,
  expenseSchema,
  expenseApprovalSchema,
  parse,
} from '../validators/transactions.js';
import {
  assertTransition,
  saleTransitions,
  purchaseTransitions,
  validatePaymentDocuments,
  postAccount,
} from '../services/financialDomain.js';
import { autoPost } from '../services/postingEngine.js';

const isAdmin = (u) => ['admin', 'manager'].includes(u?.role);
const error = (message, code, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
async function audit(session, user, action, entity, entityId, metadata = {}) {
  await AuditLog.create([{ user: user._id, action, entity, entityId, metadata }], { session });
}
async function ensureWarehouse(user, id) {
  if (isAdmin(user)) return;
  const wh = await Warehouse.findById(id).lean();
  const assignment = (wh?.assignedUsers || []).find((x) => String(x.user || x) === String(user._id));
  if (!assignment) throw error('Warehouse access denied', 'WAREHOUSE_ACCESS_DENIED', 403);
}
async function batchContext({ batch, product, warehouse, session, saleable = true }) {
  if (!batch) return null;
  const b = await ProductBatch.findById(batch).session(session);
  if (!b || String(b.product) !== String(product) || String(b.warehouse || '') !== String(warehouse))
    throw error('Batch does not belong to product and warehouse', 'BATCH_CONTEXT_INVALID', 422);
  if (
    saleable &&
    (['quarantined', 'expired', 'depleted'].includes(b.status) || (b.expiryDate && b.expiryDate < new Date()))
  )
    throw error('Batch is not saleable', 'BATCH_NOT_SALEABLE', 409);
  return b;
}
async function reserveLine(line, warehouse, session, delta) {
  const query = { product: line.product, warehouse, batch: line.batch || null };
  if (delta > 0) query.$expr = { $gte: [{ $subtract: ['$quantity', '$reserved'] }, delta] };
  const row = await WarehouseStock.findOneAndUpdate(query, { $inc: { reserved: delta } }, { new: true, session });
  if (!row) throw error('Insufficient stock for reservation', 'STOCK_RESERVATION_FAILED', 409);
}
async function releaseReservations(sale, session) {
  for (const i of sale.items)
    await WarehouseStock.updateOne(
      { product: i.product, warehouse: sale.warehouse, batch: i.batch || null },
      { $inc: { reserved: -n(i.baseQuantity) } },
      { session },
    );
}
async function postReceivable(sale, session) {
  const c = await Customer.findByIdAndUpdate(
    sale.customer,
    { $inc: { currentBalance: n(sale.total) } },
    { new: true, session },
  );
  if (!c) throw error('Customer not found', 'CUSTOMER_NOT_FOUND', 404);
  if (n(c.creditLimit) > 0 && n(c.currentBalance) > n(c.creditLimit))
    throw error('Customer credit limit exceeded', 'CUSTOMER_CREDIT_LIMIT_EXCEEDED', 409);
  await Ledger.create(
    [
      {
        partyType: 'customer',
        party: c._id,
        partyModel: 'Customer',
        type: 'credit',
        amount: sale.total,
        description: `Invoice ${sale.invoiceNo}`,
        referenceType: 'sale',
        referenceId: sale._id,
        balanceAfter: c.currentBalance,
      },
    ],
    { session },
  );
  await autoPost('sale', sale, { session, userId: sale.createdBy });
}
async function postPayable(purchase, session) {
  const s = await Supplier.findByIdAndUpdate(
    purchase.supplier,
    { $inc: { currentBalance: n(purchase.total) } },
    { new: true, session },
  );
  if (!s) throw error('Supplier not found', 'SUPPLIER_NOT_FOUND', 404);
  await Ledger.create(
    [
      {
        partyType: 'supplier',
        party: s._id,
        partyModel: 'Supplier',
        type: 'credit',
        amount: purchase.total,
        description: `Purchase ${purchase.purchaseNo}`,
        referenceType: 'purchase',
        referenceId: purchase._id,
        balanceAfter: s.currentBalance,
      },
    ],
    { session },
  );
  await autoPost('purchase', purchase, { session, userId: purchase.createdBy });
}
async function postPayment(body, user, session) {
  await validatePaymentDocuments(body, session);
  const allocated = (body.allocations || []).reduce((a, x) => a + n(x.amount), 0);
  if (allocated > n(body.amount))
    throw error('Allocation exceeds payment amount', 'PAYMENT_ALLOCATION_EXCEEDS_AMOUNT', 409);
  const paymentNo = await nextSequence(
    body.direction === 'receipt' ? 'customer-receipt' : 'supplier-payment',
    body.direction === 'receipt' ? 'RCP' : 'PAY',
    { session },
  );
  const [payment] = await Payment.create(
    [
      {
        ...body,
        paymentNo,
        allocatedAmount: allocated,
        unallocatedAmount: n(body.amount) - allocated,
        status: 'completed',
        statusHistory: [{ status: 'completed', at: new Date(), by: user._id }],
        createdBy: user._id,
      },
    ],
    { session },
  );
  for (const a of body.allocations || []) {
    const Model = a.documentType === 'sale' ? Sale : Purchase;
    const doc = await Model.findById(a.document).session(session);
    doc.payment = n(doc.payment) + n(a.amount);
    doc.remaining = Math.max(0, n(doc.total) - n(doc.payment));
    if (a.documentType === 'sale') doc.status = doc.remaining === 0 ? 'paid' : 'partial';
    await doc.save({ session });
  }
  const Party = body.partyType === 'customer' ? Customer : Supplier;
  const party = await Party.findByIdAndUpdate(
    body.party,
    { $inc: { currentBalance: -n(body.amount) } },
    { new: true, session },
  );
  if (!party) throw error('Payment party not found', 'PAYMENT_PARTY_NOT_FOUND', 404);
  const [ledger] = await Ledger.create(
    [
      {
        partyType: body.partyType,
        party: body.party,
        partyModel: body.partyType === 'customer' ? 'Customer' : 'Supplier',
        type: 'debit',
        amount: body.amount,
        description: `Payment ${paymentNo}`,
        referenceType: 'payment',
        referenceId: payment._id,
        balanceAfter: party.currentBalance,
      },
    ],
    { session },
  );
  const accountEntry = await postAccount(
    {
      accountId: body.account,
      type: body.direction === 'receipt' ? 'debit' : 'credit',
      amount: body.amount,
      description: `Payment ${paymentNo}`,
      referenceType: 'payment',
      referenceId: payment._id,
      userId: user._id,
    },
    session,
  );
  payment.ledgerEntry = ledger._id;
  if (accountEntry) payment.accountEntry = accountEntry._id;
  await payment.save({ session });
  await autoPost(body.direction === 'receipt' ? 'customer-receipt' : 'supplier-payment', payment, {
    session,
    userId: user._id,
  });
  return payment;
}

export async function createSale(req, res) {
  let body;
  try {
    body = parse(saleSchema, req.body);
    await ensureWarehouse(req.user, body.warehouse);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const old = body.idempotencyKey ? await Sale.findOne({ idempotencyKey: body.idempotencyKey }) : null;
  if (old) return res.json(old);
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      const items = await hydrateLines(body.items, { session }),
        calc = totals(body, items);
      if (calc.payment > calc.total) throw error('Payment exceeds invoice total', 'SALE_OVERPAYMENT', 409);
      const invoiceNo = await nextSequence('sale-invoice', 'INV', { session });
      for (const i of items) {
        await batchContext({ batch: i.batch, product: i.product, warehouse: body.warehouse, session });
        if (body.status === 'draft') await reserveLine(i, body.warehouse, session, i.baseQuantity);
        else
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
      const initialPayment = body.status === 'draft' ? 0 : n(calc.payment);
      [sale] = await Sale.create(
        [
          {
            ...body,
            ...calc,
            payment: 0,
            remaining: calc.total,
            invoiceNo,
            status: body.status === 'draft' ? 'draft' : 'confirmed',
            deliveryStatus: body.status === 'draft' ? 'unfulfilled' : 'fulfilled',
            fulfilledAt: body.status === 'draft' ? undefined : new Date(),
            items: items.map(({ productDoc: _productDoc, ...x }) => x),
            idempotencyKey: body.idempotencyKey,
            stateHistory: [
              { state: body.status === 'draft' ? 'draft' : 'confirmed', at: new Date(), by: req.user._id },
            ],
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      if (body.status !== 'draft') {
        await postReceivable(sale, session);
        if (initialPayment > 0)
          await postPayment(
            {
              direction: 'receipt',
              partyType: 'customer',
              party: body.customer,
              amount: initialPayment,
              method: body.paymentMethod || 'cash',
              account: body.account,
              allocations: [{ documentType: 'sale', document: sale._id, amount: initialPayment }],
            },
            req.user,
            session,
          );
        sale = await Sale.findById(sale._id).session(session);
      }
      await audit(session, req.user, 'SALE_CREATED', 'Sale', sale._id, { invoiceNo, status: sale.status });
    });
    res.status(201).json(sale);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code, details: e.details });
  } finally {
    await session.endSession();
  }
}
export async function confirmSale(req, res) {
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale) throw error('Sale not found', 'SALE_NOT_FOUND', 404);
      assertTransition(saleTransitions, sale.status, 'confirmed', 'SALE_STATE_INVALID');
      await ensureWarehouse(req.user, sale.warehouse);
      for (const i of sale.items) {
        await batchContext({ batch: i.batch, product: i.product, warehouse: sale.warehouse, session });
        await WarehouseStock.updateOne(
          { product: i.product, warehouse: sale.warehouse, batch: i.batch || null },
          { $inc: { reserved: -n(i.baseQuantity) } },
          { session },
        );
        await adjustStock(
          {
            productId: i.product,
            warehouseId: sale.warehouse,
            batchId: i.batch,
            quantity: -n(i.baseQuantity),
            type: 'stock-out',
            reason: `Sale ${sale.invoiceNo}`,
            createdBy: req.user._id,
          },
          { session },
        );
      }
      sale.status = 'confirmed';
      sale.deliveryStatus = 'fulfilled';
      sale.fulfilledAt = new Date();
      sale.stateHistory.push({ state: 'confirmed', at: new Date(), by: req.user._id });
      await sale.save({ session });
      await postReceivable(sale, session);
      await audit(session, req.user, 'SALE_CONFIRMED', 'Sale', sale._id, { invoiceNo: sale.invoiceNo });
    });
    res.json(sale);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function fulfilSale(req, res) {
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale) throw error('Sale not found', 'SALE_NOT_FOUND', 404);
      if (!['confirmed', 'partial'].includes(sale.status))
        throw error('Sale is not fulfilable', 'SALE_STATE_INVALID', 409);
      sale.deliveryStatus = 'fulfilled';
      sale.fulfilledAt = new Date();
      sale.stateHistory.push({ state: 'fulfilled', at: new Date(), by: req.user._id });
      await sale.save({ session });
      await audit(session, req.user, 'SALE_FULFILLED', 'Sale', sale._id);
    });
    res.json(sale);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
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
      if (!sale || sale.status === 'cancelled') throw error('Sale cannot be cancelled', 'SALE_STATE_INVALID', 409);
      await ensureWarehouse(req.user, sale.warehouse);
      const active = await Payment.exists({
        'allocations.document': sale._id,
        status: { $nin: ['reversed', 'cancelled'] },
      }).session(session);
      if (active) throw error('Reverse allocated payments before cancellation', 'SALE_HAS_ACTIVE_PAYMENTS', 409);
      if (sale.status === 'draft') await releaseReservations(sale, session);
      else {
        for (const i of sale.items)
          await adjustStock(
            {
              productId: i.product,
              warehouseId: sale.warehouse,
              batchId: i.batch,
              quantity: n(i.baseQuantity),
              type: 'return',
              reason: `Cancel ${sale.invoiceNo}`,
              createdBy: req.user._id,
            },
            { session },
          );
        const c = await Customer.findByIdAndUpdate(
          sale.customer,
          { $inc: { currentBalance: -n(sale.total) } },
          { new: true, session },
        );
        await Ledger.create(
          [
            {
              partyType: 'customer',
              party: sale.customer,
              partyModel: 'Customer',
              type: 'debit',
              amount: sale.total,
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
      sale.deliveryStatus = 'cancelled';
      sale.cancelledAt = new Date();
      sale.cancelledBy = req.user._id;
      sale.cancellationReason = req.body.reason;
      sale.stateHistory.push({ state: 'cancelled', at: new Date(), by: req.user._id, reason: req.body.reason });
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

export async function createPayment(req, res) {
  let body;
  try {
    body = parse(paymentSchema, req.body);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const old = body.idempotencyKey ? await Payment.findOne({ idempotencyKey: body.idempotencyKey }) : null;
  if (old) return res.json(old);
  const session = await mongoose.startSession();
  try {
    let p;
    await session.withTransaction(async () => {
      p = await postPayment(body, req.user, session);
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
      p = await Payment.findOneAndUpdate(
        { _id: req.params.id, status: { $nin: ['reversed', 'cancelled', 'reversal-processing'] } },
        { $set: { status: 'reversal-processing' } },
        { new: true, session },
      );
      if (!p) throw error('Payment already reversed or unavailable', 'PAYMENT_REVERSAL_CONFLICT', 409);
      if (p.method === 'cheque' && p.chequeStatus === 'cleared' && !isAdmin(req.user))
        throw error('Cleared cheque reversal requires admin', 'CLEARED_CHEQUE_REVERSAL_RESTRICTED', 403);
      for (const a of p.allocations) {
        const Model = a.documentType === 'sale' ? Sale : Purchase;
        const doc = await Model.findById(a.document).session(session);
        if (doc) {
          doc.payment = Math.max(0, n(doc.payment) - n(a.amount));
          doc.remaining = Math.max(0, n(doc.total) - n(doc.payment));
          if (a.documentType === 'sale')
            doc.status = doc.remaining === 0 ? 'paid' : doc.payment > 0 ? 'partial' : 'confirmed';
          await doc.save({ session });
        }
      }
      const Party = p.partyType === 'customer' ? Customer : Supplier;
      const party = await Party.findByIdAndUpdate(
        p.party,
        { $inc: { currentBalance: n(p.amount) } },
        { new: true, session },
      );
      const [ledger] = await Ledger.create(
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
            balanceAfter: party.currentBalance,
          },
        ],
        { session },
      );
      let accountEntry = null;
      if (p.account)
        accountEntry = await postAccount(
          {
            accountId: p.account,
            type: p.direction === 'receipt' ? 'credit' : 'debit',
            amount: p.amount,
            description: `Reversal ${p.paymentNo}`,
            referenceType: 'payment-reversal',
            referenceId: p._id,
            userId: req.user._id,
            reversalOf: p.accountEntry,
          },
          session,
        );
      p.status = 'reversed';
      p.reversedBy = req.user._id;
      p.reversedAt = new Date();
      p.reversalReason = req.body.reason;
      p.reversalLedgerEntry = ledger._id;
      if (accountEntry) p.reversalAccountEntry = accountEntry._id;
      p.statusHistory.push({ status: 'reversed', at: new Date(), by: req.user._id, reason: req.body.reason });
      await p.save({ session });
      await audit(session, req.user, 'PAYMENT_REVERSED', 'Payment', p._id, { reason: req.body.reason });
    });
    res.json(p);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function listPayments(req, res) {
  const page = Math.max(1, n(req.query.page) || 1),
    limit = Math.min(100, Math.max(1, n(req.query.limit) || 20)),
    filter = {};
  for (const k of ['direction', 'partyType', 'status', 'method', 'chequeStatus'])
    if (req.query[k]) filter[k] = req.query[k];
  if (req.query.party) filter.party = req.query.party;
  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
export async function paymentDetail(req, res) {
  const p = await Payment.findById(req.params.id).populate('account party createdBy');
  if (!p) return res.status(404).json({ message: 'Payment not found' });
  res.json(p);
}
export async function updateChequeStatus(req, res) {
  const allowed = {
    issued: ['deposited', 'cancelled'],
    deposited: ['pending', 'cleared', 'bounced'],
    pending: ['cleared', 'bounced'],
    bounced: ['cancelled'],
    none: ['issued'],
  };
  const p = await Payment.findById(req.params.id);
  if (!p || p.method !== 'cheque') return res.status(404).json({ message: 'Cheque payment not found' });
  if (!(allowed[p.chequeStatus] || []).includes(req.body.status))
    return res.status(409).json({ message: 'Invalid cheque transition', code: 'CHEQUE_STATE_INVALID' });
  p.chequeStatus = req.body.status;
  p.statusHistory.push({
    status: `cheque:${req.body.status}`,
    at: new Date(),
    by: req.user._id,
    reason: req.body.reason,
  });
  await p.save();
  res.json(p);
}

async function receivePurchaseInternal(purchase, user, session, receiptItems) {
  await ensureWarehouse(user, purchase.warehouse);
  const inputs =
    receiptItems ||
    purchase.items.map((i) => ({
      ...i,
      receivedQuantity: i.quantity,
      acceptedQuantity: i.quantity,
      rejectedQuantity: 0,
    }));
  const grnItems = [];
  const baseSubtotal = purchase.items.reduce((a, i) => a + n(i.amount), 0);
  const landedExtras = n(purchase.transport) + n(purchase.expenses) + n(purchase.tax) - n(purchase.discount);
  for (const input of inputs) {
    const line = purchase.items.find(
      (i) => String(i.product) === String(input.product) && String(i.batch || '') === String(input.batch || ''),
    );
    if (!line) throw error('GRN item is not on purchase', 'GRN_ITEM_INVALID', 422);
    const accepted = n(input.acceptedQuantity ?? input.receivedQuantity),
      rejected = n(input.rejectedQuantity);
    if (accepted < 0 || rejected < 0 || accepted + rejected > n(input.receivedQuantity))
      throw error('Invalid accepted/rejected quantities', 'GRN_QUANTITY_INVALID', 422);
    const prior =
      (
        await GoodsReceipt.aggregate([
          { $match: { purchase: purchase._id, status: 'received' } },
          { $unwind: '$items' },
          { $match: { 'items.product': new mongoose.Types.ObjectId(input.product) } },
          { $group: { _id: null, q: { $sum: '$items.receivedQuantity' } } },
        ])
      )[0]?.q || 0;
    if (prior + n(input.receivedQuantity) > n(line.quantity))
      throw error('Received quantity exceeds ordered quantity', 'GRN_OVER_RECEIPT', 409);
    let batch = input.batch || line.batch;
    if (!batch && input.batchNo) {
      const [b] = await ProductBatch.create(
        [
          {
            product: line.product,
            warehouse: purchase.warehouse,
            batchNo: input.batchNo,
            expiryDate: input.expiryDate,
            purchasePrice: line.rate,
            quantity: 0,
          },
        ],
        { session },
      );
      batch = b._id;
    }
    if (batch)
      await batchContext({ batch, product: line.product, warehouse: purchase.warehouse, session, saleable: false });
    const baseRatio = n(line.baseQuantity) / n(line.quantity);
    const baseAccepted = accepted * baseRatio;
    const landedPerUnit =
      n(line.rate) +
      (baseSubtotal ? (landedExtras * (n(line.amount) / baseSubtotal)) / Math.max(n(line.quantity), 1) : 0);
    if (baseAccepted > 0)
      await adjustStock(
        {
          productId: line.product,
          warehouseId: purchase.warehouse,
          batchId: batch,
          quantity: baseAccepted,
          type: 'stock-in',
          reason: `Purchase ${purchase.purchaseNo}`,
          unitCost: landedPerUnit,
          createdBy: user._id,
        },
        { session },
      );
    grnItems.push({
      product: line.product,
      batch,
      orderedQuantity: line.quantity,
      receivedQuantity: n(input.receivedQuantity),
      acceptedQuantity: accepted,
      rejectedQuantity: rejected,
      rate: line.rate,
      expiryDate: input.expiryDate,
      batchNo: input.batchNo,
    });
  }
  const [grn] = await GoodsReceipt.create(
    [
      {
        grnNo: await nextSequence('goods-receipt', 'GRN', { session }),
        purchase: purchase._id,
        supplier: purchase.supplier,
        warehouse: purchase.warehouse,
        items: grnItems,
        inspectionNotes: receiptItems?.inspectionNotes,
        receivedBy: user._id,
        status: 'received',
      },
    ],
    { session },
  );
  return grn;
}
export async function createPurchase(req, res) {
  let body;
  try {
    body = parse(purchaseSchema, req.body);
    await ensureWarehouse(req.user, body.warehouse);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const old = body.idempotencyKey ? await Purchase.findOne({ idempotencyKey: body.idempotencyKey }) : null;
  if (old) return res.json(old);
  if (
    body.supplierInvoiceNo &&
    (await Purchase.exists({
      supplier: body.supplier,
      supplierInvoiceNo: body.supplierInvoiceNo,
      status: { $ne: 'cancelled' },
    }))
  )
    return res.status(409).json({ message: 'Duplicate supplier invoice', code: 'SUPPLIER_INVOICE_DUPLICATE' });
  const session = await mongoose.startSession();
  try {
    let purchase;
    await session.withTransaction(async () => {
      const items = await hydrateLines(body.items, { session }),
        calc = totals(body, items),
        purchaseNo = await nextSequence('purchase', 'PUR', { session }),
        initialPayment = body.status === 'received' ? n(calc.payment) : 0;
      [purchase] = await Purchase.create(
        [
          {
            ...body,
            ...calc,
            payment: 0,
            remaining: calc.total,
            purchaseNo,
            items: items.map(({ productDoc: _productDoc, ...x }) => x),
            status: body.status,
            idempotencyKey: body.idempotencyKey,
            stateHistory: [{ state: body.status, at: new Date(), by: req.user._id }],
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      if (body.status === 'received') {
        const grn = await receivePurchaseInternal(purchase, req.user, session);
        purchase.goodsReceipt = grn._id;
        purchase.receivedAt = new Date();
        purchase.receivedBy = req.user._id;
        purchase.landedCostTotal = calc.total;
        await postPayable(purchase, session);
        if (initialPayment > 0)
          await postPayment(
            {
              direction: 'payment',
              partyType: 'supplier',
              party: purchase.supplier,
              amount: initialPayment,
              method: body.paymentMethod || 'cash',
              account: body.account,
              allocations: [{ documentType: 'purchase', document: purchase._id, amount: initialPayment }],
            },
            req.user,
            session,
          );
        await purchase.save({ session });
        purchase = await Purchase.findById(purchase._id).session(session);
      }
      await audit(session, req.user, 'PURCHASE_CREATED', 'Purchase', purchase._id, {
        purchaseNo,
        status: purchase.status,
      });
    });
    res.status(201).json(purchase);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function confirmPurchase(req, res) {
  const session = await mongoose.startSession();
  try {
    let p;
    await session.withTransaction(async () => {
      p = await Purchase.findById(req.params.id).session(session);
      if (!p) throw error('Purchase not found', 'PURCHASE_NOT_FOUND', 404);
      assertTransition(purchaseTransitions, p.status, 'confirmed', 'PURCHASE_STATE_INVALID');
      await ensureWarehouse(req.user, p.warehouse);
      p.status = 'confirmed';
      p.confirmedAt = new Date();
      p.confirmedBy = req.user._id;
      p.stateHistory.push({ state: 'confirmed', at: new Date(), by: req.user._id });
      await p.save({ session });
      await audit(session, req.user, 'PURCHASE_CONFIRMED', 'Purchase', p._id);
    });
    res.json(p);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function receivePurchase(req, res) {
  const session = await mongoose.startSession();
  try {
    let p, grn;
    await session.withTransaction(async () => {
      p = await Purchase.findById(req.params.id).session(session);
      if (!p) throw error('Purchase not found', 'PURCHASE_NOT_FOUND', 404);
      if (!['confirmed'].includes(p.status))
        throw error('Only confirmed purchases can be received', 'PURCHASE_STATE_INVALID', 409);
      grn = await receivePurchaseInternal(p, req.user, session, req.body.items);
      p.status = 'received';
      p.receivedAt = new Date();
      p.receivedBy = req.user._id;
      p.goodsReceipt = grn._id;
      p.stateHistory.push({ state: 'received', at: new Date(), by: req.user._id });
      await p.save({ session });
      await postPayable(p, session);
      await audit(session, req.user, 'PURCHASE_RECEIVED', 'Purchase', p._id, { grnNo: grn.grnNo });
    });
    res.json({ purchase: p, goodsReceipt: grn });
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
      if (!p || p.status === 'cancelled') throw error('Purchase cannot be cancelled', 'PURCHASE_STATE_INVALID', 409);
      await ensureWarehouse(req.user, p.warehouse);
      if (
        await Payment.exists({ 'allocations.document': p._id, status: { $nin: ['reversed', 'cancelled'] } }).session(
          session,
        )
      )
        throw error('Reverse supplier payments first', 'PURCHASE_HAS_ACTIVE_PAYMENTS', 409);
      if (p.status === 'received') {
        for (const i of p.items)
          await adjustStock(
            {
              productId: i.product,
              warehouseId: p.warehouse,
              batchId: i.batch,
              quantity: -n(i.baseQuantity),
              type: 'return',
              reason: `Cancel ${p.purchaseNo}`,
              createdBy: req.user._id,
            },
            { session },
          );
        const s = await Supplier.findByIdAndUpdate(
          p.supplier,
          { $inc: { currentBalance: -n(p.total) } },
          { new: true, session },
        );
        await Ledger.create(
          [
            {
              partyType: 'supplier',
              party: p.supplier,
              partyModel: 'Supplier',
              type: 'debit',
              amount: p.total,
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
      p.stateHistory.push({ state: 'cancelled', at: new Date(), by: req.user._id, reason: req.body.reason });
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

export async function createPurchaseOrder(req, res) {
  let body;
  try {
    body = parse(purchaseSchema, { ...req.body, payment: 0, status: 'draft' });
    await ensureWarehouse(req.user, body.warehouse);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const old = body.idempotencyKey ? await PurchaseOrder.findOne({ idempotencyKey: body.idempotencyKey }) : null;
  if (old) return res.json(old);
  const session = await mongoose.startSession();
  try {
    let po;
    await session.withTransaction(async () => {
      const supplier = await Supplier.findOne({ _id: body.supplier, isDeleted: false, status: 'active' }).session(
        session,
      );
      if (!supplier) throw error('Supplier is not available', 'SUPPLIER_NOT_AVAILABLE', 422);
      const items = await hydrateLines(body.items, { session }),
        calc = totals(body, items);
      [po] = await PurchaseOrder.create(
        [
          {
            ...body,
            ...calc,
            orderNo: await nextSequence('purchase-order', 'PO', { session }),
            idempotencyKey: body.idempotencyKey,
            status: 'pending-approval',
            expectedDate: req.body.expectedDate,
            items: items.map(({ productDoc: _productDoc, ...x }) => x),
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      await audit(session, req.user, 'PURCHASE_ORDER_CREATED', 'PurchaseOrder', po._id, { orderNo: po.orderNo });
    });
    res.status(201).json(po);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function approvePurchaseOrder(req, res) {
  const po = await PurchaseOrder.findById(req.params.id);
  if (!po || !['draft', 'pending-approval'].includes(po.status))
    return res.status(409).json({ message: 'Purchase order cannot be approved' });
  po.status = 'approved';
  po.approvedBy = req.user._id;
  po.approvedAt = new Date();
  await po.save();
  res.json(po);
}
export async function cancelGoodsReceipt(req, res) {
  const session = await mongoose.startSession();
  try {
    let grn;
    await session.withTransaction(async () => {
      grn = await GoodsReceipt.findById(req.params.id).session(session);
      if (!grn || grn.status !== 'received') throw error('Goods receipt cannot be cancelled', 'GRN_STATE_INVALID', 409);
      await ensureWarehouse(req.user, grn.warehouse);
      for (const i of grn.items)
        if (n(i.acceptedQuantity) > 0)
          await adjustStock(
            {
              productId: i.product,
              warehouseId: grn.warehouse,
              batchId: i.batch,
              quantity: -n(i.acceptedQuantity),
              type: 'return',
              reason: `Cancel ${grn.grnNo}`,
              createdBy: req.user._id,
            },
            { session },
          );
      grn.status = 'cancelled';
      grn.cancelledAt = new Date();
      grn.cancelledBy = req.user._id;
      grn.cancellationReason = req.body.reason;
      await grn.save({ session });
      await audit(session, req.user, 'GOODS_RECEIPT_CANCELLED', 'GoodsReceipt', grn._id, { reason: req.body.reason });
    });
    res.json(grn);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}

export async function createSaleReturn(req, res) {
  let body;
  try {
    body = parse(returnSchema, req.body);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      const sale = await Sale.findById(body.sale).session(session);
      if (!sale || ['draft', 'cancelled'].includes(sale.status))
        throw error('Sale is not returnable', 'SALE_NOT_RETURNABLE', 409);
      if (String(sale.warehouse) !== String(body.warehouse))
        throw error('Return warehouse must match sale warehouse', 'RETURN_WAREHOUSE_MISMATCH', 409);
      await ensureWarehouse(req.user, body.warehouse);
      const previous = await SaleReturn.find({ sale: sale._id, status: { $nin: ['cancelled', 'draft'] } })
          .session(session)
          .lean(),
        map = new Map();
      for (const r of previous)
        for (const i of r.items)
          map.set(
            `${i.product}:${i.batch || ''}`,
            n(map.get(`${i.product}:${i.batch || ''}`)) + n(i.baseQuantity || i.quantity),
          );
      const items = [];
      for (const x of body.items) {
        const sold = sale.items.find(
          (i) => String(i.product) === String(x.product) && String(i.batch || '') === String(x.batch || ''),
        );
        if (!sold) throw error('Returned item not on invoice', 'RETURN_ITEM_INVALID', 422);
        const base = n(x.quantity) * (n(sold.baseQuantity) / n(sold.quantity)),
          key = `${x.product}:${x.batch || ''}`;
        if (base + n(map.get(key)) > n(sold.baseQuantity))
          throw error('Return quantity exceeds sold quantity', 'RETURN_QUANTITY_EXCEEDED', 409);
        items.push({
          ...x,
          baseQuantity: base,
          rate: n(x.rate || sold.rate),
          amount: n(x.quantity) * n(x.rate || sold.rate),
        });
      }
      const gross = items.reduce((a, i) => a + i.amount, 0),
        ratio = n(sale.subtotal) ? gross / n(sale.subtotal) : 0,
        total = Math.max(0, gross - n(sale.discount) * ratio + n(sale.tax) * ratio);
      [ret] = await SaleReturn.create(
        [
          {
            ...body,
            returnNo: await nextSequence('sale-return', 'SR', { session }),
            customer: sale.customer,
            items,
            total,
            status: 'pending-approval',
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      await audit(session, req.user, 'SALE_RETURN_REQUESTED', 'SaleReturn', ret._id, { total });
    });
    res.status(201).json(ret);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function approveSaleReturn(req, res) {
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      ret = await SaleReturn.findById(req.params.id).session(session);
      if (!ret || ret.status !== 'pending-approval')
        throw error('Return is not awaiting approval', 'RETURN_STATE_INVALID', 409);
      const sale = await Sale.findById(ret.sale).session(session);
      for (const i of ret.items) {
        if (i.disposition === 'restock')
          await adjustStock(
            {
              productId: i.product,
              warehouseId: ret.warehouse,
              batchId: i.batch,
              quantity: n(i.baseQuantity),
              type: 'return',
              reason: ret.reason,
              createdBy: req.user._id,
            },
            { session },
          );
        else
          await Product.updateOne(
            { _id: i.product },
            { $inc: { [i.disposition === 'damage' ? 'damagedQuantity' : 'expiredQuantity']: n(i.baseQuantity) } },
            { session },
          );
      }
      const c = await Customer.findByIdAndUpdate(
        ret.customer,
        { $inc: { currentBalance: -n(ret.total) } },
        { new: true, session },
      );
      await Ledger.create(
        [
          {
            partyType: 'customer',
            party: ret.customer,
            partyModel: 'Customer',
            type: 'debit',
            amount: ret.total,
            description: `Sale return ${ret.returnNo}`,
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
            party: ret.customer,
            referenceType: 'sale-return',
            referenceId: ret._id,
            amount: ret.total,
            reason: ret.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      ret.creditNote = note._id;
      ret.status = 'completed';
      ret.approvedBy = req.user._id;
      ret.approvedAt = new Date();
      await ret.save({ session });
      sale.returnedTotal = n(sale.returnedTotal) + n(ret.total);
      await sale.save({ session });
      await audit(session, req.user, 'SALE_RETURN_APPROVED', 'SaleReturn', ret._id, { total: ret.total });
    });
    res.json(ret);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function cancelSaleReturn(req, res) {
  const ret = await SaleReturn.findById(req.params.id);
  if (!ret || !['draft', 'pending-approval'].includes(ret.status))
    return res.status(409).json({ message: 'Only unprocessed returns can be cancelled' });
  ret.status = 'cancelled';
  ret.cancelledAt = new Date();
  ret.cancelledBy = req.user._id;
  ret.cancellationReason = req.body.reason;
  await ret.save();
  res.json(ret);
}
export async function createPurchaseReturn(req, res) {
  let body;
  try {
    body = parse(returnSchema, req.body);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      const p = await Purchase.findById(body.purchase).session(session);
      if (!p || p.status !== 'received') throw error('Purchase is not returnable', 'PURCHASE_NOT_RETURNABLE', 409);
      if (String(p.warehouse) !== String(body.warehouse))
        throw error('Return warehouse must match receiving warehouse', 'RETURN_WAREHOUSE_MISMATCH', 409);
      const previous = await PurchaseReturn.find({ purchase: p._id, status: { $nin: ['cancelled', 'draft'] } })
          .session(session)
          .lean(),
        map = new Map();
      for (const r of previous)
        for (const i of r.items)
          map.set(`${i.product}:${i.batch || ''}`, n(map.get(`${i.product}:${i.batch || ''}`)) + n(i.baseQuantity));
      const items = [];
      for (const x of body.items) {
        const bought = p.items.find(
          (i) => String(i.product) === String(x.product) && String(i.batch || '') === String(x.batch || ''),
        );
        if (!bought) throw error('Return item not on purchase', 'RETURN_ITEM_INVALID', 422);
        const base = n(x.quantity) * (n(bought.baseQuantity) / n(bought.quantity)),
          key = `${x.product}:${x.batch || ''}`;
        if (base + n(map.get(key)) > n(bought.baseQuantity))
          throw error('Return quantity exceeds purchased quantity', 'PURCHASE_RETURN_QUANTITY_EXCEEDED', 409);
        items.push({
          ...x,
          baseQuantity: base,
          rate: n(x.rate || bought.rate),
          amount: n(x.quantity) * n(x.rate || bought.rate),
          disposition: 'return-to-supplier',
        });
      }
      const gross = items.reduce((a, i) => a + i.amount, 0),
        ratio = n(p.subtotal) ? gross / n(p.subtotal) : 0,
        total = Math.max(0, gross - n(p.discount) * ratio + (n(p.tax) + n(p.transport) + n(p.expenses)) * ratio);
      [ret] = await PurchaseReturn.create(
        [
          {
            ...body,
            returnNo: await nextSequence('purchase-return', 'PR', { session }),
            supplier: p.supplier,
            items,
            subtotal: gross,
            total,
            tax: n(p.tax) * ratio,
            discount: n(p.discount) * ratio,
            status: 'pending-approval',
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      await audit(session, req.user, 'PURCHASE_RETURN_REQUESTED', 'PurchaseReturn', ret._id, { total });
    });
    res.status(201).json(ret);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function approvePurchaseReturn(req, res) {
  const session = await mongoose.startSession();
  try {
    let ret;
    await session.withTransaction(async () => {
      ret = await PurchaseReturn.findById(req.params.id).session(session);
      if (!ret || ret.status !== 'pending-approval')
        throw error('Return is not awaiting approval', 'RETURN_STATE_INVALID', 409);
      for (const i of ret.items)
        await adjustStock(
          {
            productId: i.product,
            warehouseId: ret.warehouse,
            batchId: i.batch,
            quantity: -n(i.baseQuantity),
            type: 'return',
            reason: ret.reason,
            createdBy: req.user._id,
          },
          { session },
        );
      const s = await Supplier.findByIdAndUpdate(
        ret.supplier,
        { $inc: { currentBalance: -n(ret.total) } },
        { new: true, session },
      );
      await Ledger.create(
        [
          {
            partyType: 'supplier',
            party: ret.supplier,
            partyModel: 'Supplier',
            type: 'debit',
            amount: ret.total,
            description: `Debit note ${ret.returnNo}`,
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
            party: ret.supplier,
            referenceType: 'purchase-return',
            referenceId: ret._id,
            amount: ret.total,
            reason: ret.reason,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      ret.debitNote = note._id;
      ret.status = 'completed';
      ret.approvedBy = req.user._id;
      ret.approvedAt = new Date();
      await ret.save({ session });
      await Purchase.updateOne({ _id: ret.purchase }, { $inc: { returnedTotal: n(ret.total) } }, { session });
      await audit(session, req.user, 'PURCHASE_RETURN_APPROVED', 'PurchaseReturn', ret._id, { total: ret.total });
    });
    res.json(ret);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function cancelPurchaseReturn(req, res) {
  const ret = await PurchaseReturn.findById(req.params.id);
  if (!ret || !['draft', 'pending-approval'].includes(ret.status))
    return res.status(409).json({ message: 'Only unprocessed returns can be cancelled' });
  ret.status = 'cancelled';
  ret.cancelledAt = new Date();
  ret.cancelledBy = req.user._id;
  ret.cancellationReason = req.body.reason;
  await ret.save();
  res.json(ret);
}

export async function createExpense(req, res) {
  let body;
  try {
    body = parse(expenseSchema, req.body);
    if (body.warehouse) await ensureWarehouse(req.user, body.warehouse);
  } catch (e) {
    return res.status(e.statusCode || 422).json({ message: e.message, code: e.code, details: e.details });
  }
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      const taxAmount = (n(body.amount) * n(body.taxRate)) / 100;
      [doc] = await Expense.create(
        [
          {
            ...body,
            expenseNo: await nextSequence('expense', 'EXP', { session }),
            taxAmount,
            totalAmount: n(body.amount) + taxAmount,
            status: body.status,
            isDeleted: false,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      await audit(session, req.user, 'EXPENSE_CREATED', 'Expense', doc._id, { expenseNo: doc.expenseNo });
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function updateExpense(req, res) {
  let body;
  try {
    body = parse(expenseSchema.partial(), req.body);
  } catch (e) {
    return res.status(422).json({ message: e.message, details: e.details });
  }
  const doc = await Expense.findById(req.params.id);
  if (!doc || doc.isDeleted) return res.status(404).json({ message: 'Expense not found' });
  if (['paid'].includes(doc.status)) return res.status(409).json({ message: 'Paid expense is immutable' });
  Object.assign(doc, body);
  doc.taxAmount = (n(doc.amount) * n(doc.taxRate)) / 100;
  doc.totalAmount = n(doc.amount) + n(doc.taxAmount);
  await doc.save();
  res.json(doc);
}
export async function approveExpense(req, res) {
  let body;
  try {
    body = parse(expenseApprovalSchema, req.body);
  } catch (e) {
    return res.status(422).json({ message: e.message, details: e.details });
  }
  const doc = await Expense.findById(req.params.id);
  if (!doc || doc.isDeleted) return res.status(404).json({ message: 'Expense not found' });
  if (!['pending', 'approved', 'rejected'].includes(doc.status) || doc.status === 'paid')
    return res.status(409).json({ message: 'Expense cannot be approved in current state' });
  if (String(doc.createdBy) === String(req.user._id) && !isAdmin(req.user))
    return res.status(403).json({ message: 'Maker cannot approve own expense', code: 'MAKER_CHECKER_VIOLATION' });
  doc.approvalHistory.push({
    level: body.level,
    status: body.status,
    by: req.user._id,
    at: new Date(),
    reason: body.reason,
  });
  doc.approvalLevel = Math.max(n(doc.approvalLevel), body.level);
  doc.status = body.status;
  doc.rejectionReason = body.status === 'rejected' ? body.reason : undefined;
  if (body.status === 'approved') {
    doc.approvedBy = req.user._id;
    doc.approvedAt = new Date();
  }
  await doc.save();
  res.json(doc);
}
export async function payExpense(req, res) {
  const session = await mongoose.startSession();
  try {
    let doc, payment;
    await session.withTransaction(async () => {
      doc = await Expense.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'approved')
        throw error('Only approved expense can be paid', 'EXPENSE_STATE_INVALID', 409);
      if (!req.body.account) throw error('Cash/bank account is required', 'EXPENSE_ACCOUNT_REQUIRED', 422);
      const voucherNo = await nextSequence('expense-voucher', 'EV', { session });
      const paymentNo = await nextSequence('expense-payment', 'EP', { session });
      [payment] = await Payment.create(
        [
          {
            paymentNo,
            direction: 'payment',
            partyType: 'expense',
            party: doc._id,
            amount: doc.totalAmount,
            allocatedAmount: doc.totalAmount,
            unallocatedAmount: 0,
            allocations: [],
            method: doc.paymentMethod,
            account: req.body.account,
            status: 'completed',
            statusHistory: [{ status: 'completed', at: new Date(), by: req.user._id }],
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      const entry = await postAccount(
        {
          accountId: req.body.account,
          type: 'credit',
          amount: doc.totalAmount,
          description: `Expense ${doc.expenseNo}`,
          referenceType: 'expense',
          referenceId: doc._id,
          userId: req.user._id,
        },
        session,
      );
      payment.accountEntry = entry?._id;
      await payment.save({ session });
      doc.status = 'paid';
      doc.paidAt = new Date();
      doc.paidBy = req.user._id;
      doc.account = req.body.account;
      doc.payment = payment._id;
      doc.voucherNo = voucherNo;
      await doc.save({ session });
      await autoPost('expense', doc, { session, userId: req.user._id });
      await audit(session, req.user, 'EXPENSE_PAID', 'Expense', doc._id, { voucherNo, account: req.body.account });
    });
    res.json({ expense: doc, payment });
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
  } finally {
    await session.endSession();
  }
}
export async function reverseExpense(req, res) {
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      doc = await Expense.findById(req.params.id).session(session);
      if (!doc || doc.status !== 'paid') throw error('Only paid expense can be reversed', 'EXPENSE_STATE_INVALID', 409);
      const payment = await Payment.findById(doc.payment).session(session);
      if (payment?.account)
        await postAccount(
          {
            accountId: payment.account,
            type: 'debit',
            amount: doc.totalAmount,
            description: `Expense reversal ${doc.expenseNo}`,
            referenceType: 'expense-reversal',
            referenceId: doc._id,
            userId: req.user._id,
            reversalOf: payment.accountEntry,
          },
          session,
        );
      if (payment) {
        payment.status = 'reversed';
        payment.reversedAt = new Date();
        payment.reversedBy = req.user._id;
        payment.reversalReason = req.body.reason;
        payment.statusHistory.push({ status: 'reversed', at: new Date(), by: req.user._id, reason: req.body.reason });
        await payment.save({ session });
      }
      doc.status = 'approved';
      doc.reversedAt = new Date();
      doc.reversedBy = req.user._id;
      doc.reversalReason = req.body.reason;
      doc.payment = undefined;
      await doc.save({ session });
      await audit(session, req.user, 'EXPENSE_REVERSED', 'Expense', doc._id, { reason: req.body.reason });
    });
    res.json(doc);
  } catch (e) {
    res.status(e.statusCode || 400).json({ message: e.message, code: e.code });
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
export async function listExpenses(req, res) {
  const page = Math.max(1, n(req.query.page) || 1),
    limit = Math.min(100, Math.max(1, n(req.query.limit) || 20)),
    filter = { isDeleted: req.query.deleted === 'true' };
  for (const k of ['status', 'category', 'warehouse']) if (req.query[k]) filter[k] = req.query[k];
  const [items, total] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Expense.countDocuments(filter),
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
export async function expenseDetail(req, res) {
  const doc = await Expense.findById(req.params.id).populate('account payment');
  if (!doc) return res.status(404).json({ message: 'Expense not found' });
  res.json(doc);
}
export async function expenseTimeline(req, res) {
  const [expense, audits] = await Promise.all([
    Expense.findById(req.params.id).lean(),
    AuditLog.find({ entity: 'Expense', entityId: req.params.id }).sort({ createdAt: 1 }).lean(),
  ]);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  res.json({ expense, audits, approvalHistory: expense.approvalHistory || [] });
}
export async function expensePdf(req, res) {
  const doc = await Expense.findById(req.params.id).populate('account');
  if (!doc) return res.status(404).json({ message: 'Expense not found' });
  res.type('application/pdf');
  const pdf = new PDFDocument({ margin: 40 });
  pdf.pipe(res);
  pdf.fontSize(20).text(`Expense Voucher ${doc.voucherNo || doc.expenseNo}`);
  pdf
    .moveDown()
    .fontSize(11)
    .text(`Category: ${doc.category}`)
    .text(`Description: ${doc.description || '-'}`)
    .text(`Amount: PKR ${n(doc.amount).toLocaleString()}`)
    .text(`Tax: PKR ${n(doc.taxAmount).toLocaleString()}`)
    .text(`Total: PKR ${n(doc.totalAmount).toLocaleString()}`)
    .text(`Status: ${doc.status}`);
  pdf.end();
}

export async function timeline(req, res) {
  const type = req.params.type,
    id = req.params.id,
    entity = type === 'sale' ? 'Sale' : 'Purchase';
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
    .text(`Total: PKR ${n(doc.total).toLocaleString()}`)
    .text(`Paid: PKR ${n(doc.payment).toLocaleString()}`)
    .text(`Remaining: PKR ${n(doc.remaining).toLocaleString()}`);
  pdf.end();
}
export async function returnPdf(req, res) {
  const Model = req.params.type === 'sale' ? SaleReturn : PurchaseReturn;
  const doc = await Model.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Return not found' });
  res.type('application/pdf');
  const pdf = new PDFDocument({ margin: 40 });
  pdf.pipe(res);
  pdf
    .fontSize(20)
    .text(`${req.params.type === 'sale' ? 'Sales Return' : 'Purchase Return'} ${doc.returnNo}`)
    .moveDown();
  for (const i of doc.items) pdf.fontSize(10).text(`${i.product}  ${i.quantity} × ${i.rate} = ${i.amount}`);
  pdf
    .moveDown()
    .fontSize(13)
    .text(`Total: PKR ${n(doc.total).toLocaleString()}`)
    .text(`Status: ${doc.status}`);
  pdf.end();
}
export async function paymentPdf(req, res) {
  const p = await Payment.findById(req.params.id);
  if (!p) return res.status(404).json({ message: 'Payment not found' });
  res.type('application/pdf');
  const pdf = new PDFDocument({ margin: 40 });
  pdf.pipe(res);
  pdf
    .fontSize(20)
    .text(`${p.direction === 'receipt' ? 'Receipt' : 'Payment Voucher'} ${p.paymentNo}`)
    .moveDown()
    .fontSize(12)
    .text(`Amount: ${p.currency} ${n(p.amount).toLocaleString()}`)
    .text(`Method: ${p.method}`)
    .text(`Status: ${p.status}`)
    .text(`Reference: ${p.reference || '-'}`);
  pdf.end();
}
export async function legacySalePayment(req, res) {
  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Sale not found' });
  req.body = {
    direction: 'receipt',
    partyType: 'customer',
    party: String(sale.customer),
    amount: req.body.amount,
    method: req.body.method || req.body.paymentMethod || 'cash',
    account: req.body.account,
    reference: req.body.reference,
    idempotencyKey: req.body.idempotencyKey,
    allocations: [{ documentType: 'sale', document: String(sale._id), amount: req.body.amount }],
  };
  return createPayment(req, res);
}
export function deprecatedWrite(req, res) {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
  return res.status(410).json({
    message: 'This legacy write endpoint is disabled. Use the canonical /api/v1 transaction endpoint.',
    code: 'LEGACY_TRANSACTION_ENDPOINT_DISABLED',
  });
}
