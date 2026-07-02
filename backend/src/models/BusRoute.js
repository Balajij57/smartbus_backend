import { mongoose } from '../config/db.js';

const StopSchema = new mongoose.Schema(
  {
    stopName: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    studentCount: { type: Number, default: 0 },
    allowedRadiusMeters: { type: Number, default: 1000 },
    landmark: { type: String, default: '' },
    sequence: { type: Number, required: true }
  },
  { _id: false }
);

const BusRouteSchema = new mongoose.Schema(
  {
    busNumber: { type: String, required: true, unique: true, index: true },
    stops: { type: [StopSchema], default: [] }
  },
  { timestamps: true }
);

export const BusRoute = mongoose.models.BusRoute || mongoose.model('BusRoute', BusRouteSchema);
