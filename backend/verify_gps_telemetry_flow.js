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

  // Ensure active bus and driver trip
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

  const trip = await Trip.create({
    tripId: 'TRIP-TELEMETRY-FLOW-TEST',
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

  console.log('\n--- Running verify_gps_telemetry_flow ---');

  // Test 1: Send valid GPS coordinate (inside AP box: Ramesampeta area)
  console.log('Test 1: Updating location to Ramesampeta coordinates...');
  const res1 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.2066,
    longitude: 82.0135,
    speed: 15,
    heading: 90,
    timestamp: new Date(),
    accuracy: 10
  });

  const ab1 = await ActiveBus.findOne({ busId });
  if (!ab1 || ab1.location.coordinates[1] !== 17.2066 || ab1.location.coordinates[0] !== 82.0135) {
    console.error('Test 1 failed: ActiveBus.location coordinates not updated properly.', ab1?.location);
    process.exit(1);
  }
  console.log('Test 1 Passed: ActiveBus location updated successfully.');

  // Test 3: Verify trackingState reflects location
  console.log('Test 3: Checking trackingState reflects location...');
  const state = await buildTrackingState(busNumber);
  if (!state || state.currentGps.latitude !== 17.2066 || state.currentGps.longitude !== 82.0135) {
    console.error('Test 3 failed: trackingState does not match accepted coordinate.', state?.currentGps);
    process.exit(1);
  }
  console.log('Test 3 Passed: trackingState currentGps is correct.');

  // Test 5: Verify GPS packet counters increment
  console.log('Test 5: Verifying packet counters incremented...');
  if (state.gpsPacketsReceived !== 1 || state.gpsPacketsRejected !== 0) {
    console.error('Test 5 failed: gpsPacketsReceived or gpsPacketsRejected counter mismatch.', state);
    process.exit(1);
  }
  console.log('Test 5 Passed: Telemetry counters incremented correctly.');

  // Test 6: Verify out-of-AP coordinates are rejected
  console.log('Test 6: Sending coordinates outside Andhra Pradesh boundaries...');
  try {
    await updateLocation({
      busId,
      tripId: trip.tripId,
      latitude: 45.0, // outside AP
      longitude: -122.0, // outside AP
      speed: 0,
      heading: 0,
      timestamp: new Date(),
      accuracy: 10
    });
    console.error('Test 6 failed: updateLocation accepted out-of-bounds coordinate.');
    process.exit(1);
  } catch (err) {
    console.log('Test 6 Passed: out-of-bounds coordinate rejected with error:', err.message);
  }

  const ab2 = await ActiveBus.findOne({ busId });
  if (ab2.gpsPacketsRejected !== 1) {
    console.error('Test 6 failed: gpsPacketsRejected did not increment.', ab2);
    process.exit(1);
  }
  console.log('Test 6 Passed: gpsPacketsRejected incremented successfully.');

  console.log('\nAll tests in verify_gps_telemetry_flow passed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
