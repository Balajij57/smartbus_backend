import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Trip } from '../src/models/Trip.js';
import { Route } from '../src/models/Route.js';
import { Student } from '../src/models/Student.js';
import { BusRoute } from '../src/models/BusRoute.js';
import { LiveLocation } from '../src/models/LiveLocation.js';
import { TrackingEvent } from '../src/models/TrackingEvent.js';
import { BusStop } from '../src/models/BusStop.js';
import { ScanLog } from '../src/models/ScanLog.js';
import { updateLocation, startTrip } from '../src/services/trackingService.js';
import { rebuildBusRoute } from '../src/services/routeService.js';
import { ActiveBus } from '../src/models/ActiveBus.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
const API_SCAN = 'http://localhost:5000/api/scan';
const SCANNER_TOKEN = 'SCANNER_BUS12';

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

  const busId = 'GATE-BUS';
  const tripId = 'GATE-TRIP';
  const routeId = 'GATE-ROUTE';
  const busNumber = 'BUS-12';

  // Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber }] });
  await Trip.deleteMany({ $or: [{ busId }, { tripId }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ 'bus_details.bus_number': busNumber });
  await BusRoute.deleteMany({ busNumber });
  await ScanLog.deleteMany({ student_id: { $in: ['GATE-STU-1', 'GATE-STU-2'] } });
  await TrackingEvent.deleteMany({ tripId });

  // Setup Route
  const route = await Route.create({
    routeId,
    routeName: 'Gate Test Route',
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
    _id: 'GATE-STU-1',
    register_no: 'GATE-STU-1',
    name: 'Student A',
    parent_id: 'PAR-A',
    parent_phone: '9133708513',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Stop A' },
    latitude: 17.01,
    longitude: 82.01,
    status: 'active'
  });

  await Student.create({
    _id: 'GATE-STU-2',
    register_no: 'GATE-STU-2',
    name: 'Student B',
    parent_id: 'PAR-B',
    parent_phone: '9133708514',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Stop B' },
    latitude: 17.02,
    longitude: 82.02,
    status: 'active'
  });

  // Rebuild Dynamic Route Stops
  await rebuildBusRoute(busNumber);

  // Start Trip
  const trip = await startTrip({ busId, driverId: 'GATE-DRIVER', direction: 'to_college' });
  await Trip.updateOne({ _id: trip._id }, { $set: { tripId } });
  await LiveLocation.deleteMany({ tripId });

  const startTime = Date.now();

  // --- CASE 1: Inside stop geofence, Stop is current active stop ---
  console.log('\n=== CASE 1: Inside stop geofence, Stop is current active stop ===');
  // Send 2 location updates to cross Stop A
  await updateLocation({ busId, tripId, latitude: 17.0101, longitude: 82.0101, timestamp: new Date(startTime) });
  await updateLocation({ busId, tripId, latitude: 17.0101, longitude: 82.0101, timestamp: new Date(startTime + 15000) });

  const scan1 = await callScanAPI({
    qr_student_id: 'GATE-STU-1',
    action: 'board',
    bus_number: busNumber,
    direction: 'to_college',
    trip_id: tripId
  });
  console.log(`Scan 1 status: ${scan1.status}`);
  console.log(`Scan 1 response:`, JSON.stringify(scan1.data, null, 2));

  // --- CASE 2: Outside stop geofence, Stop is current active stop ---
  console.log('\n=== CASE 2: Outside stop geofence, Stop is current active stop ===');
  // Delete ScanLog to bypass duplicate check
  await ScanLog.deleteMany({ student_id: 'GATE-STU-1' });

  // Place bus outside Stop A geofence (coords: 17.0125, 82.0125 is ~390m away).
  // Use direct DB writes to prevent triggering any automatic progress status updates.
  await ActiveBus.updateOne(
    { busId },
    { $set: { 'location.coordinates': [82.0125, 17.0125], lastGpsUpdateAt: new Date(startTime + 45000) } }
  );
  await LiveLocation.create({
    busId, tripId, latitude: 17.0125, longitude: 82.0125, timestamp: new Date(startTime + 45000)
  });

  const scan2 = await callScanAPI({
    qr_student_id: 'GATE-STU-1',
    action: 'board',
    bus_number: busNumber,
    direction: 'to_college',
    trip_id: tripId
  });
  console.log(`Scan 2 status: ${scan2.status}`);
  console.log(`Scan 2 response:`, JSON.stringify(scan2.data, null, 2));

  // --- CASE 3: Inside stop geofence, Stop not yet active in sequence ---
  console.log('\n=== CASE 3: Inside stop geofence, Stop not yet active in sequence ===');
  // Ensure Stop A is current (seq 1), Stop B is pending (seq 2) in trip progress
  await Trip.updateOne(
    { tripId },
    {
      $set: {
        'routeProgress.0.crossed': false,
        'routeProgress.0.status': 'current',
        'routeProgress.1.crossed': false,
        'routeProgress.1.status': 'pending'
      }
    }
  );

  // Position bus inside Stop B geofence directly via DB write (latitude 17.0201, longitude 82.0201)
  await ActiveBus.updateOne(
    { busId },
    { $set: { 'location.coordinates': [82.0201, 17.0201], lastGpsUpdateAt: new Date(startTime + 75000) } }
  );
  await LiveLocation.create({
    busId, tripId, latitude: 17.0201, longitude: 82.0201, timestamp: new Date(startTime + 75000)
  });

  const scan3 = await callScanAPI({
    qr_student_id: 'GATE-STU-2',
    action: 'board',
    bus_number: busNumber,
    direction: 'to_college',
    trip_id: tripId
  });
  console.log(`Scan 3 status: ${scan3.status}`);
  console.log(`Scan 3 response:`, JSON.stringify(scan3.data, null, 2));

  // --- CASE 4: Inside college geofence, Final destination drop-off ---
  console.log('\n=== CASE 4: Inside college geofence, Final destination drop-off ===');
  // Clear any ScanLogs for Student A
  await ScanLog.deleteMany({ student_id: 'GATE-STU-1' });

  // Use updateLocation to place bus at college, but only send updates to increase consecutivePings without auto-completing if possible.
  // Wait, let's look at trackingService: if nearestStop is Aditya University and consecutivePings >= 2, it completes the trip.
  // Let's send only 1 ping to Aditya University so consecutivePings is 1, which is enough for College scans (minPingsRequired is 1 for isCollegeScan === true).
  // This keeps the trip active so we can perform the scan!
  await updateLocation({ busId, tripId, latitude: 17.0912, longitude: 82.0665, timestamp: new Date(startTime + 1000000) });

  // Re-board Student A so we can drop them off
  await Student.updateOne({ _id: 'GATE-STU-1' }, { $set: { trackingStatus: 'BOARDED_TO_COLLEGE' } });

  const scan4 = await callScanAPI({
    qr_student_id: 'GATE-STU-1',
    action: 'dropoff',
    bus_number: busNumber,
    direction: 'to_college',
    trip_id: tripId
  });
  console.log(`Scan 4 status: ${scan4.status}`);
  console.log(`Scan 4 response:`, JSON.stringify(scan4.data, null, 2));

  // Cleanup
  await Bus.deleteMany({ $or: [{ busId }, { busNumber }] });
  await Trip.deleteMany({ $or: [{ busId }, { tripId }] });
  await Route.deleteMany({ routeId });
  await LiveLocation.deleteMany({ $or: [{ busId }, { tripId }] });
  await Student.deleteMany({ 'bus_details.bus_number': busNumber });
  await BusRoute.deleteMany({ busNumber });
  await TrackingEvent.deleteMany({ tripId });
  await ScanLog.deleteMany({ student_id: { $in: ['GATE-STU-1', 'GATE-STU-2'] } });

  await mongoose.disconnect();
}

run().catch(console.error);
