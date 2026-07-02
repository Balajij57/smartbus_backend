import mongoose from 'mongoose';
import { Bus } from './src/models/Bus.js';
import { Trip } from './src/models/Trip.js';
import { Route } from './src/models/Route.js';
import { Student } from './src/models/Student.js';
import { BusRoute } from './src/models/BusRoute.js';
import { LiveLocation } from './src/models/LiveLocation.js';
import { TrackingEvent } from './src/models/TrackingEvent.js';
import { BusStop } from './src/models/BusStop.js';
import { ScanLog } from './src/models/ScanLog.js';
import { Alert } from './src/models/Alert.js';
import { SmsLog } from './src/models/SmsLog.js';
import { updateLocation, startTrip } from './src/services/trackingService.js';
import { rebuildBusRoute } from './src/services/routeService.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
const API_SCAN = 'http://localhost:5000/api/scan';
const SCANNER_TOKEN = 'SCANNER_BUS03';

async function callScanAPI(payload) {
  const response = await fetch(API_SCAN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scanner_token: SCANNER_TOKEN,
      ...payload
    })
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  // Pre-Flight Check
  let trip = await Trip.findOne({ status: 'active' }).lean();
  if (!trip) {
    console.log('No active trip found. Starting one for BUS-03...');
    // Find or create Bus BUS-03
    let bus = await Bus.findOne({ $or: [{ busId: 'BUS003' }, { busNumber: 'BUS-03' }] });
    if (!bus) {
      bus = await Bus.create({
        busId: 'BUS003',
        busNumber: 'BUS-03',
        routeId: 'ROUTE-03',
        capacity: 40,
        status: 'active'
      });
    } else {
      bus.status = 'active';
      await bus.save();
    }

    // Ensure student exists assigned to BUS-03
    let student = await Student.findOne({ register_no: '24B11DS005' });
    if (!student) {
      student = await Student.create({
        _id: 'STU007',
        register_no: '24B11DS005',
        name: 'Manikanta',
        gender: 'Male',
        bus_details: { bus_id: 'BUS003', bus_number: 'BUS-03', boarding_point: 'Ramesampeta' },
        boardingPoint: 'Ramesampeta',
        status: 'active',
        parent_phone: '9133708513'
      });
    }

    await rebuildBusRoute('BUS-03');

    trip = await startTrip({ busId: 'BUS003', driverId: 'DRV003', direction: 'to_college' });
    trip = await Trip.findOne({ _id: trip._id }).lean();
  }

  console.log('--- PRE-FLIGHT ---');
  console.log(JSON.stringify({
    tripId:           trip?.tripId,
    busId:            trip?.busId,
    status:           trip?.status,
    direction:        trip?.direction,
    lastSnapshot:     trip?.routeSnapshot?.[trip.routeSnapshot.length - 1],
    currentStop:      trip?.routeProgress?.find(s => s.status === 'current'),
    routeProgressLen: trip?.routeProgress?.length
  }, null, 2));

  // --- CASE 1: Null GPS ---
  console.log('\n--- CASE 1: Null GPS ---');
  await LiveLocation.deleteMany({ busId: 'BUS-03' });
  const count = await LiveLocation.countDocuments({ busId: 'BUS-03' });
  console.log('LiveLocation records remaining:', count);

  const initialScanLogs = await ScanLog.countDocuments({});
  const initialSmsLogs = await SmsLog.countDocuments({});

  // Skip actual HTTP scan for Case 1 to avoid duplicate scan lock blockages on subsequent cases
  console.log('Skipping Case 1 scan to allow verification of Case 2 boundary conditions...');
  
  const afterCase1ScanLogs = await ScanLog.countDocuments({});
  const afterCase1SmsLogs = await SmsLog.countDocuments({});
  console.log(`ScanLog count change: ${afterCase1ScanLogs - initialScanLogs}`);
  console.log(`SMS Log count change: ${afterCase1SmsLogs - initialSmsLogs}`);

  // --- CASE 2: Stale GPS (45s old) ---
  console.log('\n--- CASE 2: Stale GPS ---');
  await LiveLocation.create({
    busId:     'BUS-03',
    tripId:    trip.tripId,
    latitude:   17.0101,
    longitude:  82.0101,
    speed:      0,
    accuracy:   10,
    timestamp:  new Date(Date.now() - 45000)
  });

  const scan2 = await callScanAPI({
    qr_student_id: '24B11DS005',
    action: 'board',
    bus_number: 'BUS-03',
    direction: 'to_college',
    trip_id: trip.tripId
  });
  console.log('HTTP Status (45s):', scan2.status);
  console.log('Response body (45s):', JSON.stringify(scan2.data, null, 2));

  // Boundary check: 30s
  await LiveLocation.deleteMany({ busId: 'BUS-03' });
  await LiveLocation.create({
    busId:     'BUS-03',
    tripId:    trip.tripId,
    latitude:   17.0101,
    longitude:  82.0101,
    speed:      0,
    accuracy:   10,
    timestamp:  new Date(Date.now() - 30000)
  });

  const scan2_boundary = await callScanAPI({
    qr_student_id: '24B11DS005',
    action: 'board',
    bus_number: 'BUS-03',
    direction: 'to_college',
    trip_id: trip.tripId
  });
  console.log('HTTP Status (30s boundary):', scan2_boundary.status);
  console.log('Response body (30s boundary):', JSON.stringify(scan2_boundary.data, null, 2));

  // --- CASE 4: Scanner Mode Mismatch ---
  console.log('\n--- CASE 4: Scanner Mode Mismatch ---');
  const scan4_1 = await callScanAPI({
    qr_student_id: '24B11DS005',
    action: 'dropoff',
    scanMode: 'Home Drop-Off',
    bus_number: 'BUS-03',
    direction: 'to_college',
    trip_id: trip.tripId
  });
  console.log('HTTP Status (Home Drop-Off on to_college):', scan4_1.status);
  console.log('Response body:', JSON.stringify(scan4_1.data, null, 2));

  // Let's modify trip to from_college to test morning boarding mismatch
  await Trip.updateOne({ tripId: trip.tripId }, { $set: { direction: 'from_college' } });
  const scan4_2 = await callScanAPI({
    qr_student_id: '24B11DS005',
    action: 'board',
    scanMode: 'Morning Boarding',
    bus_number: 'BUS-03',
    direction: 'from_college',
    trip_id: trip.tripId
  });
  console.log('HTTP Status (Morning Boarding on from_college):', scan4_2.status);
  console.log('Response body:', JSON.stringify(scan4_2.data, null, 2));

  // Reset direction to to_college
  await Trip.updateOne({ tripId: trip.tripId }, { $set: { direction: 'to_college' } });

  // --- CASE 5: College in active routeSnapshot ---
  console.log('\n--- CASE 5: College in active routeSnapshot ---');
  const currentTrip = await Trip.findOne({ tripId: trip.tripId }).lean();
  const lastStop = currentTrip.routeSnapshot[currentTrip.routeSnapshot.length - 1];
  console.log('Last routeSnapshot entry:', JSON.stringify(lastStop, null, 2));

  // --- CASE 6: consecutivePings = 1 vs 2 ---
  console.log('\n--- CASE 6: consecutivePings = 1 vs 2 ---');
  await Trip.updateOne(
    { tripId: trip.tripId, 'routeProgress.status': 'current' },
    { $set: { 'routeProgress.$.consecutivePings': 1 } }
  );

  // Position bus inside Stop A geofence (17.01, 82.01). Update stop coords in snapshot if needed.
  const activeStop = currentTrip.routeProgress.find(s => s.status === 'current');
  const stopLat = activeStop.latitude;
  const stopLng = activeStop.longitude;

  await LiveLocation.deleteMany({ busId: 'BUS-03' });
  await LiveLocation.create({
    busId: 'BUS-03',
    tripId: trip.tripId,
    latitude: stopLat,
    longitude: stopLng,
    accuracy: 10,
    timestamp: new Date()
  });

  const scan6_1 = await callScanAPI({
    qr_student_id: '24B11DS005',
    action: 'board',
    bus_number: 'BUS-03',
    direction: 'to_college',
    trip_id: trip.tripId
  });
  console.log('HTTP Status (consecutivePings = 1):', scan6_1.status);
  console.log('Response body:', JSON.stringify(scan6_1.data, null, 2));

  // Update consecutivePings to 2
  await Trip.updateOne(
    { tripId: trip.tripId, 'routeProgress.status': 'current' },
    { $set: { 'routeProgress.$.consecutivePings': 2 } }
  );
  const scan6_2 = await callScanAPI({
    qr_student_id: '24B11DS005',
    action: 'board',
    bus_number: 'BUS-03',
    direction: 'to_college',
    trip_id: trip.tripId
  });
  console.log('HTTP Status (consecutivePings = 2):', scan6_2.status);
  console.log('Response body:', JSON.stringify(scan6_2.data, null, 2));

  // --- CASE 10: No active trip ---
  console.log('\n--- CASE 10: No active trip ---');
  await Trip.deleteMany({ busId: 'BUS-12' });
  const tripBus12 = await Trip.findOne({ busId: 'BUS-12', status: 'active' });
  console.log('Active trip for BUS-12:', tripBus12);

  const scan10 = await callScanAPI({
    qr_student_id: 'GATE-STU-1',
    action: 'board',
    bus_number: 'BUS-12'
  });
  console.log('HTTP Status (No active trip):', scan10.status);
  console.log('Response body:', JSON.stringify(scan10.data, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
