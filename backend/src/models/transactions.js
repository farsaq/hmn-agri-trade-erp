import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const opt = { timestamps: true };
const allocation = new Schema(
  {
    documentType: { type: String, enum: ['sale', 'purchase'] },
    document: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 0.01 },
  },
  { _id: false },
);
export const Payment =
  models.Payment ||
  model(
    'Payment',
    new Schema(
      {
        paymentNo: { type: String, required: true, unique: true, index: true },
        direction: { type: String, enum: ['receipt', 'payment'], required: true, index: true },
        partyType: { type: String, enum: ['customer', 'supplier', 'expense'], required: true, index: true },
        party: { type: Schema.Types.ObjectId, required: true, index: true },
        amount: { type: Number, required: true, min: 0.01 },
        allocatedAmount: { type: Number, default: 0, min: 0 },
        unallocatedAmount: { type: Number, default: 0, min: 0 },
        allocations: [allocation],
        method: { type: String, enum: ['cash', 'bank', 'card', 'online', 'cheque', 'other'], default: 'cash' },
        reference: { type: String, trim: true, index: true, sparse: true },
        idempotencyKey: { type: String, unique: true, sparse: true, index: true },
        currency: { type: String, default: 'PKR' },
        exchangeRate: { type: Number, default: 1, min: 0.000001 },
        status: {
          type: String,
          enum: ['draft', 'pending', 'approved', 'completed', 'reversal-processing', 'reversed', 'cancelled'],
          default: 'completed',
          index: true,
        },
        statusHistory: [
          {
            status: String,
            at: { type: Date, default: Date.now },
            by: { type: Schema.Types.ObjectId, ref: 'User' },
            reason: String,
          },
        ],
        chequeStatus: {
          type: String,
          enum: ['none', 'issued', 'deposited', 'pending', 'cleared', 'bounced', 'cancelled'],
          default: 'none',
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedAt: Date,
        account: { type: Schema.Types.ObjectId, ref: 'CashAccount' },
        ledgerEntry: { type: Schema.Types.ObjectId, ref: 'Ledger' },
        accountEntry: { type: Schema.Types.ObjectId, ref: 'AccountEntry' },
        reversalLedgerEntry: { type: Schema.Types.ObjectId, ref: 'Ledger' },
        reversalAccountEntry: { type: Schema.Types.ObjectId, ref: 'AccountEntry' },
        reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reversedAt: Date,
        reversalReason: String,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const PurchaseReturn =
  models.PurchaseReturn ||
  model(
    'PurchaseReturn',
    new Schema(
      {
        returnNo: { type: String, required: true, unique: true, index: true },
        purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        items: [
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
            quantity: { type: Number, required: true, min: 0.000001 },
            baseQuantity: { type: Number, required: true, min: 0.000001 },
            rate: { type: Number, required: true, min: 0 },
            amount: { type: Number, required: true, min: 0 },
            disposition: {
              type: String,
              enum: ['return-to-supplier', 'damage', 'expiry'],
              default: 'return-to-supplier',
            },
          },
        ],
        reason: String,
        subtotal: Number,
        tax: Number,
        discount: Number,
        total: Number,
        status: {
          type: String,
          enum: ['draft', 'pending-approval', 'approved', 'completed', 'cancelled'],
          default: 'pending-approval',
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedAt: Date,
        cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
        cancelledAt: Date,
        cancellationReason: String,
        refundPayment: { type: Schema.Types.ObjectId, ref: 'Payment' },
        debitNote: { type: Schema.Types.ObjectId, ref: 'CreditNote' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const CreditNote =
  models.CreditNote ||
  model(
    'CreditNote',
    new Schema(
      {
        noteNo: { type: String, required: true, unique: true, index: true },
        type: { type: String, enum: ['customer-credit', 'supplier-debit'], required: true },
        partyType: { type: String, enum: ['customer', 'supplier'], required: true },
        party: { type: Schema.Types.ObjectId, required: true },
        referenceType: String,
        referenceId: Schema.Types.ObjectId,
        amount: { type: Number, required: true, min: 0 },
        reason: String,
        status: { type: String, enum: ['issued', 'partially-applied', 'applied', 'cancelled'], default: 'issued' },
        appliedAmount: { type: Number, default: 0, min: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const PurchaseOrder =
  models.PurchaseOrder ||
  model(
    'PurchaseOrder',
    new Schema(
      {
        orderNo: { type: String, required: true, unique: true, index: true },
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        items: [Schema.Types.Mixed],
        expectedDate: Date,
        subtotal: Number,
        tax: Number,
        discount: Number,
        freight: Number,
        total: Number,
        status: {
          type: String,
          enum: ['draft', 'pending-approval', 'approved', 'sent', 'partially-received', 'received', 'cancelled'],
          default: 'draft',
        },
        idempotencyKey: { type: String, unique: true, sparse: true, index: true },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedAt: Date,
        receivedQuantities: [
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product' },
            batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
            quantity: Number,
          },
        ],
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const GoodsReceipt =
  models.GoodsReceipt ||
  model(
    'GoodsReceipt',
    new Schema(
      {
        grnNo: { type: String, required: true, unique: true, index: true },
        purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
        purchase: { type: Schema.Types.ObjectId, ref: 'Purchase' },
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        items: [
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
            orderedQuantity: Number,
            receivedQuantity: { type: Number, required: true, min: 0 },
            acceptedQuantity: { type: Number, required: true, min: 0 },
            rejectedQuantity: { type: Number, default: 0, min: 0 },
            rate: { type: Number, min: 0 },
            expiryDate: Date,
            batchNo: String,
          },
        ],
        inspectionNotes: String,
        receivedAt: { type: Date, default: Date.now },
        receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['draft', 'received', 'cancelled'], default: 'received' },
        cancelledAt: Date,
        cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
        cancellationReason: String,
      },
      opt,
    ),
  );
