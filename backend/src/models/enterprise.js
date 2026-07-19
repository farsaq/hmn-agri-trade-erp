import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const opt = { timestamps: true };
const warehouseSchema = new Schema(
  {
    warehouseCode: { type: String, required: true, unique: true, sparse: true, index: true, immutable: true },
    name: { type: String, required: true, trim: true, index: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, trim: true, index: true },
    type: {
      type: String,
      enum: ['main', 'branch', 'distribution', 'cold-storage', 'transit', 'returns', 'other'],
      default: 'branch',
      index: true,
    },
    address: String,
    city: { type: String, index: true },
    district: { type: String, index: true },
    province: String,
    postalCode: String,
    manager: String,
    managerName: String,
    managerPhone: String,
    managerEmail: { type: String, lowercase: true, trim: true },
    capacity: { type: Number, default: 0, min: 0 },
    capacityUnit: { type: String, default: 'kg' },
    currentUtilization: { type: Number, default: 0, min: 0 },
    isDefault: { type: Boolean, default: false, index: true },
    active: { type: Boolean, default: true, index: true },
    assignedUsers: [{ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, permissions: [String] }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opt,
);
warehouseSchema.index({ isDeleted: 1, active: 1, createdAt: -1 });
export const Warehouse = models.Warehouse || model('Warehouse', warehouseSchema);
const unitSchema = new Schema(
  {
    unitCode: { type: String, required: true, unique: true, sparse: true, index: true, immutable: true },
    name: { type: String, required: true, trim: true, index: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    symbol: { type: String, required: true, trim: true },
    normalizedSymbol: { type: String, required: true, unique: true, index: true },
    category: {
      type: String,
      enum: ['weight', 'quantity', 'volume', 'length', 'packaging'],
      required: true,
      index: true,
    },
    isBase: { type: Boolean, default: false, index: true },
    baseUnit: { type: Schema.Types.ObjectId, ref: 'Unit' },
    ratioToBase: { type: Number, default: 1, min: 0.000000001 },
    decimalPrecision: { type: Number, default: 3, min: 0, max: 6 },
    system: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opt,
);
unitSchema.index({ category: 1, isDeleted: 1, active: 1 });
export const Unit = models.Unit || model('Unit', unitSchema);
export const UnitConversionAudit =
  models.UnitConversionAudit ||
  model(
    'UnitConversionAudit',
    new Schema(
      {
        fromUnit: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
        toUnit: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
        inputQuantity: { type: Number, required: true },
        outputQuantity: { type: Number, required: true },
        fromRatio: Number,
        toRatio: Number,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const InventoryMovement =
  models.InventoryMovement ||
  model(
    'InventoryMovement',
    new Schema(
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
        type: {
          type: String,
          enum: ['stock-in', 'stock-out', 'transfer', 'adjustment', 'damage', 'return', 'expiry'],
          required: true,
        },
        quantity: { type: Number, required: true },
        fromWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
        toWarehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
        reason: String,
        reference: String,
        batchNo: String,
        expiryDate: Date,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const Vehicle =
  models.Vehicle ||
  model(
    'Vehicle',
    new Schema(
      {
        registrationNo: { type: String, required: true, unique: true },
        type: String,
        driverName: String,
        driverPhone: String,
        fuelType: String,
        status: { type: String, default: 'active' },
        lastServiceDate: Date,
        notes: String,
      },
      opt,
    ),
  );
export const Payment =
  models.Payment ||
  model(
    'Payment',
    new Schema(
      {
        partyType: { type: String, enum: ['customer', 'supplier'], required: true },
        party: { type: Schema.Types.ObjectId, required: true, refPath: 'partyModel' },
        partyModel: { type: String, enum: ['Customer', 'Supplier'], required: true },
        amount: { type: Number, required: true },
        method: { type: String, enum: ['cash', 'bank', 'card', 'online', 'cheque', 'other'], default: 'cash' },
        reference: String,
        date: { type: Date, default: Date.now },
        notes: String,
      },
      opt,
    ),
  );
export const Attachment =
  models.Attachment ||
  model(
    'Attachment',
    new Schema(
      {
        entityType: String,
        entityId: Schema.Types.ObjectId,
        name: String,
        url: String,
        mimeType: String,
        size: Number,
        category: { type: String, default: 'general' },
        description: String,
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const Role =
  models.Role ||
  model(
    'Role',
    new Schema(
      {
        name: { type: String, required: true, unique: true },
        description: String,
        permissions: [String],
        system: { type: Boolean, default: false },
      },
      opt,
    ),
  );
export const BackupRecord =
  models.BackupRecord ||
  model(
    'BackupRecord',
    new Schema(
      {
        name: String,
        type: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
        status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
        location: String,
        size: Number,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        error: String,
      },
      opt,
    ),
  );
export const Integration =
  models.Integration ||
  model(
    'Integration',
    new Schema(
      {
        provider: { type: String, required: true, unique: true },
        enabled: { type: Boolean, default: false },
        config: Schema.Types.Mixed,
        lastTestAt: Date,
        status: String,
      },
      opt,
    ),
  );
export const CompanyProfile =
  models.CompanyProfile ||
  model(
    'CompanyProfile',
    new Schema(
      {
        name: { type: String, default: 'HMN Agri Trade' },
        logo: String,
        phone: String,
        email: String,
        address: String,
        ntn: String,
        terms: String,
        signature: String,
        theme: Schema.Types.Mixed,
      },
      opt,
    ),
  );

export const NotificationPreference =
  models.NotificationPreference ||
  model(
    'NotificationPreference',
    new Schema(
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        events: {
          lowStock: { type: Boolean, default: true },
          expiry: { type: Boolean, default: true },
          pendingPayment: { type: Boolean, default: true },
          overdueBalance: { type: Boolean, default: true },
          sale: { type: Boolean, default: true },
          purchase: { type: Boolean, default: true },
          expenseApproval: { type: Boolean, default: true },
        },
      },
      opt,
    ),
  );
