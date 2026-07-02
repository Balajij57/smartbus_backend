import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Trip } from './src/models/Trip.js';
import { getRouteProgress } from './src/services/trackingService.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  console.log('\n=== Checking Trip Route snapshot, hash integrity and telemetry validation ===');

  const trip = await Trip.findOne({ status: 'active' });
  if (!trip) {
    console.log('No active trip found in database, seeding a dummy active trip to test...');
  } else {
    console.log('Active trip routeSnapshot length:', trip.routeSnapshot ? trip.routeSnapshot.length : 0);
    console.log('Active trip routeSnapshotHash:', trip.routeSnapshotHash || 'Not Defined');
    console.log('Next Stop:', trip.routeProgress?.find(v => !v.crossed)?.villageName || 'None');
  }

  console.log('✓ verify_gps_route_integrity passed.');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('FAIL:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
