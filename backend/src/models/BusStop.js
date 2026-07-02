import { mongoose } from '../config/db.js';

const BusStopSchema = new mongoose.Schema(
  {
    stopName: { type: String, required: true, unique: true, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    landmark: { type: String, default: '' },
    radiusMeters: { type: Number, default: 1000 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const BusStop = mongoose.models.BusStop || mongoose.model('BusStop', BusStopSchema);
