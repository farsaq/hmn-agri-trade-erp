import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const opt = { timestamps: true };
export const SupplierContract =
  models.SupplierContract ||
  model(
    'SupplierContract',
    new Schema(
      {
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        title: { type: String, required: true },
        contractNo: { type: String, index: true, sparse: true },
        startDate: Date,
        endDate: { type: Date, index: true },
        terms: String,
        value: { type: Number, default: 0, min: 0 },
        currency: { type: String, default: 'PKR' },
        renewalReminderDays: { type: Number, default: 30, min: 0 },
        status: {
          type: String,
          enum: ['draft', 'active', 'expired', 'terminated', 'renewed'],
          default: 'active',
          index: true,
        },
        attachment: String,
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const SupplierBankAccount =
  models.SupplierBankAccount ||
  model(
    'SupplierBankAccount',
    new Schema(
      {
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        bankName: { type: String, required: true },
        accountTitle: String,
        accountNumber: String,
        iban: String,
        branch: String,
        swiftCode: String,
        bankCountry: String,
        bankCurrency: { type: String, default: 'PKR' },
        isPrimary: { type: Boolean, default: false, index: true },
        verified: { type: Boolean, default: false },
        verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: Date,
      },
      opt,
    ),
  );

export const SupplierContact =
  models.SupplierContact ||
  model(
    'SupplierContact',
    new Schema(
      {
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        name: { type: String, required: true },
        designation: String,
        phone: String,
        whatsapp: String,
        email: String,
        isPrimary: { type: Boolean, default: false, index: true },
        notes: String,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const SupplierCompliance =
  models.SupplierCompliance ||
  model(
    'SupplierCompliance',
    new Schema(
      {
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        documentType: { type: String, required: true, index: true },
        documentNumber: String,
        issuedAt: Date,
        expiresAt: { type: Date, index: true },
        status: {
          type: String,
          enum: ['valid', 'expiring', 'expired', 'pending-review', 'rejected'],
          default: 'valid',
          index: true,
        },
        fileUrl: String,
        notes: String,
        verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: Date,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const SupplierActivity =
  models.SupplierActivity ||
  model(
    'SupplierActivity',
    new Schema(
      {
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        type: {
          type: String,
          enum: ['call', 'email', 'whatsapp', 'meeting', 'visit', 'note', 'complaint', 'resolution'],
          required: true,
          index: true,
        },
        subject: String,
        details: String,
        nextFollowUpAt: { type: Date, index: true },
        completed: { type: Boolean, default: false, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const SupplierEvaluation =
  models.SupplierEvaluation ||
  model(
    'SupplierEvaluation',
    new Schema(
      {
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        periodFrom: Date,
        periodTo: Date,
        quality: { type: Number, min: 0, max: 5, default: 0 },
        delivery: { type: Number, min: 0, max: 5, default: 0 },
        pricing: { type: Number, min: 0, max: 5, default: 0 },
        communication: { type: Number, min: 0, max: 5, default: 0 },
        overall: { type: Number, min: 0, max: 5, default: 0 },
        notes: String,
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const Category =
  models.Category ||
  model(
    'Category',
    new Schema(
      {
        name: { type: String, required: true, unique: true, trim: true },
        code: { type: String, unique: true, sparse: true },
        active: { type: Boolean, default: true },
      },
      opt,
    ),
  );
export const Brand =
  models.Brand ||
  model(
    'Brand',
    new Schema(
      { name: { type: String, required: true, unique: true, trim: true }, active: { type: Boolean, default: true } },
      opt,
    ),
  );
export const ProductBatch =
  models.ProductBatch ||
  model(
    'ProductBatch',
    new Schema(
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', index: true },
        batchNo: { type: String, required: true, index: true },
        lotNo: String,
        serialNumbers: [String],
        manufacturedAt: Date,
        expiryDate: { type: Date, index: true },
        purchasePrice: { type: Number, default: 0 },
        quantity: { type: Number, default: 0 },
        status: { type: String, enum: ['active', 'quarantined', 'expired', 'depleted'], default: 'active' },
      },
      opt,
    ),
  );
export const WarehouseStock =
  models.WarehouseStock ||
  model(
    'WarehouseStock',
    new Schema(
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
        batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
        quantity: { type: Number, default: 0, min: 0 },
        reserved: { type: Number, default: 0, min: 0 },
        averageCost: { type: Number, default: 0 },
        lastCountedAt: Date,
      },
      { ...opt, indexes: [{ fields: { product: 1, warehouse: 1, batch: 1 }, options: { unique: true } }] },
    ),
  );
WarehouseStock.schema.index({ product: 1, warehouse: 1, batch: 1 }, { unique: true });
export const StockReconciliation =
  models.StockReconciliation ||
  model(
    'StockReconciliation',
    new Schema(
      {
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
        systemQuantity: Number,
        countedQuantity: Number,
        difference: Number,
        reason: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const StockRequest =
  models.StockRequest ||
  model(
    'StockRequest',
    new Schema(
      {
        type: { type: String, enum: ['damage', 'return', 'expiry'], required: true },
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
        quantity: { type: Number, required: true, min: 0.001 },
        reason: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const SaleReturn =
  models.SaleReturn ||
  model(
    'SaleReturn',
    new Schema(
      {
        returnNo: { type: String, unique: true, index: true },
        sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        items: [
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
            quantity: { type: Number, required: true },
            baseQuantity: { type: Number, required: true },
            rate: { type: Number, required: true },
            amount: Number,
            disposition: { type: String, enum: ['restock', 'damage', 'expiry'], default: 'restock' },
          },
        ],
        reason: String,
        total: Number,
        refund: Number,
        status: {
          type: String,
          enum: ['draft', 'pending-approval', 'approved', 'completed', 'cancelled'],
          default: 'pending-approval',
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedAt: Date,
        refundPayment: { type: Schema.Types.ObjectId, ref: 'Payment' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const Quotation =
  models.Quotation ||
  model(
    'Quotation',
    new Schema(
      {
        quotationNo: { type: String, unique: true, index: true },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        validUntil: Date,
        items: [
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product' },
            name: String,
            quantity: Number,
            rate: Number,
            amount: Number,
          },
        ],
        subtotal: Number,
        discount: Number,
        tax: Number,
        transport: Number,
        total: Number,
        status: { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'draft' },
        notes: String,
      },
      opt,
    ),
  );
export const DeliveryChallan =
  models.DeliveryChallan ||
  model(
    'DeliveryChallan',
    new Schema(
      {
        challanNo: { type: String, unique: true, index: true },
        sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        vehicle: String,
        driver: String,
        dispatchDate: { type: Date, default: Date.now },
        items: [
          { product: { type: Schema.Types.ObjectId, ref: 'Product' }, name: String, quantity: Number, unit: String },
        ],
        status: { type: String, enum: ['prepared', 'dispatched', 'delivered', 'cancelled'], default: 'prepared' },
        receivedBy: String,
        receivedAt: Date,
      },
      opt,
    ),
  );
export const PaymentAllocation =
  models.PaymentAllocation ||
  model(
    'PaymentAllocation',
    new Schema(
      {
        sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
        amount: { type: Number, required: true, min: 0.01 },
        method: { type: String, enum: ['cash', 'bank', 'card', 'online', 'cheque', 'other'], default: 'cash' },
        reference: String,
        date: { type: Date, default: Date.now },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const ExpenseCategory =
  models.ExpenseCategory ||
  model(
    'ExpenseCategory',
    new Schema(
      {
        name: { type: String, required: true, unique: true, trim: true },
        code: { type: String, unique: true, sparse: true },
        active: { type: Boolean, default: true },
        monthlyBudget: { type: Number, default: 0 },
        description: String,
      },
      opt,
    ),
  );
export const PaymentReceipt =
  models.PaymentReceipt ||
  model(
    'PaymentReceipt',
    new Schema(
      {
        receiptNo: { type: String, required: true, unique: true, index: true },
        sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
        amount: { type: Number, required: true, min: 0.01 },
        method: { type: String, default: 'cash' },
        reference: String,
        date: { type: Date, default: Date.now },
        notes: String,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
SaleReturn.schema.add({
  creditNote: { type: Schema.Types.ObjectId, ref: 'CreditNote' },
  cancelledAt: Date,
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
});
