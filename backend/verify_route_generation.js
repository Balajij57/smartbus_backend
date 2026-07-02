import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { BusRoute } from './src/models/BusRoute.js';
import { Bus } from './src/models/Bus.js';
import { rebuildBusRoute } from './src/services/routeService.js';
import { startTrip } from './src/services/trackingService.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const testBusNumber = 'TEST-BUS-99';
  const testBusId = 'BUS999';

  // 1. Setup test bus
  await Bus.deleteOne({ busNumber: testBusNumber });
  await Bus.create({
    busId: testBusId,
    busNumber: testBusNumber,
    routeId: 'Route-A',
    status: 'inactive'
  });

  // 2. Clean old test students
  await Student.deleteMany({ 'bus_details.bus_number': testBusNumber });

  // 3. Add students with coordinates
  const studentsData = [
    { name: 'Student A', boarding: 'Rajahmundry', lat: 16.9890, lng: 81.7836 },
    { name: 'Student B', boarding: 'Rajahmundry', lat: 16.9890, lng: 81.7836 },
    { name: 'Student C', boarding: 'Diwancheruvu', lat: 17.0269, lng: 81.8797 },
    { name: 'Student D', boarding: 'Lalacheruvu', lat: 17.0450, lng: 81.8500 },
    { name: 'Student E', boarding: 'Gandepalli', lat: 17.0700, lng: 82.0200 },
  ];

  console.log('\n=== Registering Test Students ===');
  for (let i = 0; i < studentsData.length; i++) {
    const s = studentsData[i];
    const created = await Student.create({
      _id: `TEST_STU_${i}`,
      register_no: `TEST_REG_${i}`,
      name: s.name,
      bus_details: {
        bus_id: testBusId,
        bus_number: testBusNumber,
        route_name: 'Route-A',
        boarding_point: s.boarding,
      },
      home_latitude: s.lat,
      home_longitude: s.lng,
      parent_phone: '1234567890',
      status: 'active'
    });
    console.log(`Registered ${created.name} assigned to ${created.bus_details.boarding_point}`);
  }

  // 4. Trigger Rebuild
  console.log('\n=== Triggering Rebuild for', testBusNumber, '===');
  const stops = await rebuildBusRoute(testBusNumber);

  console.log('\n=== Generated Bus Route Stops ===');
  stops.forEach(s => {
    console.log(`Stop ${s.sequence}: ${s.stopName} (${s.studentCount} students) at [${s.latitude}, ${s.longitude}]`);
  });

  // Verification asserts
  if (stops.length !== 5) {
    throw new Error(`Expected exactly 5 stops, got ${stops.length}`);
  }
  if (stops[0].stopName !== 'Rajahmundry') throw new Error('First stop must be Rajahmundry');
  if (stops[1].stopName !== 'Lalacheruvu') throw new Error('Second stop must be Lalacheruvu');
  if (stops[2].stopName !== 'Diwancheruvu') throw new Error('Third stop must be Diwancheruvu');
  if (stops[3].stopName !== 'Gandepalli') throw new Error('Fourth stop must be Gandepalli');
  if (stops[4].stopName !== 'Aditya University') throw new Error('Last stop must be Aditya University');

  console.log('\n✓ Route Order & Sequences verified correctly!');

  // 5. Test trip start in both directions
  console.log('\n=== Testing Boarding Trip (towards college) ===');
  const boardingTrip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'to_college'
  });
  console.log('Progress Stops sequence:');
  boardingTrip.routeProgress.forEach(v => {
    console.log(` - ${v.sequence}: ${v.villageName} (${v.status})`);
  });

  if (boardingTrip.routeProgress[0].villageName !== 'Rajahmundry' || boardingTrip.routeProgress[4].villageName !== 'Aditya University') {
    throw new Error('Boarding trip stops not ordered correctly');
  }

  // Stop trip to clean up
  boardingTrip.status = 'completed';
  await boardingTrip.save();

  console.log('\n=== Testing Drop-off Trip (away from college) ===');
  const dropoffTrip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'from_college'
  });
  console.log('Progress Stops sequence:');
  dropoffTrip.routeProgress.forEach(v => {
    console.log(` - ${v.sequence}: ${v.villageName} (${v.status})`);
  });

  if (dropoffTrip.routeProgress[0].villageName !== 'Aditya University' || dropoffTrip.routeProgress[4].villageName !== 'Rajahmundry') {
    throw new Error('Drop-off trip stops not reversed correctly');
  }

  // Cleanup database
  await Student.deleteMany({ 'bus_details.bus_number': testBusNumber });
  await BusRoute.deleteOne({ busNumber: testBusNumber });
  await Bus.deleteOne({ busNumber: testBusNumber });
  dropoffTrip.status = 'completed';
  await dropoffTrip.save();

  console.log('\n✓ E2E Route Generation and Progress Reversal verified successfully!');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
