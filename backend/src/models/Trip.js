import { mongoose } from '../config/db.js';

const TripVillageProgressSchema = new mongoose.Schema(
  {
    villageId: String,
    villageName: String,
    sequence: Number,
    latitude: Number,
    longitude: Number,
    crossed: { type: Boolean, default: false },
    crossedAt: Date,
    consecutivePings: { type: Number, default: 0 }, // Track crossing count directly in document
    status: { type: String, enum: ['pending', 'current', 'crossed'], default: 'pending' },
    autoBackfilled: { type: Boolean, default: false },
  },
  { _id: false },
);

const TripSchema = new mongoose.Schema(
  {
    tripId: { type: String, required: true, unique: true, index: true },
    busId: { type: String, required: true },
    driverId: { type: String, required: true },
    routeId: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    direction: { type: String, enum: ['to_college', 'from_college'], default: 'to_college' },
    tripType: { type: String, default: '' },
    routeProgress: { type: [TripVillageProgressSchema], default: [] },
    totalDistanceKm: { type: Number, default: 0 },
    remainingDistanceKm: { type: Number, default: 0 },
    currentSpeedKmph: { type: Number, default: 0 },
    currentLocation: {
      latitude: Number,
      longitude: Number,
      speed: Number,
      heading: Number,
      timestamp: Date,
    },
    routePath: {
      type: { type: String, enum: ['LineString'], default: 'LineString' },
      coordinates: { type: [[Number]], default: [] }, // Array of [longitude, latitude]
    },
    lastUpdatedAt: Date,
    routeSnapshot: { type: Array, default: [] },
    routeSnapshotHash: { type: String, default: '' },
    scannerEnabled: { type: Boolean, default: false },
    summary: {
      averageSpeedKmph: Number,
      maxSpeedKmph: Number,
      villagesCrossed: Number,
      durationMinutes: Number,
      totalBoarded: { type: Number, default: 0 },
      totalDropped: { type: Number, default: 0 },
      peakOccupancy: { type: Number, default: 0 },
      averageOccupancy: { type: Number, default: 0 },
    },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Compound indexing
TripSchema.index({ busId: 1, status: 1 });
TripSchema.index({ driverId: 1, status: 1 });

// Partial unique index preventing concurrent active trips for the same bus
TripSchema.index(
  { busId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

export const Trip = mongoose.models.Trip || mongoose.model('Trip', TripSchema);
