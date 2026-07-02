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

  const busId = 'GEO-BUS';
  const tripId = 'GEO-TRIP';
  const routeId = 'GEO-ROUTE';
  const busNumber = 'GEO-01';

  // Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber }] });
  await Trip.deleteMany({ $or: [{ busId }, { tripId }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ 'bus_details.bus_number': busNumber });
  await BusRoute.deleteMany({ busNumber });
  await TrackingEvent.deleteMany({ tripId });

  // Setup Route with two stops plus college
  const route = await Route.create({
    routeId,
    routeName: 'Geo Test Route',
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
    _id: 'GEO-STU-1',
    register_no: 'GEO-STU-1',
    name: 'Student A',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Stop A' },
    latitude: 17.01,
    longitude: 82.01,
    status: 'active'
  });

  await Student.create({
    _id: 'GEO-STU-2',
    register_no: 'GEO-STU-2',
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
  const trip = await startTrip({ busId, driverId: 'GEO-DRIVER', direction: 'to_college' });
  await Trip.updateOne({ _id: trip._id }, { $set: { tripId } });
  await LiveLocation.deleteMany({ tripId });

  const now = Date.now();

  // --- TEST 1: Boundary Flicker on Stop A (inside, outside, inside) ---
  console.log('\n--- TEST 1: Boundary Flicker (inside, outside, inside) ---');
  
  // Update 1: Inside Stop A geofence
  console.log('Sending Update 1: Inside Stop A...');
  await updateLocation({
    busId, tripId,
    latitude: 17.0101, longitude: 82.0101, // ~15m away
    timestamp: new Date(now - 1200000) // 20m ago
  });
  let activeTrip = await Trip.findOne({ tripId }).lean();
  console.log(`- Stop A consecutivePings: ${activeTrip.routeProgress[0].consecutivePings}`);
  console.log(`- Stop A crossed: ${activeTrip.routeProgress[0].crossed}`);

  // Update 2: Outside Stop A geofence
  console.log('Sending Update 2: Outside Stop A (spaced by 5 minutes)...');
  await updateLocation({
    busId, tripId,
    latitude: 17.015, longitude: 82.015, // ~700m away
    timestamp: new Date(now - 900000) // 15m ago (5m elapsed)
  });
  activeTrip = await Trip.findOne({ tripId }).lean();
  console.log(`- Stop A consecutivePings: ${activeTrip.routeProgress[0].consecutivePings}`);
  console.log(`- Stop A crossed: ${activeTrip.routeProgress[0].crossed}`);

  // Update 3: Inside Stop A geofence (flicker back)
  console.log('Sending Update 3: Inside Stop A (spaced by 5 minutes)...');
  await updateLocation({
    busId, tripId,
    latitude: 17.0101, longitude: 82.0101,
    timestamp: new Date(now - 600000) // 10m ago (5m elapsed)
  });
  activeTrip = await Trip.findOne({ tripId }).lean();
  console.log(`- Stop A consecutivePings: ${activeTrip.routeProgress[0].consecutivePings}`);
  console.log(`- Stop A crossed: ${activeTrip.routeProgress[0].crossed}`);

  // Update 4: Inside Stop A again (second consecutive -> commits crossing)
  console.log('Sending Update 4: Inside Stop A again (2nd consecutive)...');
  await updateLocation({
    busId, tripId,
    latitude: 17.0101, longitude: 82.0101,
    timestamp: new Date(now - 300000) // 5m ago
  });
  activeTrip = await Trip.findOne({ tripId }).lean();
  console.log(`- Stop A consecutivePings: ${activeTrip.routeProgress[0].consecutivePings}`);
  console.log(`- Stop A crossed: ${activeTrip.routeProgress[0].crossed}`);

  // --- TEST 2: Exit then Re-entry (Crossing must be sticky and not trigger duplicate events) ---
  console.log('\n--- TEST 2: Exit then Re-entry ---');
  // Update 5: Move outside Stop A (spaced by 5 minutes)
  console.log('Sending Update 5: Outside Stop A...');
  await updateLocation({
    busId, tripId,
    latitude: 17.015, longitude: 82.015,
    timestamp: new Date(now - 150000) // 2.5m ago
  });
  // Update 6: Enter Stop A again
  console.log('Sending Update 6: Enter Stop A again...');
  await updateLocation({
    busId, tripId,
    latitude: 17.0101, longitude: 82.0101,
    timestamp: new Date(now)
  });
  
  const crossedEvents = await TrackingEvent.find({ tripId, kind: 'village-crossed', 'payload.villageName': 'Stop A' });
  console.log(`- Number of 'village-crossed' events created for Stop A: ${crossedEvents.length}`);

  // --- TEST 3: Sequence Integrity (Enter Stop B directly, backfilling Stop A) ---
  console.log('\n--- TEST 3: Sequence Integrity ---');
  // Let's reset Stop A to crossed: false for a clean sequence check
  await Trip.updateOne(
    { tripId },
    { $set: { 'routeProgress.0.crossed': false, 'routeProgress.0.consecutivePings': 0 } }
  );

  // Send 2 consecutive updates at Stop B (skip Stop A)
  // Distance from last location (Stop A coordinates) to Stop B is ~1.5km, so we need at least 120s
  console.log('Sending 2 updates at Stop B directly...');
  await updateLocation({ busId, tripId, latitude: 17.0201, longitude: 82.0201, timestamp: new Date(now + 300000) });
  await updateLocation({ busId, tripId, latitude: 17.0201, longitude: 82.0201, timestamp: new Date(now + 320000) });
  
  activeTrip = await Trip.findOne({ tripId }).lean();
  console.log(`- Stop A (Seq 1) crossed status: ${activeTrip.routeProgress[0].crossed}`);
  console.log(`- Stop B (Seq 2) crossed status: ${activeTrip.routeProgress[1].crossed}`);

  // --- TEST 4: Trip Auto-Completion Idempotency ---
  console.log('\n--- TEST 4: Trip Completion Idempotency ---');
  // Distance to college is ~8km, so we need a larger gap (e.g. 1000s = 16 minutes)
  console.log('Sending Update 1 inside College geofence...');
  await updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(now + 1200000) });
  
  // Send update 2 inside College geofence (triggers completion)
  console.log('Sending Update 2 inside College geofence...');
  await updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(now + 1220000) });
  
  // Check completed trip status
  let finalTrip = await Trip.findOne({ tripId }).lean();
  console.log(`- Final Trip Status: ${finalTrip.status}`);

  // Send update 3 inside College geofence (idempotency check)
  console.log('Sending Update 3 inside College geofence post-completion...');
  try {
    await updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(now + 1240000) });
  } catch (err) {
    console.log(`- Correctly rejected subsequent location update: ${err.message}`);
  }

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
