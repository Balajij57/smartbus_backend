import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { rebuildBusRoute } from './src/services/routeService.js';
import { BusRoute } from './src/models/BusRoute.js';
import { BusStop } from './src/models/BusStop.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  console.log('\n=== Verifying Route Stop studentCount dynamically and deletions ===');
  
  const testBusNumber = 'BUS-TEST-1200';
  
  // Seed test student
  await Student.deleteMany({ _id: { $in: ['STU_TEST_A', 'STU_TEST_B', 'STU_TEST_C'] } });
  
  // Ensure Pakala stop exists in BusStop master collection
  await BusStop.deleteOne({ stopName: 'Pakala' });
  await BusStop.create({
    stopName: 'Pakala',
    latitude: 17.0453,
    longitude: 82.1692,
    radiusMeters: 250,
    active: true
  });

  console.log('Seeding 3 students for Pakala...');
  await Student.create([
    {
      _id: 'STU_TEST_A',
      register_no: 'STU_TEST_A',
      name: 'Student A',
      bus_details: { bus_id: 'BUS001', bus_number: testBusNumber, route_name: 'Route-A', boarding_point: 'Pakala' },
      boardingPoint: 'Pakala',
      latitude: 17.0453,
      longitude: 82.1692,
      status: 'active'
    },
    {
      _id: 'STU_TEST_B',
      register_no: 'STU_TEST_B',
      name: 'Student B',
      bus_details: { bus_id: 'BUS001', bus_number: testBusNumber, route_name: 'Route-A', boarding_point: 'Pakala' },
      boardingPoint: 'Pakala',
      latitude: 17.0453,
      longitude: 82.1692,
      status: 'active'
    },
    {
      _id: 'STU_TEST_C',
      register_no: 'STU_TEST_C',
      name: 'Student C',
      bus_details: { bus_id: 'BUS001', bus_number: testBusNumber, route_name: 'Route-A', boarding_point: 'Pakala' },
      boardingPoint: 'Pakala',
      latitude: 17.0453,
      longitude: 82.1692,
      status: 'active'
    }
  ]);

  // Test 1
  let routeStops = await rebuildBusRoute(testBusNumber);
  let pakala = routeStops.find(s => s.stopName === 'Pakala');
  console.log('Test 1 - Pakala Student Count:', pakala?.studentCount);
  if (!pakala || pakala.studentCount !== 3) {
    throw new Error('Test 1 failed: Expected Pakala to have 3 students.');
  }

  // Test 2: Delete student A
  console.log('Deleting Student A...');
  await Student.deleteOne({ _id: 'STU_TEST_A' });
  routeStops = await rebuildBusRoute(testBusNumber);
  pakala = routeStops.find(s => s.stopName === 'Pakala');
  console.log('Test 2 - Pakala Student Count after deleting 1 student:', pakala?.studentCount);
  if (!pakala || pakala.studentCount !== 2) {
    throw new Error('Test 2 failed: Expected Pakala to have 2 students.');
  }

  // Test 3: Delete Student B
  console.log('Deleting Student B...');
  await Student.deleteOne({ _id: 'STU_TEST_B' });
  routeStops = await rebuildBusRoute(testBusNumber);
  pakala = routeStops.find(s => s.stopName === 'Pakala');
  console.log('Test 3 - Pakala Student Count after deleting second student:', pakala?.studentCount);
  if (!pakala || pakala.studentCount !== 1) {
    throw new Error('Test 3 failed: Expected Pakala to have 1 student.');
  }

  // Test 4: Delete final student C
  console.log('Deleting Student C...');
  await Student.deleteOne({ _id: 'STU_TEST_C' });
  routeStops = await rebuildBusRoute(testBusNumber);
  pakala = routeStops.find(s => s.stopName === 'Pakala');
  console.log('Test 4 - Does Pakala stop still exist on route?', !!pakala);
  if (pakala) {
    throw new Error('Test 4 failed: Expected Pakala to be removed from route since studentCount is 0.');
  }

  // Clean up
  await BusStop.deleteOne({ stopName: 'Pakala' });
  await BusRoute.deleteOne({ busNumber: testBusNumber });
  
  console.log('✓ verify_student_deletions_route passed.');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('FAIL:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
