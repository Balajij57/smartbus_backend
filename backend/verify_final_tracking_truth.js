import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { Student } from './src/models/Student.js';
import { Bus } from './src/models/Bus.js';
import { Route } from './src/models/Route.js';
import { Trip } from './src/models/Trip.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { LiveLocation } from './src/models/LiveLocation.js';
import { updateLocation, buildTrackingState } from './src/services/trackingService.js';

if (fs.existsSync('backend/.env')) {
  dotenv.config({ path: 'backend/.env' });
} else {
  dotenv.config({ path: '.env' });
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!');

  const busNumber = 'BUS-03';
  const busId = 'BUS003';

  // Cleanup and setup
  await Bus.updateOne({ busId }, { $set: { status: 'active', active: true } });
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
  await Student.deleteMany({ $or: [{ 'bus_details.bus_number': busNumber }, { busNumber }] });

  // 1. One student assigned to BUS-03 at Ramesampeta
  const student = await Student.create({
    _id: 'STU_FINAL_TRUTH',
    qr_student_id: 'STU_FINAL_TRUTH',
    register_no: '22B91A0599',
    name: 'Final Truth Student',
    bus_details: {
      bus_id: busId,
      bus_number: busNumber,
      route_name: 'North Zone',
      boarding_point: 'Ramesampeta'
    },
    busNumber,
    boardingPoint: 'Ramesampeta',
    status: 'active'
  });

  const trip = await Trip.create({
    tripId: 'TRIP-FINAL-TRUTH-TEST',
    busId,
    driverId: 'DRV001',
    routeId: 'Route-North',
    direction: 'to_college',
    startTime: new Date(),
    status: 'active',
    routeProgress: [
      {
        villageId: 'Ramesampeta',
        villageName: 'Ramesampeta',
        sequence: 1,
        latitude: 17.2066,
        longitude: 82.0135,
        crossed: false,
        crossedAt: null,
        status: 'current',
        studentCount: 1,
        allowedRadiusMeters: 250
      },
      {
        villageId: 'Aditya University',
        villageName: 'Aditya University',
        sequence: 2,
        latitude: 17.0912,
        longitude: 82.0665,
        crossed: false,
        crossedAt: null,
        status: 'pending',
        studentCount: 0,
        allowedRadiusMeters: 500
      }
    ],
    routeSnapshot: [
      {
        villageId: 'Ramesampeta',
        villageName: 'Ramesampeta',
        sequence: 1,
        latitude: 17.2066,
        longitude: 82.0135,
        studentCount: 1
      }
    ]
  });

  const activeBus = await ActiveBus.create({
    busId,
    busNumber,
    location: { type: 'Point', coordinates: [82.0135, 17.2066] },
    currentTripId: trip.tripId,
    routeProgress: trip.routeProgress
  });

  console.log('\n--- Running verify_final_tracking_truth ---');

  // Test 1: GPS source consistency
  console.log('Test 1: Verifying GPS source consistency...');
  const res1 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.2066,
    longitude: 82.0135,
    speed: 0,
    heading: 0,
    timestamp: new Date(),
    accuracy: 10
  });

  const ab = await ActiveBus.findOne({ busId }).lean();
  const tr = await Trip.findOne({ tripId: trip.tripId }).lean();
  const ll = await LiveLocation.findOne({ busId }).sort({ timestamp: -1 }).lean();
  const state = await buildTrackingState(busNumber);

  const abCoords = `${ab.location.coordinates[1].toFixed(4)},${ab.location.coordinates[0].toFixed(4)}`;
  const trCoords = `${tr.currentLocation.latitude.toFixed(4)},${tr.currentLocation.longitude.toFixed(4)}`;
  const llCoords = `${ll.latitude.toFixed(4)},${ll.longitude.toFixed(4)}`;
  const stateCoords = `${state.currentGps.latitude.toFixed(4)},${state.currentGps.longitude.toFixed(4)}`;

  console.log(`ActiveBus Coordinates: ${abCoords}`);
  console.log(`Trip Coordinates: ${trCoords}`);
  console.log(`LiveLocation Coordinates: ${llCoords}`);
  console.log(`trackingState Coordinates: ${stateCoords}`);

  if (abCoords !== trCoords || abCoords !== llCoords || abCoords !== stateCoords) {
    console.error('Test 1 failed: Divergent coordinates found across tracking layers.');
    process.exit(1);
  }
  console.log('Test 1 Passed: GPS coordinates are identical across all layers.');

  // Test 2: Current Stop Calculation
  console.log('Test 2: Verifying stop calculations...');
  if (state.currentStop !== 'Ramesampeta') {
    console.error(`Test 2 failed: Expected currentStop to be "Ramesampeta" when at Ramesampeta coords. Got: "${state.currentStop}"`);
    process.exit(1);
  }
  console.log('Test 2 Passed: Stop calculated correctly as Ramesampeta.');

  // Test 3: Student Count Synchronization
  console.log('Test 3: Verifying student counts sync live...');
  // Check count
  if (state.studentCounts['Ramesampeta'] !== 1) {
    console.error('Test 3 failed: Ramesampeta student count in trackingState is not 1.', state.studentCounts);
    process.exit(1);
  }

  // Add another student
  console.log('Adding another student to Ramesampeta...');
  await Student.create({
    _id: 'STU_FINAL_TRUTH_2',
    qr_student_id: 'STU_FINAL_TRUTH_2',
    register_no: '22B91A0598',
    name: 'Second Student',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Ramesampeta' },
    busNumber,
    boardingPoint: 'Ramesampeta',
    status: 'active'
  });

  const state2 = await buildTrackingState(busNumber);
  if (state2.studentCounts['Ramesampeta'] !== 2) {
    console.error('Test 3 failed: Student count did not increase to 2 live.', state2.studentCounts);
    process.exit(1);
  }
  console.log('Test 3 Passed: Live student count increased to 2 successfully.');

  // Test 4: Route Progress Synchronization
  console.log('Test 4: Verifying route progress synchronization...');
  const ramesProgress = state2.routeProgress.find(s => s.villageName === 'Ramesampeta');
  if (ramesProgress.studentCount !== 2) {
    console.error('Test 4 failed: Route progress student count is not synced live.', ramesProgress);
    process.exit(1);
  }
  console.log('Test 4 Passed: Route progress is fully synchronized.');

  // Test 5: Socket payload synchronization
  console.log('Test 5: Verifying socket payload matches trackingState...');
  const socketPayload = res1.payload;
  if (!socketPayload || socketPayload.currentStop !== 'Ramesampeta' || socketPayload.busId !== busId) {
    console.error('Test 5 failed: Socket payload is incorrect or mismatched.', socketPayload);
    process.exit(1);
  }
  console.log('Test 5 Passed: Socket payload matches trackingState.');

  // Test 6: Dashboard Synchronization
  console.log('Test 6: Querying HTTP tracking state endpoint...');
  const response = await fetch(`http://localhost:5000/api/tracking/state/${busNumber}`);
  const httpState = await response.json();
  if (httpState.currentStop !== 'Ramesampeta' || httpState.occupancy !== 0) {
    console.error('Test 6 failed: HTTP trackingState differs from DB state.', httpState);
    process.exit(1);
  }
  console.log('Test 6 Passed: Dashboard HTTP API is synchronized.');

  console.log('\nAll tests in verify_final_tracking_truth passed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
