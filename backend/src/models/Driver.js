import { mongoose } from '../config/db.js';

const DriverSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    driver_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    license: { type: String, default: '' },
    bus_id: { type: String, default: '' },
    bus_number: { type: String, default: '' },
    route_name: { type: String, default: '' },
    routeName: { type: String, default: '' },
    password: { type: String, default: 'driver123' },
    status: { type: String, default: 'Available' },
  },
  { timestamps: true }
);

export const Driver = mongoose.models.Driver || mongoose.model('Driver', DriverSchema);
