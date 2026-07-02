import mongoose from 'mongoose';
import { LiveLocation } from '../src/models/LiveLocation.js';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/smartbus', {
    serverSelectionTimeoutMS: 2000
  });
  console.log('Connected to MongoDB');
  const logs = await LiveLocation.find({}).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Latest GPS logs:', JSON.stringify(logs, null, 2));
  await mongoose.disconnect();
}
run().catch(console.error);
