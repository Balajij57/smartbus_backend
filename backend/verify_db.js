import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Bus } from './src/models/Bus.js';
import { Route } from './src/models/Route.js';
import { Student } from './src/models/Student.js';
import { Driver } from './src/models/Driver.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('\n=== Collection Counts ===');
  for (const col of collections) {
    const count = await mongoose.connection.db.collection(col.name).countDocuments();
    console.log(` - ${col.name}: ${count} documents`);
  }

  // Get a sample bus document
  const sampleBus = await Bus.findOne().lean();
  console.log('\n=== Sample Bus Document ===', JSON.stringify(sampleBus, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
