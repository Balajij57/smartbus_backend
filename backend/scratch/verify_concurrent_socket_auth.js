import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Student } from '../src/models/Student.js';
import { emitBusUpdate, registerSocketHandlers, setIO } from '../src/config/socket.js';
import { signToken } from '../src/middleware/auth.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const busIdA = 'BUS-A';
  const busIdB = 'BUS-B';

  // Cleanup
  await Bus.deleteMany({ busId: { $in: [busIdA, busIdB] } });
  await Student.deleteMany({ _id: { $in: ['CONC-STU-A', 'CONC-STU-B'] } });

  // Setup mock database data
  await Bus.create({ busId: busIdA, busNumber: 'SEC-A-01', capacity: 40, status: 'active' });
  await Bus.create({ busId: busIdB, busNumber: 'SEC-B-02', capacity: 40, status: 'active' });

  // Parent A has student on Bus A
  await Student.create({
    _id: 'CONC-STU-A',
    register_no: 'CONC-STU-A',
    name: 'Student A',
    parent_id: 'PARENT-A',
    bus_details: { bus_id: busIdA, bus_number: 'SEC-A-01', boarding_point: 'Stop A' },
    status: 'active'
  });

  // Parent B has student on Bus B
  await Student.create({
    _id: 'CONC-STU-B',
    register_no: 'CONC-STU-B',
    name: 'Student B',
    parent_id: 'PARENT-B',
    bus_details: { bus_id: busIdB, bus_number: 'SEC-B-02', boarding_point: 'Stop B' },
    status: 'active'
  });

  // Sign Parent tokens
  const tokenParentA = signToken({ id: 'PARENT-A', role: 'parent', username: 'parent_a' });
  const tokenParentB = signToken({ id: 'PARENT-B', role: 'parent', username: 'parent_b' });

  // Start test socket server
  const testServer = http.createServer();
  const ioServer = new SocketIOServer(testServer, { cors: { origin: '*' } });
  setIO(ioServer);
  registerSocketHandlers(ioServer);

  testServer.listen(5001, async () => {
    console.log('Test Socket.io server listening on port 5001');

    const clientA = io('http://localhost:5001', {
      transports: ['websocket'],
      auth: { token: tokenParentA }
    });

    const clientB = io('http://localhost:5001', {
      transports: ['websocket'],
      auth: { token: tokenParentB }
    });

    const clientAReceived = [];
    const clientBReceived = [];

    clientA.on('bus:location', (data) => clientAReceived.push(data));
    clientA.on('bus-update', (data) => clientAReceived.push(data));

    clientB.on('bus:location', (data) => clientBReceived.push(data));
    clientB.on('bus-update', (data) => clientBReceived.push(data));

    // Wait for connections
    await new Promise((resolve) => {
      let connectedCount = 0;
      const check = () => {
        connectedCount++;
        if (connectedCount === 2) resolve();
      };
      clientA.on('connect', check);
      clientB.on('connect', check);
    });

    console.log('Both Clients authenticated and connected successfully');

    // Subscribe Client A to Bus A, Client B to Bus B
    clientA.emit('tracking:join-bus', busIdA);
    clientB.emit('tracking:join-bus', busIdB);

    // Wait for room joining validation to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log('Sending 20 telemetry updates for BUS-A and 20 for BUS-B concurrently...');
    for (let i = 1; i <= 20; i++) {
      emitBusUpdate({
        busId: busIdA,
        busNumber: 'SEC-A-01',
        latitude: 17.0 + i * 0.001,
        longitude: 82.0 + i * 0.001,
        speed: 30,
        timestamp: new Date()
      });

      emitBusUpdate({
        busId: busIdB,
        busNumber: 'SEC-B-02',
        latitude: 17.5 - i * 0.001,
        longitude: 82.5 - i * 0.001,
        speed: 40,
        timestamp: new Date()
      });
    }

    // Wait for event propagation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('\n======================================');
    console.log('--- Telemetry Delivery Verification ---');
    console.log('======================================');
    console.log(`Client A received ${clientAReceived.length} events total (expected 40: 20 location + 20 bus-update for BUS-A).`);
    console.log(`Client B received ${clientBReceived.length} events total (expected 40: 20 location + 20 bus-update for BUS-B).`);

    const anyLeakToA = clientAReceived.some(p => p.busId !== busIdA);
    const anyLeakToB = clientBReceived.some(p => p.busId !== busIdB);

    console.log('Any leak of BUS-B payloads to Client A:', anyLeakToA ? '❌ YES' : '✅ NO');
    console.log('Any leak of BUS-A payloads to Client B:', anyLeakToB ? '❌ YES' : '✅ NO');

    console.log('\n--- Sample Payload received by Client A (first event) ---');
    console.log(JSON.stringify(clientAReceived[0], null, 2));

    console.log('\n--- Sample Payload received by Client B (first event) ---');
    console.log(JSON.stringify(clientBReceived[0], null, 2));

    // Cleanup
    clientA.close();
    clientB.close();
    testServer.close();
    await Bus.deleteMany({ busId: { $in: [busIdA, busIdB] } });
    await Student.deleteMany({ _id: { $in: ['CONC-STU-A', 'CONC-STU-B'] } });
    await mongoose.disconnect();
    process.exit(0);
  });
}

run().catch(console.error);
