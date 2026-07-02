import { mongoose } from '../config/db.js';

const ScanLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    student_id: { type: String, required: true, index: true },
    student_name: { type: String, required: true },
    register_no: { type: String, required: true, index: true },
    action: { type: String, enum: ['board', 'dropoff'], required: true },
    scanMode: { type: String, default: '' },
    tripType: { type: String, default: '' },
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
    smsStatus: { type: String, default: '' },
    bus_number: { type: String, required: true },
    driver_id: { type: String, default: '' },
    trip_id: { type: String, default: '' },
    time: { type: String, required: true },
    date: { type: String, required: true },
    result: { type: String, default: 'success' },
    failureReason: { type: String, default: '' },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const ScanLog = mongoose.models.ScanLog || mongoose.model('ScanLog', ScanLogSchema);
