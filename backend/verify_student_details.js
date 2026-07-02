import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');
  
  // Find STU001
  const student = await Student.findOne({ _id: 'STU001' }).lean();
  console.log('\n=== Student STU001 Details ===');
  console.log(JSON.stringify(student, null, 2));
  
  await mongoose.disconnect();
}

run().catch(console.error);
