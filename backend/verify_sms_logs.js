import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SmsLog } from './src/models/SmsLog.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');
  
  // Find the latest SMS log
  const latestLog = await SmsLog.findOne().sort({ createdAt: -1 }).lean();
  console.log('\n=== Latest SMS Log Document in MongoDB ===');
  console.log(JSON.stringify(latestLog, null, 2));
  
  await mongoose.disconnect();
}

run().catch(console.error);
