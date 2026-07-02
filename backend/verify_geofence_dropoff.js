import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { Bus } from './src/models/Bus.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { Trip } from './src/models/Trip.js';
import { ScanLog } from './src/models/ScanLog.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
const API_URL = 'http://localhost:5000/api/scan';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const testBusNumber = 'BUS-03';
  const testBusId = 'BUS003';
  const studentId = 'STU_GEOFENCE_TEST';
  const qrId = 'STU_GEOFENCE_TEST';

  // 1. Clean up old databases state
  await Student.deleteMany({ _id: studentId });
  await Trip.deleteMany({ busId: testBusId });
  await ActiveBus.deleteMany({ busId: testBusId });

  // 2. Create student with stop Diwancheruvu
  console.log('\n=== Seeding Student "Sai" with assigned stop Diwancheruvu ===');
  const student = await Student.create({
    _id: studentId,
    register_no: qrId,
    name: 'Sai',
    bus_details: {
      bus_id: testBusId,
      bus_number: testBusNumber,
      route_name: 'Route-C',
      boarding_point: 'Diwancheruvu'
    },
    boardingPoint: 'Diwancheruvu',
    landmark: 'Sai Baba Temple',
    latitude: 17.0269,
    longitude: 81.8797,
    allowedRadiusMeters: 200,
    parent_phone: '9876543210',
    status: 'active'
  });
  console.log('Student created:', student.name, 'Stop coordinates:', [student.latitude, student.longitude]);

  // 3. Create active trip (Evening Trip: COLLEGE -> HOME)
  console.log('\n=== Starting Active Evening Trip (COLLEGE -> HOME) ===');
  const trip = await Trip.create({
    tripId: 'TRIP_GEOFENCE_TEST_001',
    busId: testBusId,
    driverId: 'DRV001',
    routeId: 'ROUTE-C',
    direction: 'from_college', // COLLEGE -> HOME
    startTime: new Date(),
    status: 'active',
    routeProgress: [
      {
        villageId: 'Diwancheruvu',
        villageName: 'Diwancheruvu',
        sequence: 1,
        latitude: 17.0269,
        longitude: 81.8797,
        crossed: false,
        status: 'pending'
      }
    ]
  });
  console.log('Trip created with direction:', trip.direction);

  // 4. Test 1: APPROVED drop-off (Bus distance = ~85m)
  console.log('\n=== TEST 1: Drop-off within allowed radius (expected APPROVED) ===');
  // Set bus current GPS location (within 200m)
  await ActiveBus.updateOne(
    { busId: testBusId },
    {
      $set: {
        busNumber: testBusNumber,
        location: {
          type: 'Point',
          coordinates: [81.8802, 17.0275] // [longitude, latitude]
        },
        currentTripId: trip.tripId,
        lastUpdatedAt: new Date()
      }
    },
    { upsert: true }
  );

  console.log('Active bus location set to:', [17.0275, 81.8802]);

  let res1 = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: qrId,
      action: 'dropoff',
      bus_number: testBusNumber,
      scanner_token: 'SCANNER_BUS03'
    })
  });

  let data1 = await res1.json();
  console.log('API Response status:', res1.status);
  console.log('API Response body:', data1);

  if (res1.status !== 201 || !data1.ok) {
    throw new Error('Test 1 failed: Expected drop-off to be APPROVED.');
  }
  console.log('✓ TEST 1: APPROVED successfully!');

  // Clear scan log for Test 2
  await ScanLog.deleteMany({ student_id: studentId });

  // 5. Test 2: REJECTED drop-off (Bus distance = ~575m)
  console.log('\n=== TEST 2: Drop-off outside allowed radius (expected REJECTED) ===');
  // Set bus current GPS location (outside 200m)
  await ActiveBus.updateOne(
    { busId: testBusId },
    {
      $set: {
        location: {
          type: 'Point',
          coordinates: [81.8830, 17.0310]
        }
      }
    }
  );

  console.log('Active bus location set to:', [17.0310, 81.8830]);

  let res2 = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: qrId,
      action: 'dropoff',
      bus_number: testBusNumber,
      scanner_token: 'SCANNER_BUS03'
    })
  });

  let data2 = await res2.json();
  console.log('API Response status:', res2.status);
  console.log('API Response body:', data2);

  if (res2.status === 201 || data2.ok) {
    throw new Error('Test 2 failed: Expected drop-off to be REJECTED.');
  }
  if (!data2.error || !data2.error.includes('outside the allowed radius')) {
    throw new Error('Test 2 failed: Expected error message to specify outside allowed radius.');
  }
  console.log('✓ TEST 2: REJECTED successfully!');

  // 6. Clean up database
  await Student.deleteMany({ _id: studentId });
  await Trip.deleteMany({ busId: testBusId });
  await ActiveBus.deleteMany({ busId: testBusId });
  await ScanLog.deleteMany({ student_id: studentId });

  console.log('\nPASS');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('FAIL:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
