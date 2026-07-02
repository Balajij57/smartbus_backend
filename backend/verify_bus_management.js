import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Bus } from './src/models/Bus.js';
import { Trip } from './src/models/Trip.js';
import { Student } from './src/models/Student.js';
import { Driver } from './src/models/Driver.js';
import { ScanLog } from './src/models/ScanLog.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { startTrip, stopTrip } from './src/services/trackingService.js';
import { setIO } from './src/config/socket.js';
import http from 'http';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

let authToken = '';

function postRequest(path, body) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function patchRequest(path, body) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'PATCH',
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function deleteRequest(path) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'DELETE',
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getRequest(path) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  try {
    // 1. Clean setup
    console.log('\n--- Setting up clean test state ---');
    await Bus.deleteMany({ busNumber: 'BUS-99' });
    await Student.deleteMany({ register_no: { $in: ['STU-TEST-99', 'STU-TEST-100'] } });
    await Driver.deleteMany({ driver_id: 'DRV-TEST-99' });
    await Trip.deleteMany({ busId: 'BUS99' });
    await ActiveBus.deleteMany({ busId: 'BUS99' });
    await ScanLog.deleteMany({ bus_number: 'BUS-99' });

    // 2. Add Bus Validation (capacity and uniqueness)
    console.log('\n--- Test 1: Bus Unique & Capacity Validations ---');
    // Try invalid capacity
    const badCapRes = await postRequest('/api/buses', {
      busNumber: 'BUS-99',
      vehicleNumber: 'AP-99-TEST-9999',
      capacity: 0,
      status: 'active'
    });
    console.log('Zero capacity rejection check (expected 400):', badCapRes.status, badCapRes.body.error);

    // Create valid bus
    const validBusRes = await postRequest('/api/buses', {
      busNumber: 'BUS-99',
      busName: 'Test Express 99',
      vehicleNumber: 'AP-99-TEST-9999',
      capacity: 2,
      status: 'active'
    });
    console.log('Valid bus creation check (expected 201):', validBusRes.status, validBusRes.body.busNumber);
    await Bus.updateOne({ busNumber: 'BUS-99' }, { $set: { routeId: 'ROUTE-A', routeName: 'Route A' } });

    // Try duplicate bus number
    const dupNumRes = await postRequest('/api/buses', {
      busNumber: 'BUS-99',
      vehicleNumber: 'AP-99-TEST-0000',
      capacity: 5,
      status: 'active'
    });
    console.log('Duplicate bus number rejection check (expected 409):', dupNumRes.status, dupNumRes.body.error);

    // Try duplicate vehicle number
    const dupVehRes = await postRequest('/api/buses', {
      busNumber: 'BUS-99-DIFF',
      vehicleNumber: 'AP-99-TEST-9999',
      capacity: 5,
      status: 'active'
    });
    console.log('Duplicate vehicle number rejection check (expected 409):', dupVehRes.status, dupVehRes.body.error);

    // 3. Driver assignment validation & unassignment safety
    console.log('\n--- Test 2: Driver Assignment & Safety Locks ---');
    const driver = await Driver.create({
      _id: 'DRV-TEST-99',
      driver_id: 'DRV-TEST-99',
      name: 'Test Driver 99',
      phone: '9999999999',
      license: 'LIC9999',
      status: 'Available'
    });
    
    // Assign driver to our new bus
    const assignRes = await patchRequest(`/api/drivers/${driver._id}/assign-bus`, {
      bus_id: validBusRes.body.busId
    });
    console.log('Driver assignment to bus check (expected 200):', assignRes.status, assignRes.body.bus_number);

    // 4. Student assignment, capacity limit and active status validations
    console.log('\n--- Test 3: Capacity & Active Bus checks ---');
    const student1 = await Student.create({
      _id: 'STU-TEST-99',
      qr_student_id: 'STU-TEST-99',
      register_no: 'STU-TEST-99',
      name: 'Test Student 99',
      password: 'testpassword',
      gender: 'M',
      year: '1',
      department: 'CSE',
      section: 'A',
      bus_details: {
        bus_id: validBusRes.body.busId,
        bus_number: 'BUS-99',
        route_name: 'Test Route',
        boarding_point: 'Test Stop'
      },
      status: 'active'
    });

    // Try assigning another student when capacity is 2
    // Let's verify capacity check on student update
    const student2 = await Student.create({
      _id: 'STU-TEST-100',
      qr_student_id: 'STU-TEST-100',
      register_no: 'STU-TEST-100',
      name: 'Test Student 100',
      password: 'testpassword',
      gender: 'F',
      year: '1',
      department: 'ECE',
      section: 'B',
      bus_details: {
        bus_id: validBusRes.body.busId,
        bus_number: 'BUS-99',
        route_name: 'Test Route',
        boarding_point: 'Test Stop'
      },
      status: 'active'
    });

    // Check how many students are assigned (expected 2)
    const countStudents = await Student.countDocuments({ 'bus_details.bus_number': 'BUS-99', status: 'active' });
    console.log('Students assigned count:', countStudents, '(Capacity:', validBusRes.body.capacity, ')');

    // 5. Trip Start rejections and validations
    console.log('\n--- Test 4: Starting Trip with validations ---');
    
    // Authenticate driver to get JWT token
    const loginRes = await postRequest('/api/auth/login', {
      role: 'driver',
      username: 'DRV-TEST-99',
      password: 'driver123'
    });
    if (loginRes.body && loginRes.body.token) {
      authToken = loginRes.body.token;
      console.log('Driver successfully authenticated, token acquired.');
    } else {
      console.error('Failed to authenticate driver. Response:', loginRes.body);
    }

    // Try to start trip for an inactive bus
    await Bus.updateOne({ busId: validBusRes.body.busId }, { $set: { status: 'inactive', active: false } });
    const startTripInactiveRes = await postRequest('/api/trips/start', {
      busId: validBusRes.body.busId,
      driverId: 'DRV-TEST-99',
      direction: 'to_college'
    });
    console.log('Inactive bus starting trip rejection status (expected 400):', startTripInactiveRes.status, startTripInactiveRes.body.error);

    // Set bus back to active
    await Bus.updateOne({ busId: validBusRes.body.busId }, { $set: { status: 'active', active: true } });

    // Start trip
    const startTripRes = await postRequest('/api/trips/start', {
      busId: validBusRes.body.busId,
      driverId: 'DRV-TEST-99',
      direction: 'to_college'
    });
    console.log('Start trip response status (expected 201):', startTripRes.status, startTripRes.body.tripId);
    const activeTripId = startTripRes.body.tripId;

    // 6. Deletion safety block during active trip
    console.log('\n--- Test 5: Deletion safety checks ---');
    const deleteRes = await deleteRequest(`/api/buses/${validBusRes.body.busId}`);
    console.log('Delete active bus rejection status (expected 400):', deleteRes.status, deleteRes.body.error);

    // Driver unassignment block during active trip
    const unassignRes = await patchRequest(`/api/drivers/${driver._id}/assign-bus`, {
      bus_id: ''
    });
    console.log('Unassign driver from active bus rejection status (expected 400):', unassignRes.status, unassignRes.body.error);

    // 7. Scans, peak occupancy calculations
    console.log('\n--- Test 6: Scans & Live peak occupancy tracking ---');
    // Board student 1
    const scan1Res = await postRequest('/api/scan', {
      qr_student_id: student1.qr_student_id,
      action: 'board',
      bus_number: 'BUS-99',
      scanner_token: 'SCANNER_BUS03',
      trip_id: activeTripId
    });
    console.log('Board student 1 status (expected 200):', scan1Res.status);

    // Check occupancy endpoint
    let occupancyRes = await getRequest('/api/buses/BUS-99/occupancy');
    console.log('Occupancy after 1 Board (expected 1):', occupancyRes.body.currentOccupancy);

    // Board student 2
    const scan2Res = await postRequest('/api/scan', {
      qr_student_id: student2.qr_student_id,
      action: 'board',
      bus_number: 'BUS-99',
      scanner_token: 'SCANNER_BUS03',
      trip_id: activeTripId
    });
    console.log('Board student 2 status (expected 200):', scan2Res.status);

    occupancyRes = await getRequest('/api/buses/BUS-99/occupancy');
    console.log('Occupancy after 2 Boards (expected 2):', occupancyRes.body.currentOccupancy);

    // Age the board scans to avoid 60 second duplicate scan block
    await ScanLog.updateMany({ student_id: student1._id }, { $set: { createdAt: new Date(Date.now() - 70000) } });

    // Drop student 1
    const scan3Res = await postRequest('/api/scan', {
      qr_student_id: student1.qr_student_id,
      action: 'dropoff',
      bus_number: 'BUS-99',
      scanner_token: 'SCANNER_BUS03',
      trip_id: activeTripId
    });
    console.log('Drop student 1 status (expected 200):', scan3Res.status, scan3Res.body?.error || scan3Res.raw);

    // Age student 2 board scan
    await ScanLog.updateMany({ student_id: student2._id }, { $set: { createdAt: new Date(Date.now() - 70000) } });

    // Drop student 2 (necessary to satisfy stopTrip validation of all students dropped)
    const scan4Res = await postRequest('/api/scan', {
      qr_student_id: student2.qr_student_id,
      action: 'dropoff',
      bus_number: 'BUS-99',
      scanner_token: 'SCANNER_BUS03',
      trip_id: activeTripId
    });
    console.log('Drop student 2 status (expected 200):', scan4Res.status, scan4Res.body?.error || scan4Res.raw);

    occupancyRes = await getRequest('/api/buses/BUS-99/occupancy');
    console.log('Occupancy after 2 Drops (expected 0):', occupancyRes.body.currentOccupancy);

    // Retrieve active trip to verify peak occupancy
    const tripDoc = await Trip.findOne({ tripId: activeTripId }).lean();
    console.log('Peak occupancy tracked in active trip (expected 2):', tripDoc.summary?.peakOccupancy);

    const s1 = await Student.findById(student1._id).lean();
    const s2 = await Student.findById(student2._id).lean();
    console.log('Student 1 trackingStatus:', s1?.trackingStatus);
    console.log('Student 2 trackingStatus:', s2?.trackingStatus);

    // 8. Stop trip and verify summary metrics
    console.log('\n--- Test 7: Trip stop and final metrics validation ---');
    const stopTripRes = await postRequest(`/api/trips/${activeTripId}/stop`, {
      busId: validBusRes.body.busId
    });
    console.log('Stop trip response status (expected 200):', stopTripRes.status, stopTripRes.body?.error || stopTripRes.raw);

    const closedTripDoc = await Trip.findOne({ tripId: activeTripId }).lean();
    console.log('Final Trip Statistics stored:');
    console.log(' - Total Boarded:', closedTripDoc.summary?.totalBoarded);
    console.log(' - Total Dropped:', closedTripDoc.summary?.totalDropped);
    console.log(' - Peak Occupancy:', closedTripDoc.summary?.peakOccupancy);
    console.log(' - Average Occupancy:', closedTripDoc.summary?.averageOccupancy);

    // Occupancy returns to 0 on trip completed
    occupancyRes = await getRequest('/api/buses/BUS-99/occupancy');
    console.log('Occupancy after trip ended (expected 0):', occupancyRes.body.currentOccupancy);

    // Clean up
    console.log('\nCleaning up verification records...');
    await Bus.deleteMany({ busNumber: 'BUS-99' });
    await Student.deleteMany({ register_no: 'STU-TEST-99' });
    await Student.deleteMany({ register_no: 'STU-TEST-100' });
    await Driver.deleteMany({ driver_id: 'DRV-TEST-99' });
    await Trip.deleteMany({ busId: 'BUS99' });
    await ActiveBus.deleteMany({ busId: 'BUS99' });
    await ScanLog.deleteMany({ bus_number: 'BUS-99' });
    console.log('Cleanup complete.');

  } catch (err) {
    console.error('Verification failed with error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
