import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from './src/models/Student.js';
import { Bus } from './src/models/Bus.js';
import { Trip } from './src/models/Trip.js';
import { Route } from './src/models/Route.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { LiveLocation } from './src/models/LiveLocation.js';
import { BusStop } from './src/models/BusStop.js';
import { ScanLog } from './src/models/ScanLog.js';
import { BusRoute } from './src/models/BusRoute.js';
import { startTrip, updateLocation, stopTrip } from './src/services/trackingService.js';
import { setIO } from './src/config/socket.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
const SCANNER_TOKEN = 'SCANNER_BUS03';

// Mock Socket.IO to avoid errors
setIO({
  to: () => ({ emit: () => {} }),
  emit: () => {}
});

async function runTests() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  // Clear data for testing
  await Student.deleteMany({ register_no: { $in: ['TEST-STU-1', 'TEST-STU-2'] } });
  await Bus.deleteMany({ busNumber: { $in: ['BUS-3', 'BUS-5'] } });
  await BusRoute.deleteMany({ busNumber: { $in: ['BUS-3', 'BUS-5'] } });
  await Route.deleteMany({ routeId: { $in: ['ROUTE-ID-3', 'ROUTE-ID-5'] } });
  await Trip.deleteMany({ $or: [{ busId: { $in: ['BUS-ID-3', 'BUS-ID-5'] } }, { driverId: 'DRV001' }] });
  await ActiveBus.deleteMany({ $or: [{ busId: { $in: ['BUS-ID-3', 'BUS-ID-5'] } }, { driverId: 'DRV001' }] });
  await LiveLocation.deleteMany({ busId: { $in: ['BUS-ID-3', 'BUS-ID-5'] } });
  await BusStop.deleteMany({ stopName: { $in: ['Ramesampeta', 'Aditya University'] } });
  await ScanLog.deleteMany({});

  // Seed routes
  await Route.create({
    routeId: 'ROUTE-ID-3',
    routeName: 'Test Route 3',
    collegeLocation: {
      name: 'Aditya University',
      latitude: 17.0912,
      longitude: 82.0665
    },
    villages: [
      { villageId: 'Ramesampeta', villageName: 'Ramesampeta', sequence: 1, latitude: 17.0864, longitude: 82.0945 },
      { villageId: 'Aditya University', villageName: 'Aditya University', sequence: 2, latitude: 17.0912, longitude: 82.0665 }
    ]
  });
  await Route.create({
    routeId: 'ROUTE-ID-5',
    routeName: 'Test Route 5',
    collegeLocation: {
      name: 'Aditya University',
      latitude: 17.0912,
      longitude: 82.0665
    },
    villages: [
      { villageId: 'Ramesampeta', villageName: 'Ramesampeta', sequence: 1, latitude: 17.0864, longitude: 82.0945 },
      { villageId: 'Aditya University', villageName: 'Aditya University', sequence: 2, latitude: 17.0912, longitude: 82.0665 }
    ]
  });

  // 1. Seed stops
  const ramesampetaStop = await BusStop.create({
    stopName: 'Ramesampeta',
    latitude: 17.0864,
    longitude: 82.0945,
    radiusMeters: 250,
    active: true
  });

  const adityaStop = await BusStop.create({
    stopName: 'Aditya University',
    latitude: 17.0912,
    longitude: 82.0665,
    radiusMeters: 300,
    active: true
  });

  // 2. Seed student 1 (assigned to BUS-3)
  const student = await Student.create({
    _id: 'STU-TEST-1',
    register_no: 'TEST-STU-1',
    name: 'Test Student One',
    gender: 'Male',
    year: '1st Year',
    department: 'CSE',
    section: 'A',
    date_of_birth: '2005-01-01',
    address: { door_no: '1', street: '1', city: '1', state: 'AP', pincode: '533437' },
    bus_details: { bus_id: 'BUS-ID-3', bus_number: 'BUS-3', route_name: 'Test Route', boarding_point: 'Ramesampeta' },
    qr_student_id: 'TEST-STU-1',
    parent_id: 'PAR-TEST-1',
    driver_id: 'DRV001',
    parent_phone: '9999999999',
    status: 'active',
    trackingStatus: 'REACHED_HOME'
  });

  // 3. Seed student 2 (assigned to BUS-5)
  const student2 = await Student.create({
    _id: 'STU-TEST-2',
    register_no: 'TEST-STU-2',
    name: 'Test Student Two',
    gender: 'Female',
    year: '1st Year',
    department: 'ECE',
    section: 'B',
    date_of_birth: '2005-01-01',
    address: { door_no: '2', street: '2', city: '2', state: 'AP', pincode: '533437' },
    bus_details: { bus_id: 'BUS-ID-5', bus_number: 'BUS-5', route_name: 'Test Route', boarding_point: 'Ramesampeta' },
    qr_student_id: 'TEST-STU-2',
    parent_id: 'PAR-TEST-2',
    driver_id: 'DRV001',
    parent_phone: '8888888888',
    status: 'active',
    trackingStatus: 'REACHED_HOME'
  });

  // 4. Seed buses
  const bus3 = await Bus.create({ busId: 'BUS-ID-3', busNumber: 'BUS-3', routeId: 'ROUTE-ID-3', route_name: 'Test Route', capacity: 40, status: 'active' });
  const bus5 = await Bus.create({ busId: 'BUS-ID-5', busNumber: 'BUS-5', routeId: 'ROUTE-ID-5', route_name: 'Test Route', capacity: 40, status: 'active' });

  // 5. Seed BusRoute
  await BusRoute.create({
    busNumber: 'BUS-3',
    stops: [
      { stopName: 'Ramesampeta', sequence: 1, latitude: 17.0864, longitude: 82.0945, studentCount: 1, allowedRadiusMeters: 250 },
      { stopName: 'Aditya University', sequence: 2, latitude: 17.0912, longitude: 82.0665, studentCount: 0, allowedRadiusMeters: 300 }
    ]
  });

  // Helper function to hit scan endpoint
  const scanRequest = async (body) => {
    await ScanLog.deleteMany({});
    const response = await fetch('http://localhost:5000/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanner_token: SCANNER_TOKEN, ...body })
    });
    return { status: response.status, data: await response.json() };
  };

  const results = [];
  const logTest = (num, name, passed, info = '') => {
    results.push({ num, name, passed, info });
    console.log(`Test ${num}: ${name} -> ${passed ? '✅ PASSED' : '❌ FAILED'} ${info ? `(${info})` : ''}`);
  };

  console.log('\nStarting Verification Test Suite...\n');

  // --- PRE-TESTS: Start Trip for BUS-3 ---
  const trip = await startTrip({ busId: 'BUS-ID-3', driverId: 'DRV001', direction: 'to_college' });

  // --- Test 13: Bus GPS unavailable -> Scan rejected ---
  // Bus-3 has no GPS packets yet
  let res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(13, 'Bus GPS unavailable -> Scan rejected', res.status === 400 && res.data.ok === false && res.data.failureReason === 'No valid bus GPS available', JSON.stringify(res.data));

  // --- Test 14: GPS packet older than 60s -> Scan rejected ---
  // Send GPS update dated 2 minutes ago
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.0864,
    longitude: 82.0945,
    timestamp: new Date(Date.now() - 120000)
  });
  res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(14, 'GPS packet older than 60s -> Scan rejected', res.status === 400 && res.data.ok === false && res.data.failureReason === 'GPS packet older than 60s');

  // --- Test 15: GPS jump anomaly -> Scan rejected ---
  // Update location with fresh GPS but flag it as anomaly by jumping > 500m
  // Send 1st valid ping near Ramesampeta (17.0864, 82.0945)
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.0864,
    longitude: 82.0945,
    timestamp: new Date()
  });
  // Send 2nd jump ping (17.1500, 82.1500 is > 500m away)
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.1500,
    longitude: 82.1500,
    timestamp: new Date()
  });
  res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(15, 'GPS jump anomaly -> Scan rejected', res.status === 400 && res.data.ok === false && res.data.failureReason === 'GPS jump anomaly');

  // Clear anomaly for subsequent tests by sending two fresh consistent pings near Ramesampeta stop
  await LiveLocation.deleteMany({ busId: 'BUS-ID-3' });
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.0864,
    longitude: 82.0945,
    timestamp: new Date()
  });
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.0864,
    longitude: 82.0945,
    timestamp: new Date()
  });

  // --- Test 20: GPS jitter near stop boundary does not falsely allow scans ---
  // Reset Ramesampeta consecutive pings to 0 to simulate bus just arrived or boundary jitter
  await Trip.updateOne(
    { tripId: trip.tripId, 'routeProgress.villageName': 'Ramesampeta' },
    { $set: { 'routeProgress.$.consecutivePings': 1 } }
  );
  res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(20, 'GPS jitter near stop boundary does not falsely allow scans (requires 2 consecutive pings)', res.status === 400 && res.data.ok === false && res.data.failureReason === 'GPS jitter near stop boundary', JSON.stringify(res.data));

  // Set consecutive pings to 2 to confirm inside stop geofence for next tests
  await Trip.updateOne(
    { tripId: trip.tripId, 'routeProgress.villageName': 'Ramesampeta' },
    { $set: { 'routeProgress.$.consecutivePings': 2 } }
  );

  // --- Test 16: Bus inside village stop -> Boarding allowed ---
  res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(16, 'Bus inside village stop -> Boarding allowed', res.status === 200 && res.data.ok === true);

  // --- Test 19: Bus assigned to BUS-3, student assigned to BUS-5 -> Rejected ---
  // Try scanning student 2 (assigned to BUS-5) on BUS-3 active trip
  res = await scanRequest({ qr_student_id: 'TEST-STU-2', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(19, 'Bus assigned to BUS-3, student assigned to BUS-5 -> Rejected', res.status === 400 && res.data.ok === false && res.data.failureReason === 'Student assigned to another bus');

  // Let's move the bus to Aditya University (College Geofence)
  // Clear LiveLocation records to prevent jump warnings, then send two pings near Aditya University
  await LiveLocation.deleteMany({ busId: 'BUS-ID-3' });
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.0912,
    longitude: 82.0665,
    timestamp: new Date()
  });
  await updateLocation({
    busId: 'BUS-ID-3',
    tripId: trip.tripId,
    latitude: 17.0912,
    longitude: 82.0665,
    timestamp: new Date()
  });

  // Ensure consecutive pings for Aditya University = 2
  await Trip.updateOne(
    { tripId: trip.tripId, 'routeProgress.villageName': 'Aditya University' },
    { $set: { 'routeProgress.$.consecutivePings': 2 } }
  );

  // --- Test 17: Bus inside college geofence -> Arrival allowed ---
  res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'arrive', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(17, 'Bus inside college geofence -> Arrival allowed', res.status === 200 && res.data.ok === true, JSON.stringify(res.data));

  // Reset student state to REACHED_HOME for Test 18
  await Student.updateOne({ register_no: 'TEST-STU-1' }, { $set: { trackingStatus: 'REACHED_HOME' } });

  // --- Test 18: Bus inside college geofence -> Village boarding blocked ---
  res = await scanRequest({ qr_student_id: 'TEST-STU-1', action: 'board', bus_number: 'BUS-3', direction: 'to_college' });
  logTest(18, 'Bus inside college geofence -> Village boarding blocked', res.status === 400 && res.data.ok === false && res.data.failureReason === 'Boarding scans for village stops are blocked', JSON.stringify(res.data));

  // --- Test 11: Debug student-state endpoint returns correct geofence calculations ---
  const debugRes = await fetch(`http://localhost:5000/api/debug/student-state/TEST-STU-1`);
  const debugData = await debugRes.json();
  const debugPassed = debugRes.status === 200 && 
    debugData.studentId === 'TEST-STU-1' &&
    debugData.insideCollegeGeofence === true &&
    debugData.insideAssignedStop === false &&
    debugData.activeTripStatus === 'active';
  logTest(11, 'Debug endpoint returns correct geofence calculations', debugPassed, JSON.stringify(debugData));

  // Stop trip and close database connection
  try {
    await stopTrip({ busId: 'BUS-ID-3', tripId: trip.tripId, force: true });
  } catch (err) {}
  await mongoose.disconnect();

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== VERIFICATION SUMMARY ===`);
  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('All tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch(console.error);
