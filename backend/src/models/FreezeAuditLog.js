import { mongoose } from '../config/db.js';

const FreezeAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['freeze', 'unfreeze'], required: true },
    adminId: { type: String, required: true },
    adminName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

export const FreezeAuditLog = mongoose.models.FreezeAuditLog || mongoose.model('FreezeAuditLog', FreezeAuditLogSchema);
