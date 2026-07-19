import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const opt = { timestamps: true };
export const CashAccount =
  models.CashAccount ||
  model(
    'CashAccount',
    new Schema(
      {
        accountCode: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ['cash', 'bank', 'mobile-wallet', 'clearing'], required: true, index: true },
        currency: { type: String, default: 'PKR' },
        balance: { type: Number, default: 0 },
        active: { type: Boolean, default: true, index: true },
        bankName: String,
        accountNumber: String,
        iban: String,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
export const AccountEntry =
  models.AccountEntry ||
  model(
    'AccountEntry',
    new Schema(
      {
        account: { type: Schema.Types.ObjectId, ref: 'CashAccount', required: true, index: true },
        type: { type: String, enum: ['debit', 'credit'], required: true },
        amount: { type: Number, required: true, min: 0.000001 },
        balanceAfter: { type: Number, required: true },
        description: String,
        referenceType: String,
        referenceId: Schema.Types.ObjectId,
        reversalOf: { type: Schema.Types.ObjectId, ref: 'AccountEntry' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      opt,
    ),
  );
