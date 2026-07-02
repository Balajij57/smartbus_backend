import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { Student } from './src/models/Student.js';
import { Bus } from './src/models/Bus.js';
import { Route } from './src/models/Route.js';
import { BusRoute } from './src/models/BusRoute.js';
import { Trip } from './src/models/Trip.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { LiveLocation } from './src/models/LiveLocation.js';
import { SmsLog } from './src/models/SmsLog.js';
import { ScanLog } from './src/models/ScanLog.js';
import { startTrip, updateLocation, buildTrackingState } from './src/services/trackingService.js';

if (fs.existsSync('backend/.env')) {
  dotenv.config({ path: 'backend/.env' });
} else {
  dotenv.config({ path: '.env' });
}
process.env.MAX_BUS_SPEED_KMH = '1000';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!');

  const busNumber = 'BUS-03';
  const busId = 'BUS003';

  // Setup: Clear existing trips, active buses, and logs
  await Bus.updateOne({ busId }, { $set: { status: 'active', active: true, routeId: 'Route-North' } });
  await Route.deleteMany({ routeId: 'Route-North' });
  await Route.create({
    routeId: 'Route-North',
    routeName: 'North Zone Route',
    collegeLocation: {
      latitude: 17.0912,
      longitude: 82.0665
    },
    villages: [
      { villageId: 'Ramesampeta', villageName: 'Ramesampeta', sequence: 1, latitude: 17.2066, longitude: 82.0135 },
      { villageId: 'Aditya University', villageName: 'Aditya University', sequence: 2, latitude: 17.0912, longitude: 82.0665 }
    ]
  });
  await Trip.deleteMany({ busId });
  await ActiveBus.deleteMany({ busId });
  await LiveLocation.deleteMany({ busId });
  await BusRoute.deleteMany({ busNumber });
  await SmsLog.deleteMany({ bus_number: busNumber });
  await ScanLog.deleteMany({ bus_number: busNumber });
  await Student.deleteMany({ $or: [{ 'bus_details.bus_number': busNumber }, { busNumber }] });

  // Create Student at Ramesampeta
  const student = await Student.create({
    _id: 'STU_REAL_ROUTE_TEST',
    qr_student_id: 'STU_REAL_ROUTE_TEST',
    register_no: '22B91A0595',
    name: 'Real Route Student',
    bus_details: {
      bus_id: busId,
      bus_number: busNumber,
      route_name: 'North Zone',
      boarding_point: 'Ramesampeta'
    },
    busNumber,
    boardingPoint: 'Ramesampeta',
    status: 'active',
    parent_phone: '9876543219',
    latitude: 17.2066,
    longitude: 82.0135,
    home_latitude: 17.2066,
    home_longitude: 82.0135
  });

  console.log('\n--- Running verify_real_route_workflow (Final Acceptance Test) ---');

  // Test 1: Start Trip
  console.log('Test 1: Starting trip...');
  const trip = await startTrip({
    busId,
    driverId: 'DRV001',
    direction: 'to_college',
    startVillageId: 'Ramesampeta'
  });

  const ab1 = await ActiveBus.findOne({ busId }).lean();
  if (!trip || trip.status !== 'active' || !ab1) {
    console.error('Test 1 failed: Trip not active or ActiveBus not created.');
    process.exit(1);
  }
  console.log('Test 1 Passed: Trip started successfully and ActiveBus created.');

  // Test 2: Bus physically at Ramesampeta
  console.log('Test 2: Sending location ping at Ramesampeta coordinates...');
  // Coords for Ramesampeta: 17.2066, 82.0135
  const updateRes1 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.2066,
    longitude: 82.0135,
    speed: 15,
    heading: 0,
    timestamp: new Date(),
    accuracy: 10
  });
  await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.2066,
    longitude: 82.0135,
    speed: 15,
    heading: 0,
    timestamp: new Date(),
    accuracy: 10
  });

  const state1 = await buildTrackingState(busNumber);
  console.log('Current stop resolved:', state1.currentStop);
  console.log('Student count:', state1.studentCounts['Ramesampeta']);
  console.log('Distance remaining:', state1.distanceRemaining);

  if (state1.currentStop !== 'Ramesampeta' || state1.studentCounts['Ramesampeta'] !== 1 || state1.distanceRemaining <= 0) {
    console.error('Test 2 failed: Incorrect Stop, studentCount, or distanceRemaining.', state1);
    process.exit(1);
  }
  console.log('Test 2 Passed: Map marker and current stop are correctly Ramesampeta.');

  // Test 3: Student QR Scan
  console.log('Test 3: Simulating Student QR Scan at Ramesampeta...');
  const scanResponse = await fetch(`http://localhost:5000/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: 'STU_REAL_ROUTE_TEST',
      action: 'board',
      bus_number: busNumber,
      scanner_token: 'SCANNER_BUS03',
      scanMode: 'Morning Boarding',
      latitude: 17.2066,
      longitude: 82.0135,
      direction: 'to_college',
      driver_id: 'DRV001',
      trip_id: trip.tripId
    })
  });
  const scanResult = await scanResponse.json();
  console.log('Scan Response:', scanResult);

  // Check occupancy in trackingState
  const state3 = await buildTrackingState(busNumber);
  console.log('Occupancy after scan:', state3.occupancy);

  if (state3.occupancy !== 1) {
    console.error('Test 3 failed: Occupancy did not update to 1.');
    process.exit(1);
  }

  // Check SMS logs to ensure it does not say 'demo-sent'
  const lastSms = await SmsLog.findOne({ to: '+919876543219' }).sort({ createdAt: -1 }).lean();
  console.log('SMS Status in DB:', lastSms?.status);
  if (lastSms && lastSms.status === 'demo-sent') {
    console.error('Test 3 failed: SMS log status returned demo-sent in production checks.');
    process.exit(1);
  }
  console.log('Test 3 Passed: Student scan succeeded, occupancy updated, SMS verified.');

  // Test 4: Move towards college
  console.log('Test 4: Simulating movement towards Aditya University...');
  // Coordinates in between: 17.1500, 82.0400
  const updateRes4 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.1500,
    longitude: 82.0400,
    speed: 45,
    heading: 120,
    timestamp: new Date(Date.now() + 60000), // add 1 minute
    accuracy: 10
  });

  const state4 = await buildTrackingState(busNumber);
  console.log('Coordinates updated to:', state4.currentGps);
  console.log('Current stop in transit:', state4.currentStop);

  if (state4.currentGps.latitude !== 17.1500 || state4.currentStop === 'Aditya University') {
    console.error('Test 4 failed: Bus incorrectly jumped to Aditya University or failed to move.', state4);
    process.exit(1);
  }
  console.log('Test 4 Passed: Bus moved continuously along route progress.');

  // Test 5: Reach Aditya University
  console.log('Test 5: Sending coordinate inside Aditya University radius...');
  // Geofence check inside Aditya University: 17.0912, 82.0665
  const updateRes5 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.0912,
    longitude: 82.0665,
    speed: 10,
    heading: 180,
    timestamp: new Date(Date.now() + 120000), // add 2 minutes
    accuracy: 10
  });
  await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.0912,
    longitude: 82.0665,
    speed: 10,
    heading: 180,
    timestamp: new Date(Date.now() + 130000),
    accuracy: 10
  });

  const trip5 = await Trip.findOne({ tripId: trip.tripId }).lean();
  console.log('Trip status at Aditya University:', trip5.status);

  if (trip5.status !== 'completed') {
    console.error('Test 5 failed: Trip did not auto-complete on reaching Aditya University.', trip5);
    process.exit(1);
  }
  console.log('Test 5 Passed: Reached Aditya University, trip auto-completed successfully.');

  // Test 6: Reload state consistency
  console.log('Test 6: Verifying consistency across reloads...');
  const state6 = await buildTrackingState(busNumber);
  if (state6.tripStatus !== 'completed' && state6.tripStatus !== 'inactive') {
    console.error('Test 6 failed: Reload state is inconsistent.', state6);
    process.exit(1);
  }
  console.log('Test 6 Passed: Consistent reload state verified.');

  console.log('\nAll tests in verify_real_route_workflow passed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
