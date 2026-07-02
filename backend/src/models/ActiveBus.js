import { mongoose } from '../config/db.js';

const ActiveBusSchema = new mongoose.Schema(
  {
    busId: { type: String, required: true, unique: true, index: true },
    busNumber: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    lastUpdatedAt: { type: Date, default: Date.now },
    currentTripId: { type: String, required: true },
    routeProgress: { type: Array, default: [] },
    currentStopIndex: { type: Number, default: 0 },
    nextStopIndex: { type: Number, default: 1 },
    lastGpsUpdateAt: { type: Date },
    lastGpsSource: { type: String },
    lastGpsAccuracy: { type: Number },
    gpsPacketsReceived: { type: Number, default: 0 },
    gpsPacketsRejected: { type: Number, default: 0 },
    accuracy: { type: Number },
    packetCount: { type: Number, default: 0 },
    lastTelemetryStatus: { type: String, default: 'active' },
  },
  { timestamps: true }
);

ActiveBusSchema.index({ location: '2dsphere' });

export const ActiveBus = mongoose.models.ActiveBus || mongoose.model('ActiveBus', ActiveBusSchema);
