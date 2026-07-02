import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { normalizeLatLng } from './src/utils/coordResolver.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  console.log('\n=== Verifying Coordinate priority resolving and drift logic ===');
  
  // Test coordinate resolution with drift detection
  const normalized = normalizeLatLng(82.0665, 17.0912); // Swapped inputs
  console.log('Normalized coordinates:', normalized);
  
  if (Math.abs(normalized.latitude - 17.0912) > 0.0001) {
    throw new Error('Coordinate priority mismatch: expected normalization to correct Lat/Lng swap.');
  }

  console.log('✓ verify_coordinate_consistency passed.');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('FAIL:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
