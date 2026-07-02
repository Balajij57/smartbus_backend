import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Trip } from '../src/models/Trip.js';
import { Route } from '../src/models/Route.js';
import { Student } from '../src/models/Student.js';
import { BusRoute } from '../src/models/BusRoute.js';
import { LiveLocation } from '../src/models/LiveLocation.js';
import { TrackingEvent } from '../src/models/TrackingEvent.js';
import { updateLocation, startTrip } from '../src/services/trackingService.js';
import { rebuildBusRoute } from '../src/services/routeService.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const busId = 'RACE-BUS';
  const tripId = 'RACE-TRIP';
  const routeId = 'RACE-ROUTE';
  const busNumber = 'RACE-01';

  // Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber }] });
  await Trip.deleteMany({ $or: [{ busId }, { tripId }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ 'bus_details.bus_number': busNumber });
  await BusRoute.deleteMany({ busNumber });
  await TrackingEvent.deleteMany({ tripId });

  // Setup Route
  const route = await Route.create({
    routeId,
    routeName: 'Race Test Route',
    collegeLocation: { latitude: 17.0912, longitude: 82.0665 },
    stops: []
  });

  const bus = await Bus.create({
    busId,
    busNumber,
    routeId,
    capacity: 40,
    status: 'active'
  });

  // Assign students to populate the dynamic route stops
  await Student.create({
    _id: 'RACE-STU-1',
    register_no: 'RACE-STU-1',
    name: 'Student A',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Stop A' },
    latitude: 17.01,
    longitude: 82.01,
    status: 'active'
  });

  await Student.create({
    _id: 'RACE-STU-2',
    register_no: 'RACE-STU-2',
    name: 'Student B',
    parent_id: 'PARENT-B',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Stop B' },
    latitude: 17.02,
    longitude: 82.02,
    status: 'active'
  });

  // Rebuild Dynamic Route Stops
  await rebuildBusRoute(busNumber);

  // Start Trip
  const trip = await startTrip({ busId, driverId: 'RACE-DRIVER', direction: 'to_college' });
  await Trip.updateOne({ _id: trip._id }, { $set: { tripId } });
  await LiveLocation.deleteMany({ tripId });

  const startTime = Date.now();

  // --- 1. Flicker Test at Realistic GPS Cadence (15 seconds) ---
  console.log('\n=== 1. FLICKER TEST AT 15-SECOND CADENCE ===');
  console.log('Production telemetry interval is 15 seconds.');
  
  // Readings sequence (inside, outside, inside, outside, inside, inside)
  // Stop A is at (17.01, 82.01) with radius 200m
  // Inside: 17.0101, 82.0101 is ~15m away
  // Outside: 17.0125, 82.0125 is ~390m away (which is > 200m/250m)
  // Distance from inside to outside is ~370m, which at 15s is ~88.8 km/h (under the 90 km/h limit)
  const readings = [
    { name: 'Reading 1 (Inside)', lat: 17.0101, lng: 82.0101, offset: 0 },
    { name: 'Reading 2 (Outside)', lat: 17.0125, lng: 82.0125, offset: 15 },
    { name: 'Reading 3 (Inside)', lat: 17.0101, lng: 82.0101, offset: 30 },
    { name: 'Reading 4 (Outside)', lat: 17.0125, lng: 82.0125, offset: 45 },
    { name: 'Reading 5 (Inside)', lat: 17.0101, lng: 82.0101, offset: 60 },
    { name: 'Reading 6 (Inside)', lat: 17.0101, lng: 82.0101, offset: 75 }
  ];

  for (const r of readings) {
    console.log(`Sending telemetry: ${r.name} at +${r.offset}s...`);
    await updateLocation({
      busId, tripId,
      latitude: r.lat, longitude: r.lng,
      timestamp: new Date(startTime + r.offset * 1000)
    });
    const t = await Trip.findOne({ tripId }).lean();
    console.log(`  - consecutivePings: ${t.routeProgress[0].consecutivePings}`);
    console.log(`  - crossed: ${t.routeProgress[0].crossed}`);
  }

  // --- 2. Skip-and-Backfill Behavior Assertions ---
  console.log('\n=== 2. SKIP-AND-BACKFILL BEHAVIOR ===');
  // Reset Stop A to uncrossed for testing skip directly to Stop B
  await Trip.updateOne(
    { tripId },
    { $set: { 'routeProgress.0.crossed': false, 'routeProgress.0.consecutivePings': 0, 'routeProgress.0.autoBackfilled': false } }
  );

  console.log('Sending 2 updates at Stop B directly (skipping Stop A)...');
  // Stop B is at 17.02, 82.02. Delta from Stop A (17.01, 82.01) is ~1.5km.
  // To avoid speed anomaly, we space it to 200s (27 km/h)
  await updateLocation({ busId, tripId, latitude: 17.0201, longitude: 82.0201, timestamp: new Date(startTime + 200 * 1000) });
  await updateLocation({ busId, tripId, latitude: 17.0201, longitude: 82.0201, timestamp: new Date(startTime + 215 * 1000) });

  const finalProgress = await Trip.findOne({ tripId }).lean();
  console.log(`Stop A (Seq 1 - Skipped): crossed = ${finalProgress.routeProgress[0].crossed}, autoBackfilled = ${finalProgress.routeProgress[0].autoBackfilled}`);
  console.log(`Stop B (Seq 2 - Visited): crossed = ${finalProgress.routeProgress[1].crossed}, autoBackfilled = ${finalProgress.routeProgress[1].autoBackfilled}`);

  // --- 3. True Concurrent Completion Race Test ---
  console.log('\n=== 3. CONCURRENT COMPLETION RACE TEST ===');
  // Aditya University is at 17.0912, 82.0665. Distance from Stop B is ~9.3km.
  // To avoid speed anomaly, we space it to 800 seconds (55 km/h)
  console.log('Sending first ping at Aditya University...');
  await updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(startTime + 800 * 1000) });

  console.log('Firing 2 concurrent updates at Aditya University via Promise.all...');
  const promises = [
    updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(startTime + 815 * 1000) }),
    updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(startTime + 815 * 1000) })
  ];

  const results = await Promise.allSettled(promises);
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      console.log(`Request ${i + 1}: Succeeded (Trip completed)`);
    } else {
      console.log(`Request ${i + 1}: Rejected with error: "${res.reason.message}"`);
    }
  });

  const tripRecord = await Trip.findOne({ tripId }).lean();
  // If completed, the active trip record won't be active anymore (it is completed or deleted/archived)
  // Let's check both active and completed trips
  const dbTrips = await Trip.find({ tripId }).lean();
  console.log(`Found ${dbTrips.length} trip records in DB:`);
  dbTrips.forEach(t => {
    console.log(`  - status: ${t.status}, autoBackfilled stops count: ${t.routeProgress.filter(p => p.autoBackfilled).length}`);
  });

  const completionEvents = await TrackingEvent.find({ tripId, kind: 'trip-stopped' });
  console.log(`Number of 'trip-stopped' TrackingEvents in DB: ${completionEvents.length}`);

  // Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber }] });
  await Trip.deleteMany({ $or: [{ busId }, { tripId }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ 'bus_details.bus_number': busNumber });
  await BusRoute.deleteMany({ busNumber });
  await TrackingEvent.deleteMany({ tripId });

  await mongoose.disconnect();
}

run().catch(console.error);
