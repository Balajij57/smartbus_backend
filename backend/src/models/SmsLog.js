import { mongoose } from '../config/db.js';

const SmsLogSchema = new mongoose.Schema(
  {
    smsId: { type: String, required: true, unique: true, index: true },
    to: { type: String, required: true },
    body: { type: String, required: true },
    provider: { type: String, default: 'console' },
    status: { type: String, enum: ['sent', 'failed', 'pending', 'logged-only', 'demo-sent', 'skipped'], default: 'pending' },
    error: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const SmsLog = mongoose.models.SmsLog || mongoose.model('SmsLog', SmsLogSchema);
