import { mongoose } from '../config/db.js';

const LiveLocationSchema = new mongoose.Schema(
  {
    busId: { type: String, required: true, index: true },
    tripId: { type: String, required: true, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    source: { type: String, enum: ['driver-mobile'], default: 'driver-mobile' },
    timestamp: { type: Date, required: true, index: true },
    suspicious: { type: Boolean, default: false },
    anomaly: { type: Boolean, default: false },
    reason: { type: String, default: '' },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

LiveLocationSchema.index({ busId: 1, timestamp: -1 });

export const LiveLocation = mongoose.models.LiveLocation || mongoose.model('LiveLocation', LiveLocationSchema);
