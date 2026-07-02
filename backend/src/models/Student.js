import { mongoose } from '../config/db.js';

const StudentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    register_no: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    gender: { type: String, default: 'Male' },
    year: { type: String, default: '' },
    department: { type: String, default: '' },
    section: { type: String, default: '' },
    date_of_birth: { type: String, default: '' },
    address: {
      door_no: { type: String, default: '' },
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },
    bus_details: {
      bus_id: { type: String, default: '' },
      bus_number: { type: String, default: '' },
      route_name: { type: String, default: '' },
      routeName: { type: String, default: '' },
      boarding_point: { type: String, default: '' },
    },
    parent_id: { type: String, default: '' },
    driver_id: { type: String, default: '' },
    qr_student_id: { type: String, default: '' },
    profile_photo: { type: String, default: '' },
    password: { type: String, default: 'student123' },
    parent_password: { type: String, default: 'parent123' },
    parent_phone: { type: String, default: '' },
    parent_email: { type: String, default: '' },
    home_latitude: { type: Number, default: 0 },
    home_longitude: { type: Number, default: 0 },
    boardingPoint: { type: String, default: '' },
    landmark: { type: String, default: '' },
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
    allowedRadiusMeters: { type: Number, default: 1000 },
    trackingStatus: { type: String, enum: ['REACHED_HOME', 'BOARDED_TO_COLLEGE', 'REACHED_COLLEGE', 'BOARDED_FROM_COLLEGE'], default: 'REACHED_HOME' },
    attendanceException: { type: String, enum: ['Sick Leave', 'Absent', 'Parent Pickup', 'Emergency Exit', ''], default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

export const Student = mongoose.models.Student || mongoose.model('Student', StudentSchema);
