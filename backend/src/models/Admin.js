import { mongoose } from '../config/db.js';

const AdminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

export const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
