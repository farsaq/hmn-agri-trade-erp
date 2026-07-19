import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const base = { timestamps: true };
export const User =
  models.User ||
  model(
    'User',
    new Schema(
      {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true },
        role: { type: String, default: 'viewer', index: true },
        customRole: { type: Schema.Types.ObjectId, ref: 'Role' },
        permissions: [String],
        active: { type: Boolean, default: true },
        emailVerified: { type: Boolean, default: false },
        lastLoginAt: Date,
        failedLoginAttempts: { type: Number, default: 0 },
        lockedUntil: Date,
        passwordResetToken: String,
        passwordResetExpires: Date,
        otpHash: String,
        otpExpires: Date,
        emailVerificationToken: String,
        emailVerificationExpires: Date,
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: String,
        recoveryCodeHashes: [String],
        trustedDevices: [{ tokenHash: String, label: String, expiresAt: Date, lastUsedAt: Date }],
      },
      base,
    ),
  );
export const Session =
  models.Session ||
  model(
    'Session',
    new Schema(
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        tokenHash: { type: String, required: true, unique: true, index: true },
        userAgent: String,
        ip: String,
        rememberMe: { type: Boolean, default: false },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
        revokedAt: Date,
      },
      base,
    ),
  );
export const AuditLog =
  models.AuditLog ||
  model(
    'AuditLog',
    new Schema(
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        action: { type: String, required: true, index: true },
        entity: { type: String, index: true },
        entityId: Schema.Types.ObjectId,
        description: String,
        ip: String,
        userAgent: String,
        device: String,
        method: String,
        path: String,
        statusCode: Number,
        before: Schema.Types.Mixed,
        after: Schema.Types.Mixed,
        changes: Schema.Types.Mixed,
        metadata: Schema.Types.Mixed,
      },
      base,
    ),
  );
export const Notification =
  models.Notification ||
  model(
    'Notification',
    new Schema(
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        audienceRoles: [String],
        type: { type: String, default: 'info', index: true },
        severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
        title: { type: String, required: true },
        message: String,
        read: { type: Boolean, default: false, index: true },
        readAt: Date,
        link: String,
        eventKey: { type: String, index: true, sparse: true },
        sourceEntity: String,
        sourceId: Schema.Types.ObjectId,
        emailSentAt: Date,
        emailError: String,
      },
      base,
    ),
  );
const customerSchema = new Schema(
  {
    customerCode: { type: String, required: true, unique: true, sparse: true, index: true, immutable: true },
    photo: String,
    name: { type: String, required: true, trim: true, index: true },
    fatherName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    normalizedPhone: { type: String, required: true, unique: true, sparse: true, index: true },
    whatsapp: String,
    cnic: { type: String, trim: true },
    normalizedCnic: { type: String, unique: true, sparse: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    normalizedEmail: { type: String, unique: true, sparse: true, index: true },
    village: { type: String, trim: true, index: true },
    taluka: { type: String, trim: true },
    district: { type: String, trim: true, index: true },
    address: String,
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active', index: true },
    tags: [{ type: String, trim: true, index: true }],
    category: { type: String, trim: true, index: true },
    registrationDate: { type: Date, default: Date.now, index: true },
    reference: String,
    notes: String,
    attachments: [
      { url: String, name: String, mimeType: String, size: Number, uploadedAt: { type: Date, default: Date.now } },
    ],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
customerSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
customerSchema.index({ village: 1, district: 1 });
export const Customer = models.Customer || model('Customer', customerSchema);
export const Counter =
  models.Counter ||
  model(
    'Counter',
    new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { timestamps: true }),
  );
const supplierSchema = new Schema(
  {
    photo: String,
    supplierCode: { type: String, required: true, unique: true, sparse: true, index: true, immutable: true },
    supplierType: { type: String, enum: ['local', 'international'], default: 'local', index: true },
    businessType: String,
    category: { type: String, trim: true, index: true },
    tags: [{ type: String, trim: true, index: true }],
    registrationDate: { type: Date, default: Date.now, index: true },
    name: { type: String, required: true, trim: true, index: true },
    company: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    normalizedPhone: { type: String, unique: true, sparse: true, index: true },
    secondaryPhone: String,
    emergencyContact: String,
    whatsapp: String,
    email: { type: String, trim: true, lowercase: true },
    normalizedEmail: { type: String, unique: true, sparse: true, index: true },
    cnic: { type: String, trim: true },
    normalizedCnic: { type: String, unique: true, sparse: true, index: true },
    ntn: { type: String, trim: true },
    normalizedNtn: { type: String, unique: true, sparse: true, index: true },
    taxNumber: { type: String, index: true },
    gstNumber: { type: String, index: true },
    salesTaxRegistered: { type: Boolean, default: false },
    taxCategory: String,
    contactPerson: String,
    website: String,
    facebook: String,
    linkedin: String,
    village: { type: String, index: true },
    taluka: String,
    district: { type: String, index: true },
    city: String,
    province: String,
    country: { type: String, default: 'Pakistan' },
    address: String,
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'PKR' },
    paymentMethod: String,
    paymentCycle: String,
    dueDays: { type: Number, default: 0, min: 0 },
    paymentTerms: String,
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active', index: true },
    onboardingStatus: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'on-hold'],
      default: 'draft',
      index: true,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedReason: String,
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low', index: true },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    holdReason: String,
    reference: String,
    bankDetails: {
      bankName: String,
      accountTitle: String,
      accountNumber: String,
      iban: String,
      branch: String,
      swiftCode: String,
      bankCountry: String,
      bankCurrency: String,
    },
    documents: { cnicAttachment: String, ntnAttachment: String, agreementPdf: String, bankChequeImage: String },
    supplierRating: { type: Number, default: 0, min: 0, max: 5 },
    blacklisted: { type: Boolean, default: false, index: true },
    preferredSupplier: { type: Boolean, default: false, index: true },
    ledgerId: { type: Schema.Types.ObjectId, ref: 'Ledger' },
    defaultExpenseAccount: String,
    defaultPayableAccount: String,
    defaultWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    deliveryTimeDays: { type: Number, default: 0, min: 0 },
    transportType: String,
    notes: String,
    attachments: [{ type: Schema.Types.ObjectId, ref: 'Attachment' }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastTransaction: Date,
    lastPurchaseDate: Date,
  },
  base,
);
supplierSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
supplierSchema.index({ village: 1, district: 1 });
export const Supplier = models.Supplier || model('Supplier', supplierSchema);
const productUnitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true },
    ratioToBase: { type: Number, required: true, min: 0.000001 },
    precision: { type: Number, default: 3, min: 0, max: 6 },
  },
  { _id: false },
);
const productSchema = new Schema(
  {
    productCode: { type: String, required: true, unique: true, sparse: true, index: true, immutable: true },
    name: { type: String, required: true, trim: true, index: true },
    normalizedName: { type: String, required: true, index: true },
    sku: { type: String, required: true, trim: true },
    normalizedSku: { type: String, required: true, unique: true, index: true },
    barcode: { type: String, trim: true },
    normalizedBarcode: { type: String, unique: true, sparse: true, index: true },
    qrCode: String,
    category: {
      type: String,
      enum: ['Cotton', 'Wheat', 'DAP', 'Urea', 'Bardana', 'Seeds', 'Pesticides', 'Other'],
      default: 'Other',
      index: true,
    },
    brand: { type: String, trim: true, index: true },
    grade: String,
    quality: String,
    tags: [{ type: String, trim: true, index: true }],
    description: String,
    baseUnit: { type: String, default: 'kg' },
    purchaseUnit: { type: String, default: 'kg' },
    saleUnit: { type: String, default: 'kg' },
    unit: { type: String, default: 'kg' },
    unitConversions: [productUnitSchema],
    decimalPrecision: { type: Number, default: 3, min: 0, max: 6 },
    purchasePrice: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, default: 0, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    retailPrice: { type: Number, default: 0, min: 0 },
    minimumSalePrice: { type: Number, default: 0, min: 0 },
    maximumDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    costingMethod: { type: String, enum: ['weighted-average', 'fifo', 'lifo'], default: 'weighted-average' },
    tax: { type: Number, default: 0, min: 0, max: 100 },
    taxProfile: {
      name: String,
      rate: { type: Number, min: 0, max: 100 },
      inclusive: { type: Boolean, default: false },
    },
    priceEffectiveFrom: Date,
    priceHistory: [
      {
        effectiveFrom: { type: Date, default: Date.now },
        purchasePrice: Number,
        salePrice: Number,
        wholesalePrice: Number,
        retailPrice: Number,
        minimumSalePrice: Number,
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reason: String,
      },
    ],
    openingStock: { type: Number, default: 0, min: 0 },
    availableStock: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    committedQuantity: { type: Number, default: 0, min: 0 },
    damagedQuantity: { type: Number, default: 0, min: 0 },
    expiredQuantity: { type: Number, default: 0, min: 0 },
    minimumStock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    image: String,
    images: [String],
    expiryDate: Date,
    active: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
productSchema.index({ isDeleted: 1, active: 1, createdAt: -1 });
productSchema.index({ category: 1, brand: 1 });
export const Product = models.Product || model('Product', productSchema);
const line = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
    name: String,
    unit: String,
    quantity: { type: Number, required: true, min: 0.000001 },
    baseQuantity: { type: Number, required: true, min: 0.000001 },
    returnedQuantity: { type: Number, default: 0, min: 0 },
    fulfilledQuantity: { type: Number, default: 0, min: 0 },
    weight: { type: Number, default: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
export const Purchase =
  models.Purchase ||
  model(
    'Purchase',
    new Schema(
      {
        purchaseNo: { type: String, unique: true, sparse: true, index: true },
        supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
        date: { type: Date, default: Date.now, index: true },
        items: [line],
        weight: { type: Number, default: 0 },
        rate: { type: Number, default: 0 },
        transport: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        expenses: { type: Number, default: 0 },
        total: { type: Number, required: true },
        payment: { type: Number, default: 0 },
        remaining: { type: Number, default: 0 },
        paymentMethod: String,
        vehicle: String,
        driver: String,
        status: { type: String, enum: ['draft', 'confirmed', 'received', 'cancelled'], default: 'confirmed' },
        reference: String,
        attachments: [String],
        notes: String,
      },
      base,
    ),
  );
export const Sale =
  models.Sale ||
  model(
    'Sale',
    new Schema(
      {
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
        creditApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        village: String,
        date: { type: Date, default: Date.now, index: true },
        items: [line],
        discount: { type: Number, default: 0 },
        transport: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
        grandTotal: { type: Number, default: 0 },
        total: { type: Number, required: true },
        payment: { type: Number, default: 0 },
        remaining: { type: Number, default: 0 },
        paymentMethod: {
          type: String,
          enum: ['cash', 'bank', 'card', 'online', 'cheque', 'credit', 'other'],
          default: 'cash',
        },
        status: {
          type: String,
          enum: ['draft', 'confirmed', 'fulfilled', 'paid', 'partial', 'cancelled'],
          default: 'confirmed',
        },
        dueDate: { type: Date, index: true },
        invoiceNo: { type: String, unique: true, sparse: true, index: true },
        shareToken: { type: String, index: true },
        attachments: [String],
        notes: String,
      },
      base,
    ),
  );
export const Ledger =
  models.Ledger ||
  model(
    'Ledger',
    new Schema(
      {
        partyType: { type: String, enum: ['customer', 'supplier'], required: true },
        party: { type: Schema.Types.ObjectId, required: true, refPath: 'partyModel' },
        partyModel: { type: String, enum: ['Customer', 'Supplier'], required: true },
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ['credit', 'debit'], required: true },
        amount: { type: Number, required: true },
        description: String,
        referenceType: String,
        referenceId: Schema.Types.ObjectId,
        balanceAfter: Number,
      },
      base,
    ),
  );
export const Expense =
  models.Expense ||
  model(
    'Expense',
    new Schema(
      {
        expenseNo: { type: String, unique: true, sparse: true, index: true },
        date: { type: Date, default: Date.now, index: true },
        category: { type: String, required: true, index: true },
        amount: { type: Number, required: true, min: 0 },
        description: String,
        paymentMethod: { type: String, enum: ['cash', 'bank', 'card', 'online', 'cheque', 'other'], default: 'cash' },
        reference: String,
        vendor: String,
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
        status: {
          type: String,
          enum: ['draft', 'pending', 'approved', 'rejected', 'paid'],
          default: 'approved',
          index: true,
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedAt: Date,
        attachments: [String],
        notes: String,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      base,
    ),
  );
export const Lead =
  models.Lead ||
  model(
    'Lead',
    new Schema(
      {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        village: String,
        interest: String,
        message: String,
        status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' },
      },
      base,
    ),
  );
export const Setting =
  models.Setting ||
  model('Setting', new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed }, base));

// Milestone 6 transaction hardening extensions.
Sale.schema.add({
  idempotencyKey: { type: String, unique: true, sparse: true, index: true },
  stateHistory: [{ state: String, at: Date, by: { type: Schema.Types.ObjectId, ref: 'User' }, reason: String }],
  deliveryStatus: {
    type: String,
    enum: ['unfulfilled', 'partially-fulfilled', 'fulfilled', 'cancelled'],
    default: 'unfulfilled',
    index: true,
  },
  reservedAt: Date,
  fulfilledAt: Date,
  returnedTotal: { type: Number, default: 0, min: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
});
Purchase.schema.add({
  warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', index: true },
  supplierInvoiceNo: { type: String, trim: true },
  idempotencyKey: { type: String, unique: true, sparse: true, index: true },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  stateHistory: [{ state: String, at: Date, by: { type: Schema.Types.ObjectId, ref: 'User' }, reason: String }],
  confirmedAt: Date,
  confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  receivedAt: Date,
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  goodsReceipt: { type: Schema.Types.ObjectId, ref: 'GoodsReceipt' },
  returnedTotal: { type: Number, default: 0, min: 0 },
  landedCostTotal: { type: Number, default: 0, min: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
});
Purchase.schema.index(
  { supplier: 1, supplierInvoiceNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      supplierInvoiceNo: { $type: 'string' },
    },
  },
);
Expense.schema.add({
  taxRate: { type: Number, default: 0, min: 0, max: 100 },
  taxAmount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, default: 0, min: 0 },
  categoryRef: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory' },
  account: { type: Schema.Types.ObjectId, ref: 'CashAccount' },
  payee: { type: Schema.Types.ObjectId, refPath: 'payeeModel' },
  payeeModel: { type: String, enum: ['Supplier', 'Customer'] },
  approvalLevel: { type: Number, default: 0, min: 0 },
  approvalHistory: [
    {
      level: Number,
      status: { type: String, enum: ['approved', 'rejected'] },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date, default: Date.now },
      reason: String,
    },
  ],
  rejectionReason: String,
  paidAt: Date,
  paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
  payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
  voucherNo: { type: String, unique: true, sparse: true, index: true },
  reversedAt: Date,
  reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reversalReason: String,
  recurring: {
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
    nextRunAt: Date,
  },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
