import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import { emitBusUpdate, setIO } from '../src/config/socket.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

// We will start a small test socket server to isolate the test from the live dev server, 
// avoiding socket collision or port binding issues, and allowing full event capture.
const testServer = http.createServer();
const ioServer = new SocketIOServer(testServer, {
  cors: { origin: '*' }
});

setIO(ioServer);

ioServer.on('connection', (socket) => {
  socket.on('tracking:join-bus', (busId) => {
    socket.join(`bus:${busId}`);
  });
  socket.on('tracking:leave-bus', (busId) => {
    socket.leave(`bus:${busId}`);
  });
});

testServer.listen(5001, async () => {
  console.log('Test Socket.io server listening on port 5001');

  const clientA = io('http://localhost:5001', { transports: ['websocket'] });
  const clientB = io('http://localhost:5001', { transports: ['websocket'] });

  const clientAReceived = [];
  const clientBReceived = [];

  clientA.on('bus:location', (data) => {
    clientAReceived.push(data);
  });
  clientA.on('bus-update', (data) => {
    clientAReceived.push(data);
  });

  clientB.on('bus:location', (data) => {
    clientBReceived.push(data);
  });
  clientB.on('bus-update', (data) => {
    clientBReceived.push(data);
  });

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

  console.log('Both clients connected to socket server');

  // Client A joins bus:BUS-A, Client B joins bus:BUS-B
  clientA.emit('tracking:join-bus', 'BUS-A');
  clientB.emit('tracking:join-bus', 'BUS-B');

  // Small delay for room joining to take effect
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('Sending 20 telemetry updates for BUS-A and 20 for BUS-B concurrently...');

  for (let i = 1; i <= 20; i++) {
    // Send BUS-A update
    emitBusUpdate({
      busId: 'BUS-A',
      busNumber: 'A-01',
      latitude: 17.0 + i * 0.001,
      longitude: 82.0 + i * 0.001,
      speed: 30,
      timestamp: new Date()
    });

    // Send BUS-B update
    emitBusUpdate({
      busId: 'BUS-B',
      busNumber: 'B-02',
      latitude: 17.5 - i * 0.001,
      longitude: 82.5 - i * 0.001,
      speed: 40,
      timestamp: new Date()
    });
  }

  // Wait for events to propagate
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('\n======================================');
  console.log('--- Telemetry Delivery Verification ---');
  console.log('======================================');
  console.log(`Client A received ${clientAReceived.length} events total (expected 40: 20 location + 20 bus-update for BUS-A).`);
  console.log(`Client B received ${clientBReceived.length} events total (expected 40: 20 location + 20 bus-update for BUS-B).`);

  const anyLeakToA = clientAReceived.some(p => p.busId !== 'BUS-A');
  const anyLeakToB = clientBReceived.some(p => p.busId !== 'BUS-B');

  console.log('Any leak of BUS-B payloads to Client A:', anyLeakToA ? '❌ YES' : '✅ NO');
  console.log('Any leak of BUS-A payloads to Client B:', anyLeakToB ? '❌ YES' : '✅ NO');

  console.log('\n--- Sample Payload received by Client A (first event) ---');
  console.log(JSON.stringify(clientAReceived[0], null, 2));

  console.log('\n--- Sample Payload received by Client B (first event) ---');
  console.log(JSON.stringify(clientBReceived[0], null, 2));

  // Disconnect clients and stop server
  clientA.close();
  clientB.close();
  testServer.close();
  process.exit(0);
});
