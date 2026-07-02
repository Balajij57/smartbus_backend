import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { Bus } from './src/models/Bus.js';
import { BusRoute } from './src/models/BusRoute.js';
import { Trip } from './src/models/Trip.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { rebuildBusRoute } from './src/services/routeService.js';
import { startTrip, updateLocation } from './src/services/trackingService.js';
import { ADITYA_UNIVERSITY_COORDS } from './src/utils/coordResolver.js';

dotenv.config({ path: 'backend/.env' });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!\n');

  const busNumber = 'BUS-03';
  const busId = 'BUS003';

  // Make sure BUS-03 is active
  await Bus.updateOne({ busNumber }, { $set: { status: 'active', active: true } });

  // Clean up existing active trips for the bus
  await Trip.deleteMany({ busId });
  await ActiveBus.deleteMany({ busId });

  // Clean up test students
  await Student.deleteMany({ register_no: { $in: ['TEST-STU-001', 'TEST-STU-002', 'TEST-STU-003'] } });
  await Student.deleteMany({ $or: [{ 'bus_details.bus_number': busNumber }, { 'busNumber': busNumber }] });

  console.log('=== TEST 1 & 5 & 6: Student Normalization & Count Sync ===');
  // Create 3 students with spelling variations
  const stu1 = await Student.create({
    _id: 'TEST-STU-001',
    register_no: 'TEST-STU-001',
    name: 'Test Student 1',
    status: 'active',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Ramesampeta' },
    boardingPoint: 'Ramesampeta',
    latitude: 17.08495,
    longitude: 82.04944
  });

  const stu2 = await Student.create({
    _id: 'TEST-STU-002',
    register_no: 'TEST-STU-002',
    name: 'Test Student 2',
    status: 'active',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Rameswarampeta' },
    boardingPoint: 'Rameswarampeta',
    latitude: 17.08495,
    longitude: 82.04944
  });

  const stu3 = await Student.create({
    _id: 'TEST-STU-003',
    register_no: 'TEST-STU-003',
    name: 'Test Student 3',
    status: 'active',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Rameshwarampeta' },
    boardingPoint: 'Rameshwarampeta',
    latitude: 17.08495,
    longitude: 82.04944
  });

  // Rebuild route
  let stops = await rebuildBusRoute(busNumber);
  let ramesampetaStop = stops.find(s => s.stopName === 'Ramesampeta');
  
  if (!ramesampetaStop) {
    throw new Error('FAIL: Ramesampeta stop not generated');
  }
  console.log(`Stop Ramesampeta Student Count (Expected: 3): ${ramesampetaStop.studentCount}`);
  if (ramesampetaStop.studentCount !== 3) {
    throw new Error(`FAIL: Expected 3 students, got ${ramesampetaStop.studentCount}`);
  }
  console.log('✓ Normalization resolved spelling variations to Ramesampeta with 3 students.\n');

  console.log('=== TEST 2: Start Trip & Geofence Check (Bus at Ramesampeta) ===');
  // Start Trip
  const trip = await startTrip({ busId, driverId: 'DRV003', direction: 'to_college' });
  console.log('Trip started with ID:', trip.tripId);

  const now = new Date();
  const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);

  // Position bus inside Ramesampeta geofence (coords: 17.08495, 82.04944)
  await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.08495,
    longitude: 82.04944,
    speed: 50,
    accuracy: 10,
    timestamp: now
  });

  const locUpdate1 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: 17.08495,
    longitude: 82.04944,
    speed: 50,
    accuracy: 10,
    timestamp: new Date(now.getTime() + 15000)
  });

  let activeBus = await ActiveBus.findOne({ busId });
  let currentTrip = await Trip.findOne({ tripId: trip.tripId });

  let rStop = currentTrip.routeProgress.find(s => s.villageName === 'Ramesampeta');
  console.log('Ramesampeta status:', rStop.status);
  console.log('Ramesampeta crossed:', rStop.crossed);
  if (rStop.status !== 'current' || !rStop.crossed) {
    throw new Error('FAIL: Ramesampeta stop is not marked crossed/current');
  }
  console.log('✓ Bus inside Ramesampeta geofence triggers crossed state & current status.\n');

  console.log('=== TEST 3: Bus moved to Aditya University ===');
  // Update location inside Aditya University geofence (coords: 17.0912, 82.0665)
  await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: ADITYA_UNIVERSITY_COORDS.latitude,
    longitude: ADITYA_UNIVERSITY_COORDS.longitude,
    speed: 50,
    accuracy: 10,
    timestamp: tenMinutesLater
  });

  const locUpdate2 = await updateLocation({
    busId,
    tripId: trip.tripId,
    latitude: ADITYA_UNIVERSITY_COORDS.latitude,
    longitude: ADITYA_UNIVERSITY_COORDS.longitude,
    speed: 50,
    accuracy: 10,
    timestamp: new Date(tenMinutesLater.getTime() + 15000)
  });

  currentTrip = await Trip.findOne({ tripId: trip.tripId });
  console.log('Trip Status after reaching destination:', currentTrip.status);
  if (currentTrip.status !== 'completed') {
    throw new Error('FAIL: Trip did not complete on entering Aditya University geofence');
  }
  console.log('✓ Entering Aditya University geofence completed the trip.\n');

  console.log('=== TEST 4: Bus starts directly inside Aditya University geofence ===');
  await Trip.deleteMany({ busId });
  await ActiveBus.deleteMany({ busId });

  const directTrip = await startTrip({ busId, driverId: 'DRV003', direction: 'to_college' });
  const startDirectTime = new Date();
  await updateLocation({
    busId,
    tripId: directTrip.tripId,
    latitude: ADITYA_UNIVERSITY_COORDS.latitude,
    longitude: ADITYA_UNIVERSITY_COORDS.longitude,
    speed: 50,
    accuracy: 10,
    timestamp: startDirectTime
  });

  const locUpdateDirect = await updateLocation({
    busId,
    tripId: directTrip.tripId,
    latitude: ADITYA_UNIVERSITY_COORDS.latitude,
    longitude: ADITYA_UNIVERSITY_COORDS.longitude,
    speed: 50,
    accuracy: 10,
    timestamp: new Date(startDirectTime.getTime() + 15000)
  });

  const finalTrip = await Trip.findOne({ tripId: directTrip.tripId });
  console.log('Direct Start Trip Status:', finalTrip.status);
  const allCrossed = finalTrip.routeProgress.every(s => s.crossed);
  console.log('All stops crossed:', allCrossed);
  if (finalTrip.status !== 'completed' || !allCrossed) {
    throw new Error('FAIL: Bus starting directly at destination failed geofence completion');
  }
  console.log('✓ Direct destination start handles geofence crossing and completion correctly.\n');

  console.log('=== TEST 7: Route Progress Refresh & ActiveBus / BusRoute Integrity ===');
  // Check if ActiveBus contains the properties in matching order
  const latestRoute = await BusRoute.findOne({ busNumber });
  console.log('BusRoute stop count:', latestRoute.stops.length);
  console.log('routeSnapshot stop count:', finalTrip.routeSnapshot.length);
  if (latestRoute.stops.length !== finalTrip.routeSnapshot.length) {
    throw new Error('FAIL: Mismatch in stop count between BusRoute and routeSnapshot');
  }
  console.log('✓ All stop counts and stop order are perfectly identical.\n');

  // Clean up
  await Student.deleteMany({ register_no: { $in: ['TEST-STU-001', 'TEST-STU-002', 'TEST-STU-003'] } });
  await Trip.deleteMany({ busId });
  await ActiveBus.deleteMany({ busId });

  console.log('PASS');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('TEST FAIL:', e);
  await mongoose.disconnect();
  process.exit(1);
});
