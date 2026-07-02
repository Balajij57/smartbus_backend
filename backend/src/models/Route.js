import { mongoose } from '../config/db.js';

const VillageSchema = new mongoose.Schema(
  {
    villageId: { type: String, required: true },
    villageName: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    sequence: { type: Number, required: true },
    radiusMeters: { type: Number, default: 250 },
    kind: { type: String, enum: ['origin', 'village', 'college'], default: 'village' },
  },
  { _id: false },
);

const RouteSchema = new mongoose.Schema(
  {
    routeId: { type: String, required: true, unique: true, index: true },
    routeName: { type: String, required: true },
    collegeLocation: {
      name: { type: String, default: 'College' },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    villages: { type: [VillageSchema], default: [] },
  },
  { timestamps: true },
);

export const Route = mongoose.models.Route || mongoose.model('Route', RouteSchema);
