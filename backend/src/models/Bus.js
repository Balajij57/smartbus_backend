import { mongoose } from '../config/db.js';

const BusSchema = new mongoose.Schema(
  {
    busId: { type: String, required: true, unique: true, index: true },
    busNumber: { type: String, required: true, unique: true },
    busName: { type: String, default: '' },
    vehicleNumber: { type: String, unique: true, sparse: true },
    capacity: { type: Number, default: 40 },
    routeId: { type: String, default: '', index: true },
    routeName: { type: String, default: '' },
    active: { type: Boolean, default: true },
    driverId: { type: String, default: '' },
    status: { type: String, enum: ['inactive', 'active', 'paused', 'maintenance'], default: 'inactive' },
    currentTripId: { type: String, default: null },
    currentVillageId: { type: String, default: null },
    nextVillageId: { type: String, default: null },
    lastKnownLocation: {
      latitude: Number,
      longitude: Number,
      speed: Number,
      heading: Number,
      timestamp: Date,
    },
  },
  { timestamps: true },
);

export const Bus = mongoose.models.Bus || mongoose.model('Bus', BusSchema);
