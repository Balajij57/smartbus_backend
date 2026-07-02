import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { Student } from './src/models/Student.js';
import { Bus } from './src/models/Bus.js';
import { Trip } from './src/models/Trip.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { LiveLocation } from './src/models/LiveLocation.js';
import { updateLocation, buildTrackingState } from './src/services/trackingService.js';

if (fs.existsSync('backend/.env')) {
  dotenv.config({ path: 'backend/.env' });
} else {
  dotenv.config({ path: '.env' });
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!');

  const busNumber = 'BUS-03';
  const busId = 'BUS003';

  console.log('\n--- Running verify_frontend_tracking_refresh ---');

  // Test 1: Fetch dashboard tracking state
  console.log('Test 1: Verifying frontend API state matching...');
  const res = await fetch(`http://localhost:5000/api/tracking/state/${busNumber}`);
  const state = await res.json();
  if (!state || state.busNumber !== busNumber) {
    console.error('Test 1 failed: Backend state returned invalid busNumber.', state);
    process.exit(1);
  }
  console.log('Test 1 Passed: State matching is correct.');

  // Test 2: Add student and check count immediately on endpoint
  console.log('Test 2: Verifying live student count increments without refresh...');
  const student = await Student.create({
    _id: 'STU_FRONTEND_REFRESH_TEST',
    qr_student_id: 'STU_FRONTEND_REFRESH_TEST',
    register_no: '22B91A0597',
    name: 'Frontend Test Student',
    bus_details: { bus_id: busId, bus_number: busNumber, boarding_point: 'Ramesampeta' },
    busNumber,
    boardingPoint: 'Ramesampeta',
    status: 'active'
  });

  const res2 = await fetch(`http://localhost:5000/api/tracking/state/${busNumber}`);
  const state2 = await res2.json();
  const countAfterAdd = state2.studentCounts['Ramesampeta'] || 0;
  console.log('Student count after adding:', countAfterAdd);
  if (countAfterAdd < 1) {
    console.error('Test 2 failed: Student count did not update live on the dashboard endpoint.', state2);
    process.exit(1);
  }
  console.log('Test 2 Passed: Student count updated correctly.');

  // Test 3: Delete student and check count immediately
  console.log('Test 3: Verifying live student count decrements without refresh on deletion...');
  await Student.deleteOne({ _id: 'STU_FRONTEND_REFRESH_TEST' });

  const res3 = await fetch(`http://localhost:5000/api/tracking/state/${busNumber}`);
  const state3 = await res3.json();
  const countAfterDelete = state3.studentCounts['Ramesampeta'] || 0;
  console.log('Student count after deleting:', countAfterDelete);
  if (countAfterDelete !== countAfterAdd - 1) {
    console.error('Test 3 failed: Student count did not decrease live.', state3);
    process.exit(1);
  }
  console.log('Test 3 Passed: Student count decreased successfully.');

  // Test 4: Socket simulation check
  console.log('Test 4: Simulating socket reconnection payload state fetch...');
  const debugRes = await fetch(`http://localhost:5000/api/debug/frontend-state/${busNumber}`);
  const debugState = await debugRes.json();
  if (!debugState || !debugState.currentStop) {
    console.error('Test 4 failed: Reconnection debug state returned empty details.', debugState);
    process.exit(1);
  }
  console.log('Test 4 Passed: Reconnection state is correct.');

  // Test 5: State equivalence
  console.log('Test 5: Verifying state equals backend truth...');
  if (debugState.currentStop !== state3.currentStop) {
    console.error('Test 5 failed: Mismatched stop name across debug endpoints.', debugState, state3);
    process.exit(1);
  }
  console.log('Test 5 Passed: Dashboard state matches backend truth.');

  console.log('\nAll tests in verify_frontend_tracking_refresh passed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
