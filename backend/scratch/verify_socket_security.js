import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Student } from '../src/models/Student.js';
import { registerSocketHandlers, setIO } from '../src/config/socket.js';
import { signToken } from '../src/middleware/auth.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const busIdA = 'SEC-BUS-A';
  const busIdB = 'SEC-BUS-B';

  // Cleanup
  await Bus.deleteMany({ busId: { $in: [busIdA, busIdB] } });
  await Student.deleteMany({ _id: { $in: ['SEC-STU-A', 'SEC-STU-B'] } });

  // Setup mock database data
  await Bus.create({ busId: busIdA, busNumber: 'SEC-A-01', capacity: 40, status: 'active' });
  await Bus.create({ busId: busIdB, busNumber: 'SEC-B-02', capacity: 40, status: 'active' });

  // Parent A has student on Bus A
  await Student.create({
    _id: 'SEC-STU-A',
    register_no: 'SEC-STU-A',
    name: 'Student A',
    parent_id: 'PARENT-A',
    bus_details: { bus_id: busIdA, bus_number: 'SEC-A-01', boarding_point: 'Stop A' },
    status: 'active'
  });

  // Parent B has student on Bus B
  await Student.create({
    _id: 'SEC-STU-B',
    register_no: 'SEC-STU-B',
    name: 'Student B',
    parent_id: 'PARENT-B',
    bus_details: { bus_id: busIdB, bus_number: 'SEC-B-02', boarding_point: 'Stop B' },
    status: 'active'
  });

  // Sign mock JWT tokens
  const tokenParentA = signToken({ id: 'PARENT-A', role: 'parent', username: 'parent_a' });
  const tokenInvalid = 'invalid.jwt.token';

  // Start test socket server
  const testServer = http.createServer();
  const ioServer = new SocketIOServer(testServer, { cors: { origin: '*' } });
  setIO(ioServer);
  registerSocketHandlers(ioServer);

  testServer.listen(5002, async () => {
    console.log('Test Socket.io server listening on port 5002');

    // --- TEST 1: Unauthenticated connection rejection ---
    console.log('\n[TEST 1] Attempting unauthenticated socket connection...');
    const clientUnauth = io('http://localhost:5002', {
      transports: ['websocket'],
      auth: { token: '' }
    });

    const unauthPassed = await new Promise((resolve) => {
      clientUnauth.on('connect_error', (err) => {
        console.log('✅ Connection rejected as expected:', err.message);
        resolve(true);
      });
      clientUnauth.on('connect', () => {
        console.log('❌ Connection succeeded unexpectedly!');
        resolve(false);
      });
      setTimeout(() => resolve(false), 3000);
    });
    clientUnauth.close();

    // --- TEST 2: Invalid token connection rejection ---
    console.log('\n[TEST 2] Attempting connection with invalid token...');
    const clientInvalid = io('http://localhost:5002', {
      transports: ['websocket'],
      auth: { token: tokenInvalid }
    });

    const invalidPassed = await new Promise((resolve) => {
      clientInvalid.on('connect_error', (err) => {
        console.log('✅ Connection rejected as expected:', err.message);
        resolve(true);
      });
      clientInvalid.on('connect', () => {
        console.log('❌ Connection succeeded unexpectedly!');
        resolve(false);
      });
      setTimeout(() => resolve(false), 3000);
    });
    clientInvalid.close();

    // --- TEST 3: Valid token connection success & room-join auth ---
    console.log('\n[TEST 3] Connecting with valid Parent A token...');
    const clientParentA = io('http://localhost:5002', {
      transports: ['websocket'],
      auth: { token: tokenParentA }
    });

    const connSuccess = await new Promise((resolve) => {
      clientParentA.on('connect', () => {
        console.log('✅ Parent A connected successfully');
        resolve(true);
      });
      clientParentA.on('connect_error', (err) => {
        console.log('❌ Parent A connection failed:', err.message);
        resolve(false);
      });
      setTimeout(() => resolve(false), 3000);
    });

    if (connSuccess) {
      // Parent A tries to join authorized Bus A
      console.log('\n[TEST 4] Parent A subscribing to authorized Bus A...');
      clientParentA.emit('tracking:join-bus', busIdA);

      const joinSuccessPassed = await new Promise((resolve) => {
        clientParentA.on('tracking:join-success', (payload) => {
          if (payload.busId === busIdA) {
            console.log('✅ Room join for Bus A accepted successfully');
            resolve(true);
          }
        });
        clientParentA.on('tracking:join-error', (payload) => {
          console.log('❌ Room join for Bus A rejected:', payload.error);
          resolve(false);
        });
        setTimeout(() => resolve(false), 3000);
      });

      // Parent A tries to join unauthorized Bus B
      console.log('\n[TEST 5] Parent A subscribing to unauthorized Bus B...');
      clientParentA.emit('tracking:join-bus', busIdB);

      const joinErrorPassed = await new Promise((resolve) => {
        clientParentA.on('tracking:join-error', (payload) => {
          if (payload.busId === busIdB && payload.error === 'Unauthorized room access') {
            console.log('✅ Room join for Bus B rejected with "Unauthorized room access" as expected');
            resolve(true);
          }
        });
        clientParentA.on('tracking:join-success', (payload) => {
          if (payload.busId === busIdB) {
            console.log('❌ Room join for Bus B succeeded unexpectedly!');
            resolve(false);
          }
        });
        setTimeout(() => resolve(false), 3000);
      });

      console.log('\n======================================');
      console.log('--- Socket Security Tests Verification ---');
      console.log('======================================');
      console.log('TEST 1 (Unauth block):', unauthPassed ? 'PASS' : 'FAIL');
      console.log('TEST 2 (Invalid token block):', invalidPassed ? 'PASS' : 'FAIL');
      console.log('TEST 3 (Parent A join Bus A):', joinSuccessPassed ? 'PASS' : 'FAIL');
      console.log('TEST 4 (Parent A join Bus B blocked):', joinErrorPassed ? 'PASS' : 'FAIL');
    }

    // Cleanup
    clientParentA.close();
    testServer.close();
    await Bus.deleteMany({ busId: { $in: [busIdA, busIdB] } });
    await Student.deleteMany({ _id: { $in: ['SEC-STU-A', 'SEC-STU-B'] } });
    await mongoose.disconnect();
    process.exit(0);
  });
}

run().catch(console.error);
