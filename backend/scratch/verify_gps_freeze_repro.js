import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Trip } from '../src/models/Trip.js';
import { Route } from '../src/models/Route.js';
import { Student } from '../src/models/Student.js';
import { LiveLocation } from '../src/models/LiveLocation.js';
import { updateLocation, startTrip } from '../src/services/trackingService.js';
import { rebuildBusRoute } from '../src/services/routeService.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const busId = 'FREEZE-TEST-BUS';
  const tripId = 'FREEZE-TEST-TRIP';
  const routeId = 'FREEZE-TEST-ROUTE';

  // Comprehensive Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber: 'FREEZE-01' }] });
  await Trip.deleteMany({ $or: [{ busId }, { driverId: 'FREEZE-DRIVER' }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ $or: [{ _id: 'FREEZE-STU-01' }, { 'bus_details.bus_number': 'FREEZE-01' }] });

  // Setup mock data
  const route = await Route.create({
    routeId,
    routeName: 'Freeze Test Route',
    collegeLocation: { latitude: 17.0912, longitude: 82.0665 },
    stops: []
  });

  const bus = await Bus.create({
    busId,
    busNumber: 'FREEZE-01',
    routeId,
    capacity: 40,
    status: 'active'
  });

  const student = await Student.create({
    _id: 'FREEZE-STU-01',
    register_no: 'FREEZE-STU-01',
    name: 'Freeze Student',
    bus_details: {
      bus_id: busId,
      bus_number: 'FREEZE-01',
      boarding_point: 'Stargaze Stop'
    },
    latitude: 17.0,
    longitude: 82.0,
    status: 'active'
  });

  // Rebuild route
  await rebuildBusRoute('FREEZE-01');

  // Start trip
  const trip = await startTrip({
    busId,
    driverId: 'FREEZE-DRIVER',
    direction: 'to_college'
  });
  // Override tripId for predictability
  await Trip.updateOne({ _id: trip._id }, { $set: { tripId } });
  await LiveLocation.deleteMany({ tripId }); // ensure clean slate

  const now = Date.now();
  const times = [
    new Date(now - 120000), // Point 1: Valid Baseline
    new Date(now - 100000), // Point 2: Anomaly
    new Date(now - 80000),  // Point 3: Valid 1
    new Date(now - 60000),  // Point 4: Valid 2
    new Date(now - 40000),  // Point 5: Valid 3
    new Date(now - 20000),  // Point 6: Valid 4
    new Date(now)           // Point 7: Valid 5
  ];

  console.log('\n--- Telemetry Point 1: Valid Baseline ---');
  await updateLocation({
    busId,
    tripId,
    latitude: 17.0,
    longitude: 82.0,
    speed: 10,
    heading: 0,
    timestamp: times[0]
  });

  console.log('\n--- Telemetry Point 2: Anomaly Trigger (Large jump > 500m) ---');
  try {
    await updateLocation({
      busId,
      tripId,
      latitude: 17.15, // Approx 16 km away
      longitude: 82.15,
      speed: 10,
      heading: 0,
      timestamp: times[1]
    });
  } catch (err) {
    console.log('Point 2 rejected as expected:', err.message);
  }

  console.log('\n--- Telemetry Points 3-7: Valid points near the last good baseline ---');
  for (let i = 1; i <= 5; i++) {
    const lat = 17.0 + (i * 0.001);
    const lng = 82.0 + (i * 0.001);
    try {
      const res = await updateLocation({
        busId,
        tripId,
        latitude: lat,
        longitude: lng,
        speed: 10,
        heading: 0,
        timestamp: times[i + 1]
      });
      console.log(`Point ${i + 2} (lat=${lat.toFixed(4)}, lng=${lng.toFixed(4)}) status:`, res.payload ? 'Accepted' : 'Anomaly');
    } catch (err) {
      console.log(`Point ${i + 2} rejected:`, err.message);
    }
  }

  // Print all LiveLocation documents
  console.log('\n--- Raw LiveLocation Documents in DB ---');
  const docs = await LiveLocation.find({ tripId }).sort({ timestamp: 1 }).lean();
  console.log(JSON.stringify(docs, null, 2));

  // Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber: 'FREEZE-01' }] });
  await Trip.deleteMany({ $or: [{ busId }, { driverId: 'FREEZE-DRIVER' }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ $or: [{ _id: 'FREEZE-STU-01' }, { 'bus_details.bus_number': 'FREEZE-01' }] });

  await mongoose.disconnect();
}

run().catch(console.error);
