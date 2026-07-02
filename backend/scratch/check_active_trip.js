import mongoose from 'mongoose';
import { Trip } from '../src/models/Trip.js';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/smartbus', {
    serverSelectionTimeoutMS: 2000
  });
  console.log('Connected to MongoDB');
  const trips = await Trip.find({ status: 'active' }).lean();
  console.log('Active Trips:', JSON.stringify(trips, null, 2));
  await mongoose.disconnect();
}
run().catch(console.error);
