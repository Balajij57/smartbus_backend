import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { BusRoute } from './src/models/BusRoute.js';
import { rebuildBusRoute } from './src/services/routeService.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  console.log('\n=== 1. Loading BUS-03 Students ===');
  const students = await Student.find({
    'bus_details.bus_number': 'BUS-03',
    status: 'active'
  }).lean();
  console.log(`Found ${students.length} active students on BUS-03.`);

  console.log('\n=== 2. Printing Boarding Points ===');
  students.forEach(s => {
    console.log(` - ${s.name}: ${s.bus_details?.boarding_point || 'Unknown'}`);
  });

  console.log('\n=== 3. Generating Route ===');
  const stops = await rebuildBusRoute('BUS-03');

  console.log('\n=== 4. Printing Route Sequence ===');
  stops.forEach(s => {
    console.log(`Stop ${s.sequence}: ${s.stopName} (${s.studentCount || 0} students)`);
  });

  console.log('\n=== 5. Verifying Venkatapuram and Student Count ===');
  const venkatapuramStop = stops.find(s => s.stopName === 'Venkatapuram');
  if (!venkatapuramStop) {
    console.error('FAIL: Venkatapuram does not exist in generated route stops!');
    process.exit(1);
  }
  console.log(`Found Venkatapuram stop! Students count: ${venkatapuramStop.studentCount}`);

  const adityaStop = stops.find(s => s.stopName === 'Aditya University');
  if (!adityaStop) {
    console.error('FAIL: Aditya University destination stop does not exist!');
    process.exit(1);
  }
  console.log(`Found Aditya University stop!`);

  console.log('\nPASS');

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
