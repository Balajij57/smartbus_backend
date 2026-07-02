import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Student } from './src/models/Student.js';
import { BusRoute } from './src/models/BusRoute.js';
import { Bus } from './src/models/Bus.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { Trip } from './src/models/Trip.js';
import { ScanLog } from './src/models/ScanLog.js';
import { rebuildBusRoute } from './src/services/routeService.js';
import { startTrip, stopTrip } from './src/services/trackingService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
const API_URL = 'http://localhost:5000/api/scan';
const SCANNER_TOKEN = 'SCANNER_BUS03'; // Authorized scanner in our .env

// A simulator for IndexedDB persistence to run in Node
class IndexedDBSimulator {
  constructor(filepath) {
    this.filepath = filepath;
    this.store = {};
  }

  async open() {
    if (fs.existsSync(this.filepath)) {
      this.store = JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
    } else {
      this.store = {};
    }
  }

  async close() {
    // Simulate closing connection by saving to file and clearing memory
    fs.writeFileSync(this.filepath, JSON.stringify(this.store, null, 2));
    this.store = {};
  }

  async saveScan(scan) {
    this.store[scan.scanId] = { ...scan };
  }

  async getPendingScans() {
    return Object.values(this.store).filter(
      (s) => s.syncStatus === 'PENDING' || s.syncStatus === 'FAILED'
    );
  }
}

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB!');

  const testBusNumber = 'TEST-BUS-99';
  const testBusId = 'BUS999';
  const student1Id = 'STU_SYNC_1';
  const student2Id = 'STU_SYNC_2';

  // Cleanup old state
  console.log('\n--- Cleaning up previous test state ---');
  await Student.deleteMany({ _id: { $in: [student1Id, student2Id] } });
  await Student.deleteMany({ 'bus_details.bus_number': testBusNumber });
  await BusRoute.deleteOne({ busNumber: testBusNumber });
  await Trip.deleteMany({ busId: testBusId });
  await ActiveBus.deleteMany({ busId: testBusId });
  await ScanLog.deleteMany({ student_id: { $in: [student1Id, student2Id] } });

  // Make sure Bus-03 exists in database
  await Bus.deleteOne({ busNumber: testBusNumber });
  await Bus.create({
    busId: testBusId,
    busNumber: testBusNumber,
    routeId: 'ROUTE-C',
    status: 'active'
  });

  // 1. Adding a student with a new stop, verifying the route, and checking stop count.
  console.log('\n=== Test 1: Adding a student with a new stop & verifying route rebuild ===');
  const student1 = await Student.create({
    _id: student1Id,
    register_no: 'REG_SYNC_1',
    name: 'Rajesh',
    bus_details: {
      bus_id: testBusId,
      bus_number: testBusNumber,
      route_name: 'Route-C',
      boarding_point: 'Venkatapuram'
    },
    boardingPoint: 'Venkatapuram',
    landmark: 'Landmark A',
    latitude: 17.0269,
    longitude: 81.8797,
    allowedRadiusMeters: 200,
    parent_phone: '9133708513',
    trackingStatus: 'REACHED_HOME',
    status: 'active'
  });

  // Rebuild happens automatically in student POST, but here we can rebuild and query
  const stops = await rebuildBusRoute(testBusNumber);
  console.log('Stops generated:', stops.map(s => s.stopName));
  if (stops.length !== 2) {
    throw new Error(`Expected exactly 2 stops (Venkatapuram and Aditya University), got ${stops.length}`);
  }
  if (stops[0].stopName !== 'Venkatapuram') {
    throw new Error(`Expected first stop to be Venkatapuram, got ${stops[0].stopName}`);
  }
  console.log('✓ Stop count and stop name verified.');

  // 2. Order of Morning Route stops and order of Evening Route reversed stops.
  console.log('\n=== Test 2: Order of Morning and Evening Route Stops ===');
  const morningTrip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'to_college'
  });
  console.log('Morning trip start stop:', morningTrip.routeProgress[0].villageName);
  console.log('Morning trip end stop:', morningTrip.routeProgress[1].villageName);
  if (morningTrip.routeProgress[0].villageName !== 'Venkatapuram' || morningTrip.routeProgress[1].villageName !== 'Aditya University') {
    throw new Error('Morning route order is incorrect');
  }

  // Finalize morning trip manually to start evening trip
  morningTrip.status = 'completed';
  await morningTrip.save();
  await ActiveBus.deleteOne({ busId: testBusId });

  const eveningTrip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'from_college'
  });
  console.log('Evening trip start stop:', eveningTrip.routeProgress[0].villageName);
  console.log('Evening trip end stop:', eveningTrip.routeProgress[1].villageName);
  if (eveningTrip.routeProgress[0].villageName !== 'Aditya University' || eveningTrip.routeProgress[1].villageName !== 'Venkatapuram') {
    throw new Error('Evening route order is not reversed');
  }
  eveningTrip.status = 'completed';
  await eveningTrip.save();
  await ActiveBus.deleteOne({ busId: testBusId });
  console.log('✓ Morning and Evening Route ordering/reversal verified.');

  // 3. Rejecting invalid state transitions.
  console.log('\n=== Test 3: Rejecting invalid state transitions ===');
  // Student starts at REACHED_HOME. Try invalid scans.
  const invalidTransitions = [
    { scanMode: 'College Arrival', direction: 'to_college', expectedError: 'Cannot arrive at college' },
    { scanMode: 'Home Drop-Off', direction: 'from_college', expectedError: 'Cannot drop off at home' }
  ];

  for (const test of invalidTransitions) {
    const testTrip = await startTrip({
      busId: testBusId,
      driverId: 'DRV001',
      direction: test.direction
    });

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_student_id: student1Id,
        action: test.scanMode.includes('Boarding') ? 'board' : 'dropoff',
        scanMode: test.scanMode,
        scanner_token: SCANNER_TOKEN,
        bus_number: testBusNumber,
        direction: test.direction
      })
    });
    const body = await res.json();
    console.log(`Scan Mode: ${test.scanMode} -> Status: ${res.status}, Error: ${body.error}`);

    // Cleanup active trip
    await Trip.deleteOne({ tripId: testTrip.tripId });
    await ActiveBus.deleteOne({ busId: testBusId });

    if (res.status !== 400 || !body.error.includes(test.expectedError)) {
      throw new Error(`Expected transition to be blocked with error: "${test.expectedError}"`);
    }
  }
  console.log('✓ Invalid transitions correctly blocked.');

  // 4. Rejecting duplicate scans within 60 seconds.
  console.log('\n=== Test 4: Rejecting duplicate scans within 60 seconds ===');
  // Start active trip
  const test4Trip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'to_college'
  });

  // Perform valid morning boarding
  const firstScanRes = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: student1Id,
      action: 'board',
      scanMode: 'Morning Boarding',
      scanner_token: SCANNER_TOKEN,
      bus_number: testBusNumber,
      direction: 'to_college'
    })
  });
  console.log('First scan status:', firstScanRes.status);
  if (firstScanRes.status !== 201) {
    const body = await firstScanRes.json();
    await Trip.deleteOne({ tripId: test4Trip.tripId });
    await ActiveBus.deleteOne({ busId: testBusId });
    throw new Error(`First scan failed: ${JSON.stringify(body)}`);
  }

  // Attempt duplicate scan immediately
  const dupScanRes = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: student1Id,
      action: 'board',
      scanMode: 'Morning Boarding',
      scanner_token: SCANNER_TOKEN,
      bus_number: testBusNumber,
      direction: 'to_college'
    })
  });
  const dupBody = await dupScanRes.json();
  console.log('Duplicate scan status:', dupScanRes.status, 'Body:', dupBody);

  // Cleanup active trip
  await Trip.deleteOne({ tripId: test4Trip.tripId });
  await ActiveBus.deleteOne({ busId: testBusId });

  if (dupScanRes.status !== 400 || dupBody.error !== 'Duplicate scan detected') {
    throw new Error('Expected duplicate scan rejection within 60 seconds');
  }
  console.log('✓ Duplicate scan protection verified.');

  // 5. Verifying geofence drop-offs.
  console.log('\n=== Test 5: Verifying geofence drop-offs ===');
  // First update student trackingStatus manually to BOARDED_FROM_COLLEGE (simulate evening boarding)
  // to avoid cooldown constraint and trip requirements
  await Student.updateOne({ _id: student1Id }, { trackingStatus: 'BOARDED_FROM_COLLEGE' });
  await ScanLog.deleteMany({ student_id: student1Id });

  // Start active evening trip for GPS dropoff geofencing
  const geofenceTrip = await Trip.create({
    tripId: 'TRIP_GEOFENCE_TEST_VERIFY',
    busId: testBusId,
    driverId: 'DRV001',
    routeId: 'ROUTE-C',
    direction: 'from_college',
    startTime: new Date(),
    status: 'active',
    routeProgress: [
      {
        villageId: 'Venkatapuram',
        villageName: 'Venkatapuram',
        sequence: 1,
        latitude: 17.0269,
        longitude: 81.8797,
        crossed: false,
        status: 'pending'
      }
    ]
  });

  // Set bus location far away from Venkatapuram (distance > allowedRadius)
  await ActiveBus.create({
    busId: testBusId,
    busNumber: testBusNumber,
    currentTripId: geofenceTrip.tripId,
    location: {
      type: 'Point',
      coordinates: [80.0, 16.0] // Far away
    },
    lastUpdatedAt: new Date()
  });

  // Attempt dropoff far away
  const farRes = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: student1Id,
      action: 'dropoff',
      scanMode: 'Home Drop-Off',
      scanner_token: SCANNER_TOKEN,
      bus_number: testBusNumber,
      direction: 'from_college'
    })
  });
  const farBody = await farRes.json();
  console.log('Far drop-off status:', farRes.status, 'Error:', farBody.error);
  if (farRes.status !== 400 || !farBody.error.includes('Drop-off denied')) {
    throw new Error('Expected drop-off to be denied due to distance');
  }

  // Update bus location within radius
  await ActiveBus.updateOne({ busId: testBusId }, {
    location: {
      type: 'Point',
      coordinates: [81.8798, 17.0270] // Within 200m
    }
  });

  // Attempt dropoff close by
  const closeRes = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: student1Id,
      action: 'dropoff',
      scanMode: 'Home Drop-Off',
      scanner_token: SCANNER_TOKEN,
      bus_number: testBusNumber,
      direction: 'from_college'
    })
  });
  console.log('Close drop-off status:', closeRes.status);
  if (closeRes.status !== 201) {
    const body = await closeRes.json();
    throw new Error(`Close drop-off failed: ${JSON.stringify(body)}`);
  }
  const updatedStudent1 = await Student.findById(student1Id);
  console.log('Student trackingStatus after drop-off:', updatedStudent1.trackingStatus);
  if (updatedStudent1.trackingStatus !== 'REACHED_HOME') {
    throw new Error('Expected student trackingStatus to transition to REACHED_HOME');
  }
  await Trip.deleteOne({ tripId: geofenceTrip.tripId });
  await ActiveBus.deleteOne({ busId: testBusId });
  console.log('✓ Geofence drop-offs verified successfully.');

  // 6. Exception marking and verifying trip completion can be finalized.
  console.log('\n=== Test 6: Exception marking & Trip completion finalization ===');
  // Create student 2 and board them
  const student2 = await Student.create({
    _id: student2Id,
    register_no: 'REG_SYNC_2',
    name: 'Arjun',
    bus_details: {
      bus_id: testBusId,
      bus_number: testBusNumber,
      route_name: 'Route-C',
      boarding_point: 'Venkatapuram'
    },
    boardingPoint: 'Venkatapuram',
    latitude: 17.0269,
    longitude: 81.8797,
    trackingStatus: 'BOARDED_TO_COLLEGE',
    status: 'active'
  });

  const activeMorningTrip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'to_college'
  });

  // Try to stop trip while student2 is still BOARDED_TO_COLLEGE and no exception is set
  try {
    await stopTrip({ busId: testBusId, tripId: activeMorningTrip.tripId });
    throw new Error('Expected stopTrip to fail because of boarded student without exception');
  } catch (err) {
    console.log('stopTrip rejected as expected:', err.message);
    if (!err.message.includes('boarded student(s) have not arrived at college yet')) {
      throw err;
    }
  }

  // Set exception for student 2
  const excRes = await fetch(`http://localhost:5000/api/students/${student2Id}/exception`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exception: 'Sick Leave' })
  });
  console.log('Exception update status:', excRes.status);
  const excStudent = await Student.findById(student2Id);
  console.log('Student 2 exception set to:', excStudent.attendanceException);

  // Now stop trip should succeed
  const completedTrip = await stopTrip({ busId: testBusId, tripId: activeMorningTrip.tripId });
  console.log('Trip completion status:', completedTrip.status);
  if (completedTrip.status !== 'completed') {
    throw new Error('Expected trip to be completed');
  }
  console.log('✓ Exception marking and trip completion verified.');

  // 7. Generating attendance summaries.
  console.log('\n=== Test 7: Generating attendance summaries ===');
  const sumRes = await fetch('http://localhost:5000/api/attendance/summary');
  const summary = await sumRes.json();
  console.log('Attendance Summary count:', summary.length);
  const s1Record = summary.find(r => r.registerNumber === 'REG_SYNC_1');
  const s2Record = summary.find(r => r.registerNumber === 'REG_SYNC_2');
  console.log('Student 1 summary:', s1Record);
  console.log('Student 2 summary:', s2Record);
  if (!s1Record || !s2Record) {
    throw new Error('Expected both students to be in summary');
  }
  console.log('✓ Attendance summaries verified.');

  // 8. Deleting students and confirming stops are automatically purged when student count hits 0.
  console.log('\n=== Test 8: Deleting students & automatic stop purging ===');
  await fetch(`http://localhost:5000/api/students/${student1Id}`, { method: 'DELETE' });
  await fetch(`http://localhost:5000/api/students/${student2Id}`, { method: 'DELETE' });

  const finalStops = await BusRoute.findOne({ busNumber: testBusNumber });
  console.log('Remaining stops for Bus-03:', finalStops ? finalStops.stops.length : 0);
  if (finalStops && finalStops.stops.length !== 0) {
    throw new Error('Expected stops to be purged when student count is 0');
  }
  console.log('✓ Stops automatically purged when student count hits 0.');

  // 9. Duplicate Upload Protection: Call the scan endpoint twice with the same scanId and assert no duplicate log is created.
  console.log('\n=== Test 9: Duplicate upload protection via scanId ===');
  // Re-create student 1 for scanning
  await ScanLog.deleteMany({ student_id: student1Id });
  await Student.create({
    _id: student1Id,
    register_no: 'REG_SYNC_1',
    name: 'Rajesh',
    bus_details: {
      bus_id: testBusId,
      bus_number: testBusNumber,
      route_name: 'Route-C',
      boarding_point: 'Venkatapuram'
    },
    boardingPoint: 'Venkatapuram',
    latitude: 17.0269,
    longitude: 81.8797,
    trackingStatus: 'REACHED_HOME',
    status: 'active'
  });

  const test9Trip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'to_college'
  });

  const scanId = `SCAN-UUID-${Date.now()}`;
  const scanPayload = {
    qr_student_id: student1Id,
    action: 'board',
    scanMode: 'Morning Boarding',
    scanner_token: SCANNER_TOKEN,
    bus_number: testBusNumber,
    scanId
  };

  const upload1 = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scanPayload)
  });
  const body1 = await upload1.json();
  console.log('First upload status:', upload1.status, 'Log ID:', body1.log?.id);

  const upload2 = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scanPayload)
  });
  const body2 = await upload2.json();
  console.log('Second upload status:', upload2.status, 'Message:', body2.sms?.body);

  // Cleanup trip
  await Trip.deleteOne({ tripId: test9Trip.tripId });
  await ActiveBus.deleteOne({ busId: testBusId });

  if (body2.log.id !== body1.log.id) {
    throw new Error('Expected duplicate upload request to return existing scan log');
  }
  const countLogs = await ScanLog.countDocuments({ id: scanId });
  console.log('Logs matching scanId in DB:', countLogs);
  if (countLogs !== 1) {
    throw new Error('Expected exactly 1 scan log in DB for scanId');
  }
  console.log('✓ Duplicate upload protection verified.');

  // 10. Device Restart Recovery / Queue Persistence Simulation:
  console.log('\n=== Test 10: Device Restart Recovery / Queue Persistence Simulation ===');
  const dbFilepath = path.join(__dirname, 'mock_indexeddb.json');
  if (fs.existsSync(dbFilepath)) fs.unlinkSync(dbFilepath);

  // Create 10 distinct students to avoid duplicate scan cooldown checks
  console.log('Creating 10 temporary students for recovery queue test...');
  const recoveryStudentIds = [];
  for (let i = 1; i <= 10; i++) {
    const rStuId = `STU_RECOVERY_${i}`;
    recoveryStudentIds.push(rStuId);
    await Student.create({
      _id: rStuId,
      register_no: `REG_RECOVERY_${i}`,
      name: `Recovery Student ${i}`,
      bus_details: {
        bus_id: testBusId,
        bus_number: testBusNumber,
        route_name: 'Route-C',
        boarding_point: 'Venkatapuram'
      },
      boardingPoint: 'Venkatapuram',
      latitude: 17.0269,
      longitude: 81.8797,
      trackingStatus: 'REACHED_HOME',
      status: 'active'
    });
  }

  // Close connection and open new context simulation
  let indexedDBInstance = new IndexedDBSimulator(dbFilepath);
  await indexedDBInstance.open();

  console.log('Writing 10 scans to IndexedDB simulation...');
  for (let i = 1; i <= 10; i++) {
    await indexedDBInstance.saveScan({
      scanId: `RECOVERY_SCAN_ID_${i}`,
      studentId: `STU_RECOVERY_${i}`,
      registerNo: `REG_RECOVERY_${i}`,
      action: 'board',
      scanMode: 'Morning Boarding',
      tripType: 'Morning Trip',
      latitude: 17.0269,
      longitude: 81.8797,
      timestamp: Date.now(),
      syncStatus: 'PENDING'
    });
  }

  // Simulate unexpected restart: close DB instance and discard memory reference
  console.log('Simulating browser/tab/device restart (closing database, clear context)...');
  await indexedDBInstance.close();
  indexedDBInstance = null;

  // Open a new context (simulate reboot & re-opening app)
  console.log('Initializing a fresh Driver Dashboard db context...');
  const newInstance = new IndexedDBSimulator(dbFilepath);
  await newInstance.open();

  const recoveredScans = await newInstance.getPendingScans();
  console.log('Recovered pending scans count:', recoveredScans.length);
  if (recoveredScans.length !== 10) {
    throw new Error(`Expected all 10 scans to survive, but got ${recoveredScans.length}`);
  }

  // Start active trip for Test 10 sync
  const test10Trip = await startTrip({
    busId: testBusId,
    driverId: 'DRV001',
    direction: 'to_college'
  });

  // Sync recovered queue sequentially and verify
  console.log('Starting sync for recovered scans queue...');
  for (const scan of recoveredScans) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_student_id: scan.studentId,
        action: scan.action,
        scanMode: scan.scanMode,
        scanner_token: SCANNER_TOKEN,
        bus_number: testBusNumber,
        scanId: scan.scanId,
        latitude: scan.latitude,
        longitude: scan.longitude,
        direction: 'to_college'
      })
    });
    console.log(`Syncing ${scan.scanId} -> Status: ${res.status}`);
    if (res.status === 201 || res.status === 200) {
      scan.syncStatus = 'SYNCED';
    } else {
      scan.syncStatus = 'FAILED';
    }
    await newInstance.saveScan(scan);
  }

  // Cleanup trip for Test 10
  await Trip.deleteOne({ tripId: test10Trip.tripId });
  await ActiveBus.deleteOne({ busId: testBusId });

  const remainingPending = await newInstance.getPendingScans();
  console.log('Remaining pending scans in IndexedDB:', remainingPending.length);
  if (remainingPending.length !== 0) {
    throw new Error('Expected all scans to be successfully synchronized and cleared from pending status');
  }

  // Cleanup simulation file & database records
  if (fs.existsSync(dbFilepath)) fs.unlinkSync(dbFilepath);
  await Student.deleteMany({ _id: student1Id });
  await Student.deleteMany({ _id: { $in: recoveryStudentIds } });
  await ScanLog.deleteMany({ id: { $regex: /^RECOVERY_SCAN_ID_/ } });
  await ScanLog.deleteOne({ id: scanId });

  console.log('\n✓ E2E Device Restart & Queue Recovery Simulation passed successfully!');

  // 11. Scanner Activation & Scan API Trip Requirement Verification
  console.log('\n=== Test 11: Scanner Activation & Scan API Trip Requirement Verification ===');
  
  // Re-create student 1 for testing
  await Student.create({
    _id: student1Id,
    register_no: 'REG_SYNC_1',
    name: 'Rajesh',
    bus_details: {
      bus_id: testBusId,
      bus_number: testBusNumber,
      route_name: 'Route-C',
      boarding_point: 'Venkatapuram'
    },
    boardingPoint: 'Venkatapuram',
    latitude: 17.0269,
    longitude: 81.8797,
    trackingStatus: 'REACHED_HOME',
    status: 'active'
  });

  // A. Verify Scan API rejects request when no active trip exists
  const noTripRes = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_student_id: student1Id,
      action: 'board',
      scanMode: 'Morning Boarding',
      scanner_token: SCANNER_TOKEN,
      bus_number: testBusNumber,
      direction: 'to_college'
    })
  });
  const noTripBody = await noTripRes.json();
  console.log('Scan status with no active trip:', noTripRes.status, 'Error:', noTripBody.error);
  if (noTripRes.status !== 400 || noTripBody.error !== 'No active trip exists for this bus.') {
    throw new Error('Expected scan to be rejected with 400 and active trip error');
  }
  console.log('✓ API correctly rejects scan without active trip.');

  // Cleanup test student 1
  await Student.deleteMany({ _id: student1Id });

  console.log('\n✓ E2E Scanner Activation & Inactive Trip Verification passed successfully!');
  console.log('\n======================================');
  console.log('ALL 11 VERIFICATION POINTS PASSED!');
  console.log('======================================');

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('❌ Test failed with error:', e);
  await mongoose.disconnect();
  process.exit(1);
});
