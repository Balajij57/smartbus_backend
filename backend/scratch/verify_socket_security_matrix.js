import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Student } from '../src/models/Student.js';
import { registerSocketHandlers, setIO } from '../src/config/socket.js';
import { signToken } from '../src/middleware/auth.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import crypto from 'crypto';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

// Helper to sign expired HS256 JWT
function signExpiredToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() - 10000 })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'smartbus-super-secret-key-2026')
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const busIdA = 'SEC-BUS-A';
  const busIdB = 'SEC-BUS-B';
  const busIdC = 'SEC-BUS-C';

  // Cleanup
  await Bus.deleteMany({ busId: { $in: [busIdA, busIdB, busIdC] } });
  await Student.deleteMany({ _id: { $in: ['SEC-STU-A', 'SEC-STU-B', 'SEC-STU-C'] } });

  // Setup mock database data
  await Bus.create({ busId: busIdA, busNumber: 'SEC-A-01', capacity: 40, status: 'active', driverId: 'DRIVER-A' });
  await Bus.create({ busId: busIdB, busNumber: 'SEC-B-02', capacity: 40, status: 'active', driverId: 'DRIVER-B' });
  await Bus.create({ busId: busIdC, busNumber: 'SEC-C-03', capacity: 40, status: 'active', driverId: 'DRIVER-C' });

  // Parent A has student A on Bus A, and student C on Bus C
  await Student.create({
    _id: 'SEC-STU-A',
    register_no: 'SEC-STU-A',
    name: 'Student A',
    parent_id: 'PARENT-A',
    bus_details: { bus_id: busIdA, bus_number: 'SEC-A-01', boarding_point: 'Stop A' },
    status: 'active'
  });

  await Student.create({
    _id: 'SEC-STU-C',
    register_no: 'SEC-STU-C',
    name: 'Student C',
    parent_id: 'PARENT-A',
    bus_details: { bus_id: busIdC, bus_number: 'SEC-C-03', boarding_point: 'Stop C' },
    status: 'active'
  });

  // Student B on Bus B, parent is Parent B
  await Student.create({
    _id: 'SEC-STU-B',
    register_no: 'SEC-STU-B',
    name: 'Student B',
    parent_id: 'PARENT-B',
    bus_details: { bus_id: busIdB, bus_number: 'SEC-B-02', boarding_point: 'Stop B' },
    status: 'active'
  });

  // Sign JWT tokens
  const tokenParentA = signToken({ id: 'PARENT-A', role: 'parent', username: 'parent_a' });
  const tokenDriverA = signToken({ id: 'DRIVER-A', role: 'driver', username: 'DRIVER-A' });
  const tokenStudentB = signToken({ id: 'SEC-STU-B', role: 'student', username: 'student_b' });
  const tokenAdmin = signToken({ id: 'ADMIN-1', role: 'admin', username: 'admin' });
  const tokenExpired = signExpiredToken({ id: 'PARENT-A', role: 'parent', username: 'parent_a' });
  const tokenInvalid = 'invalid.jwt.token';

  // Start test socket server
  const testServer = http.createServer();
  const ioServer = new SocketIOServer(testServer, { cors: { origin: '*' } });
  setIO(ioServer);
  registerSocketHandlers(ioServer);

  testServer.listen(5002, async () => {
    console.log('Test Socket.io server listening on port 5002');

    // TEST results tracker
    const results = {};

    // Helper to connect a client and return a promise
    const connectClient = (token) => {
      return io('http://localhost:5002', {
        transports: ['websocket'],
        auth: { token }
      });
    };

    // --- TEST 1: Unauthenticated Connection Handshake ---
    console.log('\n[TEST 1] Testing unauthenticated socket connection...');
    const client1 = connectClient('');
    results.test1 = await new Promise((resolve) => {
      client1.on('connect_error', (err) => {
        console.log('✅ TEST 1 passed (connection rejected):', err.message);
        resolve(true);
      });
      client1.on('connect', () => {
        console.log('❌ TEST 1 failed (connection succeeded)');
        resolve(false);
      });
      setTimeout(() => resolve(false), 2000);
    });
    client1.close();

    // --- TEST 2: Invalid Token Handshake ---
    console.log('\n[TEST 2] Testing connection with invalid token...');
    const client2 = connectClient(tokenInvalid);
    results.test2 = await new Promise((resolve) => {
      client2.on('connect_error', (err) => {
        console.log('✅ TEST 2 passed (connection rejected):', err.message);
        resolve(true);
      });
      client2.on('connect', () => {
        console.log('❌ TEST 2 failed (connection succeeded)');
        resolve(false);
      });
      setTimeout(() => resolve(false), 2000);
    });
    client2.close();

    // --- TEST 3: Expired Token Handshake ---
    console.log('\n[TEST 3] Testing connection with expired token...');
    const client3 = connectClient(tokenExpired);
    results.test3 = await new Promise((resolve) => {
      client3.on('connect_error', (err) => {
        console.log('✅ TEST 3 passed (connection rejected):', err.message);
        resolve(true);
      });
      client3.on('connect', () => {
        console.log('❌ TEST 3 failed (connection succeeded)');
        resolve(false);
      });
      setTimeout(() => resolve(false), 2000);
    });
    client3.close();

    // Setup helper to verify room subscriptions
    const verifyRoomJoin = async (client, busId, expectedSuccess) => {
      return new Promise((resolve) => {
        client.emit('tracking:join-bus', busId);
        client.on('tracking:join-success', (payload) => {
          if (payload.busId === busId) {
            console.log(`- Join room bus:${busId} succeeded`);
            resolve(expectedSuccess === true);
          }
        });
        client.on('tracking:join-error', (payload) => {
          if (payload.busId === busId) {
            console.log(`- Join room bus:${busId} failed as expected: ${payload.error}`);
            resolve(expectedSuccess === false);
          }
        });
        setTimeout(() => {
          console.log(`- Join room bus:${busId} timed out`);
          resolve(false);
        }, 1500);
      });
    };

    // --- TEST 4: Parent A Connection and Subscriptions ---
    console.log('\n[TEST 4] Parent A Room subscription validation...');
    const clientParentA = connectClient(tokenParentA);
    const parentAConn = await new Promise(r => clientParentA.on('connect', () => r(true)));
    if (parentAConn) {
      console.log('Parent A connected. Testing authorized Bus A join (child on Bus A)...');
      const joinA = await verifyRoomJoin(clientParentA, busIdA, true);

      console.log('Testing authorized Bus C join (child on Bus C - multi-child check)...');
      const joinC = await verifyRoomJoin(clientParentA, busIdC, true);

      console.log('Testing unauthorized Bus B join (no child on Bus B)...');
      const joinB = await verifyRoomJoin(clientParentA, busIdB, false);

      results.test4 = joinA && joinC && joinB;
    } else {
      results.test4 = false;
    }
    clientParentA.close();

    // --- TEST 5: Driver A Connection and Subscriptions ---
    console.log('\n[TEST 5] Driver A Room subscription validation...');
    const clientDriverA = connectClient(tokenDriverA);
    const driverAConn = await new Promise(r => clientDriverA.on('connect', () => r(true)));
    if (driverAConn) {
      console.log('Driver A connected. Testing authorized Bus A join (assigned driver)...');
      const joinA = await verifyRoomJoin(clientDriverA, busIdA, true);

      console.log('Testing unauthorized Bus B join (not assigned)...');
      const joinB = await verifyRoomJoin(clientDriverA, busIdB, false);

      results.test5 = joinA && joinB;
    } else {
      results.test5 = false;
    }
    clientDriverA.close();

    // --- TEST 6: Student B Connection and Subscriptions ---
    console.log('\n[TEST 6] Student B Room subscription validation...');
    const clientStudentB = connectClient(tokenStudentB);
    const studentBConn = await new Promise(r => clientStudentB.on('connect', () => r(true)));
    if (studentBConn) {
      console.log('Student B connected. Testing authorized Bus B join (assigned student)...');
      const joinB = await verifyRoomJoin(clientStudentB, busIdB, true);

      console.log('Testing unauthorized Bus A join (not assigned)...');
      const joinA = await verifyRoomJoin(clientStudentB, busIdA, false);

      results.test6 = joinB && joinA;
    } else {
      results.test6 = false;
    }
    clientStudentB.close();

    // --- TEST 7: Admin Total Access Check ---
    console.log('\n[TEST 7] Admin Room subscription validation...');
    const clientAdmin = connectClient(tokenAdmin);
    const adminConn = await new Promise(r => clientAdmin.on('connect', () => r(true)));
    if (adminConn) {
      console.log('Admin connected. Testing Bus A join...');
      const joinA = await verifyRoomJoin(clientAdmin, busIdA, true);

      console.log('Testing Bus B join...');
      const joinB = await verifyRoomJoin(clientAdmin, busIdB, true);

      results.test7 = joinA && joinB;
    } else {
      results.test7 = false;
    }
    clientAdmin.close();

    // --- TEST 8: Malformed / Missing busId ---
    console.log('\n[TEST 8] Testing malformed/missing busId subscription request...');
    const clientMalformed = connectClient(tokenParentA);
    const malformedConn = await new Promise(r => clientMalformed.on('connect', () => r(true)));
    if (malformedConn) {
      // Send malformed request
      clientMalformed.emit('tracking:join-bus', '');
      const noCrash = await new Promise((resolve) => {
        setTimeout(() => {
          console.log('✅ Server did not crash after malformed busId request');
          resolve(true);
        }, 1000);
      });
      results.test8 = noCrash;
    } else {
      results.test8 = false;
    }
    clientMalformed.close();

    console.log('\n======================================================');
    console.log('--- Socket Security Matrix Verification Summary ---');
    console.log('======================================================');
    console.log('TEST 1: Unauthenticated block (No Token)       :', results.test1 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 2: Invalid Token block                     :', results.test2 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 3: Expired Token block                     :', results.test3 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 4: Parent Role Matrix (Auth/Multi/Unauth)  :', results.test4 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 5: Driver Role Matrix (Auth/Unauth)        :', results.test5 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 6: Student Role Matrix (Auth/Unauth)       :', results.test6 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 7: Admin Total Access (Scoped Deploy)      :', results.test7 ? '✅ PASS' : '❌ FAIL');
    console.log('TEST 8: Malformed Input Safety (No Crash)        :', results.test8 ? '✅ PASS' : '❌ FAIL');
    console.log('======================================================\n');

    // Cleanup
    testServer.close();
    await Bus.deleteMany({ busId: { $in: [busIdA, busIdB, busIdC] } });
    await Student.deleteMany({ _id: { $in: ['SEC-STU-A', 'SEC-STU-B', 'SEC-STU-C'] } });
    await mongoose.disconnect();
    process.exit(0);
  });
}

run().catch(console.error);
