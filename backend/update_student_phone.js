import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');
  
  // Update STU001 parent_phone
  const result = await Student.updateOne(
    { _id: 'STU001' },
    { $set: { parent_phone: '+919398242398' } }
  );
  console.log('Update result:', result);
  
  const student = await Student.findOne({ _id: 'STU001' }).lean();
  console.log('\n=== Updated Student STU001 Details ===');
  console.log('Student Name:', student.name);
  console.log('Register Number:', student.register_no);
  console.log('parent_phone:', student.parent_phone);
  
  await mongoose.disconnect();
}

run().catch(console.error);
