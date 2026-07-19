import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const base = { timestamps: true };

const accountSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, index: true },
    type: { type: String, required: true, enum: ['asset', 'liability', 'equity', 'income', 'expense'], index: true },
    subtype: { type: String, trim: true, index: true },
    category: { type: String, trim: true, index: true },
    reportingGroup: { type: String, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 1000 },
    displayOrder: { type: Number, default: 0, min: 0, index: true },
    reportingSequence: { type: Number, default: 0, min: 0, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
    level: { type: Number, default: 0, min: 0 },
    path: [{ type: Schema.Types.ObjectId, ref: 'Account' }],
    normalBalance: { type: String, enum: ['debit', 'credit'], required: true },
    systemKey: { type: String, unique: true, sparse: true, index: true },
    currency: { type: String, default: 'PKR', uppercase: true },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    allowManualPosting: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
    isControlAccount: { type: Boolean, default: false },
    controlAccountKey: { type: String, trim: true, sparse: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
accountSchema.index({ parent: 1, code: 1 });
accountSchema.index({ type: 1, active: 1, isDeleted: 1 });
accountSchema.index({ type: 1, category: 1, reportingGroup: 1, displayOrder: 1 });
export const Account = models.Account || model('Account', accountSchema);

const dimensionSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    active: { type: Boolean, default: true, index: true },
    description: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
export const CostCenter = models.CostCenter || model('CostCenter', dimensionSchema);
export const Department = models.Department || model('Department', dimensionSchema);
export const Project = models.Project || model('Project', dimensionSchema);
export const Branch = models.Branch || model('Branch', dimensionSchema);

const fiscalYearSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    baseCurrency: { type: String, default: 'PKR', uppercase: true },
    closedAt: Date,
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
fiscalYearSchema.index({ startDate: 1, endDate: 1 }, { unique: true });
export const FiscalYear = models.FiscalYear || model('FiscalYear', fiscalYearSchema);

const periodSchema = new Schema(
  {
    fiscalYear: { type: Schema.Types.ObjectId, ref: 'FiscalYear', required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ['open', 'locked', 'closed'], default: 'open', index: true },
    lockedAt: Date,
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lockReason: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
periodSchema.index({ fiscalYear: 1, startDate: 1, endDate: 1 }, { unique: true });
export const AccountingPeriod = models.AccountingPeriod || model('AccountingPeriod', periodSchema);

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: String,
    size: Number,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const journalLineSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    accountCode: { type: String, required: true },
    accountName: { type: String, required: true },
    description: String,
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    foreignDebit: { type: Number, default: 0, min: 0 },
    foreignCredit: { type: Number, default: 0, min: 0 },
    partyType: { type: String, enum: ['customer', 'supplier', 'employee', 'other'] },
    party: Schema.Types.ObjectId,
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    costCenter: { type: Schema.Types.ObjectId, ref: 'CostCenter' },
    department: { type: Schema.Types.ObjectId, ref: 'Department' },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { _id: true },
);

const approvalSchema = new Schema(
  {
    action: { type: String, enum: ['submitted', 'approved', 'rejected', 'posted', 'reversed', 'updated'] },
    level: { type: Number, default: 1 },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    reason: String,
    requestId: String,
    ip: String,
    userAgent: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  },
  { _id: true },
);

const journalSchema = new Schema(
  {
    journalNo: { type: String, required: true, unique: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    type: {
      type: String,
      enum: ['manual', 'sale', 'purchase', 'receipt', 'payment', 'expense', 'adjustment', 'opening', 'reversal'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending-approval', 'approved', 'rejected', 'posted', 'reversed'],
      default: 'draft',
      index: true,
    },
    narration: { type: String, required: true, trim: true },
    reference: { type: String, trim: true, index: true, sparse: true },
    referenceDocumentNo: String,
    idempotencyKey: { type: String, unique: true, sparse: true, index: true },
    sourceType: { type: String, index: true },
    sourceId: { type: Schema.Types.ObjectId, index: true },
    sourceEvent: { type: String, default: 'posted' },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    reversedByJournal: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reversedAt: Date,
    reversalReason: String,
    fiscalYear: { type: Schema.Types.ObjectId, ref: 'FiscalYear', index: true },
    accountingPeriod: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod', index: true },
    currency: { type: String, default: 'PKR', uppercase: true },
    baseCurrency: { type: String, default: 'PKR', uppercase: true },
    exchangeRate: { type: Number, default: 1, min: 0.000001 },
    lines: { type: [journalLineSchema], validate: (v) => Array.isArray(v) && v.length >= 2 },
    totalDebit: { type: Number, required: true, min: 0 },
    totalCredit: { type: Number, required: true, min: 0 },
    attachments: [attachmentSchema],
    approvalLevel: { type: Number, default: 0 },
    requiredApprovalLevel: { type: Number, default: 1, min: 1 },
    approvalHistory: [approvalSchema],
    submittedAt: Date,
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
    postedAt: Date,
    postedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: Schema.Types.Mixed,
  },
  base,
);
journalSchema.index({ sourceType: 1, sourceId: 1, sourceEvent: 1 }, { unique: true, sparse: true });
journalSchema.index({ date: -1, status: 1 });
journalSchema.index({ reference: 1, type: 1 }, { unique: true, sparse: true });
export const JournalEntry = models.JournalEntry || model('JournalEntry', journalSchema);

const glSchema = new Schema(
  {
    journal: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true, index: true },
    journalLineId: { type: Schema.Types.ObjectId, required: true },
    journalNo: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    accountCode: { type: String, required: true, index: true },
    description: String,
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    foreignDebit: { type: Number, default: 0, min: 0 },
    foreignCredit: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'PKR' },
    baseCurrency: { type: String, default: 'PKR' },
    exchangeRate: { type: Number, default: 1 },
    sourceType: String,
    sourceId: Schema.Types.ObjectId,
    isReversal: { type: Boolean, default: false, index: true },
    reversalOfJournal: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    partyType: String,
    party: Schema.Types.ObjectId,
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    costCenter: { type: Schema.Types.ObjectId, ref: 'CostCenter' },
    department: { type: Schema.Types.ObjectId, ref: 'Department' },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
glSchema.index({ account: 1, date: 1, _id: 1 });
glSchema.index({ sourceType: 1, sourceId: 1 });
glSchema.index({ journal: 1, journalLineId: 1 }, { unique: true });
export const GeneralLedgerEntry = models.GeneralLedgerEntry || model('GeneralLedgerEntry', glSchema);

const recurringSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    template: { type: Schema.Types.ObjectId, ref: 'JournalTemplate', required: true },
    frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
    nextRunAt: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    lastRunAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
export const RecurringJournal = models.RecurringJournal || model('RecurringJournal', recurringSchema);

const templateSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    narration: String,
    type: { type: String, enum: ['manual', 'adjustment', 'opening'], default: 'manual' },
    lines: [journalLineSchema],
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  base,
);
export const JournalTemplate = models.JournalTemplate || model('JournalTemplate', templateSchema);
