import { mongoose } from '../config/db.js';

const NotificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    to: { type: String, enum: ['parent', 'admin'], required: true },
    parent_id: { type: String, default: '' },
    student_id: { type: String, default: '' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    time: { type: String, required: true },
    date: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
