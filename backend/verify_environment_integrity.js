import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getConfigs } from './src/config/configService.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  console.log('\n=== Verifying Environment configurations and central settings ===');
  const configs = getConfigs();
  console.log('Centralized configs parsed:', configs);

  if (configs.DEMO_MODE === true && configs.TWILIO_ENABLED === true) {
    throw new Error('Conflict error: DEMO_MODE and TWILIO_ENABLED cannot both be true.');
  }

  console.log('✓ verify_environment_integrity passed.');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('FAIL:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
