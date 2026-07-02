import { mongoose } from '../config/db.js';

const TrackingEventSchema = new mongoose.Schema(
  {
    tripId: { type: String, required: true, index: true },
    busId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['trip-started', 'village-crossed', 'offline', 'reconnected', 'trip-stopped'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const TrackingEvent = mongoose.models.TrackingEvent || mongoose.model('TrackingEvent', TrackingEventSchema);
