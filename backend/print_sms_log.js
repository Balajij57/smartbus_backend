import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SmsLog } from './src/models/SmsLog.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  const log = await SmsLog.findOne().sort({ createdAt: -1 }).lean();
  console.log('=== Sample SmsLog Document from MongoDB ===');
  console.log(JSON.stringify(log, null, 2));
  await mongoose.disconnect();
}

run();
