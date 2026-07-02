import { mongoose } from '../config/db.js';

const AlertSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    time: { type: String, required: true },
    date: { type: String, required: true },
    bus: { type: String, required: true },
    driver_id: { type: String, default: '' },
    driver_name: { type: String, default: '' },
    type: { type: String, enum: ['Delay', 'Emergency'], default: 'Delay' },
    category: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Resolved'], default: 'Active' },
  },
  { timestamps: true }
);

export const Alert = mongoose.models.Alert || mongoose.model('Alert', AlertSchema);
