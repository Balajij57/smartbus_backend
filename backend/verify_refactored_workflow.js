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
import { SmsLog } from './src/models/SmsLog.js';
import { startTrip, updateLocation, stopTrip } from './src/services/trackingService.js';
import { setIO } from './src/config/socket.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';
const API_SCAN = 'http://localhost:5000/api/scan';
const SCANNER_TOKEN = 'SCANNER_BUS03';

// Mock Socket.IO
setIO({
  to: () => ({ emit: () => {} }),
  emit: () => {}
});

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
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  // Helper to re-seed bus, stops and routes
  const prepareEnvironment = async () => {
    await Student.deleteMany({ register_no: { $regex: /^REG_/ } });
    await Student.deleteMany({ register_no: '24B11DS005' });
    await Bus.deleteMany({ busNumber: 'BUS-03' });
    await BusRoute.deleteMany({ busNumber: 'BUS-03' });
    await Route.deleteMany({ routeId: 'ROUTE-03' });
    await Trip.deleteMany({});
    await ActiveBus.deleteMany({});
    await LiveLocation.deleteMany({});
    await BusStop.deleteMany({ stopName: { $in: ['Ramesampeta', 'Aditya University'] } });
    await ScanLog.deleteMany({});
    await SmsLog.deleteMany({});

    // Seed stops
    await BusStop.create({ stopName: 'Ramesampeta', latitude: 17.0864, longitude: 82.0945, radiusMeters: 250, active: true });
    await BusStop.create({ stopName: 'Aditya University', latitude: 17.0912, longitude: 82.0665, radiusMeters: 500, active: true });

    // Seed Route
    await Route.create({
      routeId: 'ROUTE-03',
      routeName: 'Annavaram Route',
      collegeLocation: { name: 'Aditya University', latitude: 17.0912, longitude: 82.0665 },
      villages: [
        { villageId: 'Ramesampeta', villageName: 'Ramesampeta', sequence: 1, latitude: 17.0864, longitude: 82.0945 },
        { villageId: 'Aditya University', villageName: 'Aditya University', sequence: 2, latitude: 17.0912, longitude: 82.0665 }
      ]
    });

    // Seed bus
    await Bus.create({ busId: 'BUS003', busNumber: 'BUS-03', routeId: 'ROUTE-03', capacity: 40, status: 'active' });

    // Seed BusRoute
    await BusRoute.create({
      busNumber: 'BUS-03',
      stops: [
        { stopName: 'Ramesampeta', sequence: 1, latitude: 17.0864, longitude: 82.0945, studentCount: 1, allowedRadiusMeters: 250 },
        { stopName: 'Aditya University', sequence: 2, latitude: 17.0912, longitude: 82.0665, studentCount: 0, allowedRadiusMeters: 500 }
      ]
    });
  };

  const createTestStudent = async (uniqueId, uniqueReg) => {
    return await Student.create({
      _id: uniqueId,
      register_no: uniqueReg,
      name: 'Manikanta',
      gender: 'Male',
      year: '1st Year',
      department: 'CSE',
      section: 'A',
      date_of_birth: '2005-01-01',
      address: { door_no: '123', street: 'Street', city: 'City', state: 'AP', pincode: '533001' },
      bus_details: { bus_id: 'BUS003', bus_number: 'BUS-03', route_name: 'Annavaram Route', boarding_point: 'Ramesampeta' },
      qr_student_id: uniqueReg,
      parent_id: 'PAR007',
      driver_id: 'DRV003',
      parent_phone: '9133708513',
      status: 'active',
      trackingStatus: 'REACHED_HOME'
    });
  };

  try {
    await prepareEnvironment();

    // Test Case Helper
    const runCase = async ({ mode, action, direction, lat, lng, expectSuccess, expectedRejectionMsg, expectedStatus, expectedSmsPattern, expectedCode, preSetupLocation = true }) => {
      console.log(`\n--- Test Case: ${mode} [Expect ${expectSuccess ? 'SUCCESS' : 'FAILURE'}] ---`);
      await ScanLog.deleteMany({});
      await SmsLog.deleteMany({});

      const uniqueId = `STU_${Math.random().toString(36).substring(2, 7)}`;
      const uniqueReg = `REG_${Math.random().toString(36).substring(2, 7)}`;
      const testStudent = await createTestStudent(uniqueId, uniqueReg);

      const trip = await startTrip({ busId: 'BUS003', driverId: 'DRV003', direction });
      if (preSetupLocation) {
        await updateLocation({
          tripId: trip.tripId,
          busId: 'BUS003',
          latitude: lat,
          longitude: lng,
          timestamp: new Date()
        });
      }

      const res = await callScanAPI({
        qr_student_id: uniqueReg,
        action,
        bus_number: 'BUS-03',
        scanMode: mode,
        direction,
        trip_id: trip.tripId
      });

      console.log('HTTP Status:', res.status);
      console.log('Response:', res.data);

      if (expectSuccess) {
        if (res.status !== 200) throw new Error(`Expected 200 but got ${res.status}`);
        if (!res.data.success) throw new Error('Response success field must be true');
        if (!res.data.attendance || !res.data.student) throw new Error('Response missing attendance or student document');

        // Verify attendance status update
        const updatedStudent = await Student.findById(testStudent._id);
        if (updatedStudent.trackingStatus !== expectedStatus) {
          throw new Error(`Expected student status ${expectedStatus} but got ${updatedStudent.trackingStatus}`);
        }

        // Verify SMS Log
        const sms = await SmsLog.findOne({ to: '+919133708513' }).sort({ createdAt: -1 });
        if (!sms) throw new Error('Expected SmsLog record to be created, but none found.');
        
        const pattern = new RegExp(expectedSmsPattern);
        if (!pattern.test(sms.body)) {
          throw new Error(`SMS body "${sms.body}" does not match pattern "${expectedSmsPattern}"`);
        }
        console.log('✅ Success Scan verified.');
      } else {
        if (res.status !== 422) throw new Error(`Expected 422 but got ${res.status}`);
        if (res.data.success !== false) throw new Error('Response success field must be false');
        if (res.data.code !== expectedCode) throw new Error(`Expected code "${expectedCode}" but got "${res.data.code}"`);
        if (res.data.message !== expectedRejectionMsg) {
          throw new Error(`Expected rejection message "${expectedRejectionMsg}" but got "${res.data.message}"`);
        }
        
        // Verify NO ScanLog created
        const logsCount = await ScanLog.countDocuments({});
        if (logsCount > 0) throw new Error('ScanLog was created for a failed scan!');

        // Verify NO SmsLog created (excluding trip start notifications)
        const smsCount = await SmsLog.countDocuments({ body: { $not: /started/ } });
        if (smsCount > 0) throw new Error('SmsLog was created for a failed scan!');

        console.log('✅ Failed Scan verified.');
      }

      await stopTrip({ tripId: trip.tripId, busId: 'BUS003', force: true });
      return { testStudent, trip };
    };

    // Run success/failure cases for all 4 modes
    // 1. Morning Boarding
    await runCase({
      mode: 'Morning Boarding',
      action: 'board',
      direction: 'to_college',
      lat: 17.0864,
      lng: 82.0945,
      expectSuccess: true,
      expectedStatus: 'BOARDED_TO_COLLEGE',
      expectedSmsPattern: '^Your child Manikanta boarded Bus BUS-03 at \\d{1,2}:\\d{2}\\s*(?:AM|PM)?\\.$'
    });
    await runCase({
      mode: 'Morning Boarding',
      action: 'board',
      direction: 'to_college',
      lat: 17.1500,
      lng: 82.1500,
      expectSuccess: false,
      expectedCode: 'GEOFENCE_FAILED',
      expectedRejectionMsg: "Bus is outside the student's boarding location."
    });

    // 2. College Arrival
    await runCase({
      mode: 'College Arrival',
      action: 'dropoff',
      direction: 'to_college',
      lat: 17.0912,
      lng: 82.0665,
      expectSuccess: true,
      expectedStatus: 'REACHED_COLLEGE',
      expectedSmsPattern: '^Your child Manikanta safely reached Aditya University at \\d{1,2}:\\d{2}\\s*(?:AM|PM)?\\.$'
    });
    await runCase({
      mode: 'College Arrival',
      action: 'dropoff',
      direction: 'to_college',
      lat: 17.1500,
      lng: 82.1500,
      expectSuccess: false,
      expectedCode: 'GEOFENCE_FAILED',
      expectedRejectionMsg: "Bus has not reached the college yet."
    });

    // 3. College Boarding
    await runCase({
      mode: 'College Boarding',
      action: 'board',
      direction: 'from_college',
      lat: 17.0912,
      lng: 82.0665,
      expectSuccess: true,
      expectedStatus: 'BOARDED_FROM_COLLEGE',
      expectedSmsPattern: '^Your child Manikanta boarded Bus BUS-03 from Aditya University at \\d{1,2}:\\d{2}\\s*(?:AM|PM)?\\.$'
    });
    await runCase({
      mode: 'College Boarding',
      action: 'board',
      direction: 'from_college',
      lat: 17.1500,
      lng: 82.1500,
      expectSuccess: false,
      expectedCode: 'GEOFENCE_FAILED',
      expectedRejectionMsg: "Bus has not reached the college yet."
    });

    // 4. Home Drop-Off
    await runCase({
      mode: 'Home Drop-Off',
      action: 'dropoff',
      direction: 'from_college',
      lat: 17.0864,
      lng: 82.0945,
      expectSuccess: true,
      expectedStatus: 'REACHED_HOME',
      expectedSmsPattern: '^Your child Manikanta safely reached the home stop at \\d{1,2}:\\d{2}\\s*(?:AM|PM)?\\.$'
    });
    await runCase({
      mode: 'Home Drop-Off',
      action: 'dropoff',
      direction: 'from_college',
      lat: 17.1500,
      lng: 82.1500,
      expectSuccess: false,
      expectedCode: 'GEOFENCE_FAILED',
      expectedRejectionMsg: "Bus has not reached the student's drop-off location."
    });

    // 5. Invalid QR Check
    console.log('\n--- Test Case: Invalid Student QR ---');
    const resInvalidStudent = await callScanAPI({
      qr_student_id: 'NON_EXISTENT_QR',
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Morning Boarding'
    });
    console.log('HTTP Status:', resInvalidStudent.status);
    console.log('Response:', resInvalidStudent.data);
    if (resInvalidStudent.status !== 404 || resInvalidStudent.data.code !== 'STUDENT_NOT_FOUND') {
      throw new Error('Invalid QR check failed');
    }
    console.log('✅ Invalid QR verified.');

    // 6. Unknown Scan Mode Check
    console.log('\n--- Test Case: Unknown Scan Mode ---');
    const resUnknownMode = await callScanAPI({
      qr_student_id: 'REG_TEST',
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Invalid Scan Mode'
    });
    console.log('HTTP Status:', resUnknownMode.status);
    console.log('Response:', resUnknownMode.data);
    if (resUnknownMode.status !== 400 || resUnknownMode.data.code !== 'INVALID_SCAN_MODE') {
      throw new Error('Unknown scan mode check failed');
    }
    console.log('✅ Unknown Scan Mode verified.');

    // 7. Missing Student QR (missing required payload fields)
    console.log('\n--- Test Case: Missing Required Fields ---');
    const resMissingFields = await callScanAPI({
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Morning Boarding'
    });
    console.log('HTTP Status:', resMissingFields.status);
    console.log('Response:', resMissingFields.data);
    if (resMissingFields.status !== 400 || resMissingFields.data.code !== 'BAD_REQUEST') {
      throw new Error('Missing fields check failed');
    }
    console.log('✅ Missing Fields verified.');

    // 8. Missing Active Trip Check
    console.log('\n--- Test Case: Missing Active Trip ---');
    const uniqueReg = `REG_${Math.random().toString(36).substring(2, 7)}`;
    await createTestStudent(`STU_${Date.now()}`, uniqueReg);
    const resMissingTrip = await callScanAPI({
      qr_student_id: uniqueReg,
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Morning Boarding'
    });
    console.log('HTTP Status:', resMissingTrip.status);
    console.log('Response:', resMissingTrip.data);
    if (resMissingTrip.status !== 404 || resMissingTrip.data.code !== 'NO_ACTIVE_TRIP') {
      throw new Error('Missing Active Trip check failed');
    }
    console.log('✅ Missing Active Trip verified.');

    // 9. Missing GPS Location Check
    console.log('\n--- Test Case: Missing GPS Location ---');
    const trip = await startTrip({ busId: 'BUS003', driverId: 'DRV003', direction: 'to_college' });
    const uniqueRegGps = `REG_${Math.random().toString(36).substring(2, 7)}`;
    await createTestStudent(`STU_${Date.now()}`, uniqueRegGps);
    
    // Clear any existing LiveLocation, ActiveBus, and completed trips to force missing GPS error
    await LiveLocation.deleteMany({});
    await ActiveBus.deleteMany({});
    await Trip.deleteMany({ status: 'completed' });

    const resMissingGps = await callScanAPI({
      qr_student_id: uniqueRegGps,
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Morning Boarding',
      trip_id: trip.tripId
    });
    console.log('HTTP Status:', resMissingGps.status);
    console.log('Response:', resMissingGps.data);
    if (resMissingGps.status !== 503 || resMissingGps.data.code !== 'BUS_POSITION_UNAVAILABLE') {
      throw new Error('Missing GPS check failed');
    }
    await stopTrip({ tripId: trip.tripId, busId: 'BUS003', force: true });
    console.log('✅ Missing GPS verified.');

    // 10. Duplicate Scan Check (HTTP 409)
    console.log('\n--- Test Case: Duplicate Scan (HTTP 409) ---');
    const dupReg = `REG_${Math.random().toString(36).substring(2, 7)}`;
    await createTestStudent(`STU_${Date.now()}`, dupReg);
    const dupTrip = await startTrip({ busId: 'BUS003', driverId: 'DRV003', direction: 'to_college' });
    await updateLocation({
      tripId: dupTrip.tripId,
      busId: 'BUS003',
      latitude: 17.0864,
      longitude: 82.0945,
      timestamp: new Date()
    });

    // First scan (Success)
    const resFirst = await callScanAPI({
      qr_student_id: dupReg,
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Morning Boarding',
      trip_id: dupTrip.tripId
    });
    console.log('First scan HTTP Status:', resFirst.status);

    // Second scan (Duplicate)
    const resSecond = await callScanAPI({
      qr_student_id: dupReg,
      action: 'board',
      bus_number: 'BUS-03',
      scanMode: 'Morning Boarding',
      trip_id: dupTrip.tripId
    });
    console.log('Duplicate scan HTTP Status:', resSecond.status);
    console.log('Duplicate scan Response:', resSecond.data);

    if (resSecond.status !== 409 || resSecond.data.code !== 'DUPLICATE_SCAN') {
      throw new Error('Duplicate scan check failed');
    }
    await stopTrip({ tripId: dupTrip.tripId, busId: 'BUS003', force: true });
    console.log('✅ Duplicate Scan check verified.');

    console.log('\n🎉 ALL ENTERPRISE REFRACTOR TESTS AND GEOFENCE VALIDATIONS PASSED 100%!');
  } finally {
    console.log('🧹 Cleaning up test student data from database...');
    const result = await Student.deleteMany({ register_no: { $regex: /^REG_/ } });
    console.log(`🗑️ Removed ${result.deletedCount} test student records.`);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Refactor verification failed:', err);
  process.exit(1);
});
