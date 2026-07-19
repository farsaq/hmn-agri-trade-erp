import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const options = { timestamps: true };
export const AIQueryLog =
  models.AIQueryLog ||
  model(
    'AIQueryLog',
    new Schema(
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        question: { type: String, required: true },
        intent: String,
        answer: String,
        data: Schema.Types.Mixed,
        provider: { type: String, default: 'local-analytics' },
        durationMs: Number,
        error: String,
      },
      options,
    ),
  );
