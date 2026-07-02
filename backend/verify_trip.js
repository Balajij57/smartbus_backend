import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { startTrip, updateLocation, stopTrip } from './src/services/trackingService.js';
import { Trip } from './src/models/Trip.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { setIO } from './src/config/socket.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

// Mock Socket.IO instance to record emitted payloads
const mockIO = {
  to: (room) => ({
    emit: (event, payload) => {
      console.log(`\n📡 [Socket.IO] Emitted to room "${room}" on event "${event}":`);
      console.log(JSON.stringify(payload, null, 2));
    }
  }),
  emit: (event, payload) => {
    console.log(`\n📡 [Socket.IO] Broadcasted on event "${event}":`);
    console.log(JSON.stringify(payload, null, 2));
  }
};
setIO(mockIO);

async function run() {
  console.log('Connecting to:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  // Clear existing active trips for BUS001 to ensure clean start
  await Trip.deleteMany({ busId: 'BUS001' });
  await ActiveBus.deleteMany({ busId: 'BUS001' });

  console.log('\n=== Starting Trip ===');
  const trip = await startTrip({ busId: 'BUS001', driverId: 'DRV001', direction: 'to_college' });
  console.log('Created Trip Document ID:', trip.tripId);

  const activeBusDoc = await ActiveBus.findOne({ busId: 'BUS001' }).lean();
  console.log('\n=== Created ActiveBus Document ===');
  console.log(JSON.stringify(activeBusDoc, null, 2));

  // Sequence of stops for ROUTE-A:
  // Samalkot: 17.0504, 82.1659
  // Vetlapalem: 17.0259, 82.1369
  // Peddapuram: 17.0757, 82.1433
  // Yerrampalem: 17.0864, 82.0945
  // Aditya University: 17.0912, 82.0665

  console.log('\n=== Simulating GPS coordinates (1st Ping near Samalkot) ===');
  // Radius = 250m. Let's send exactly Samalkot coordinates (17.0504, 82.1659)
  await updateLocation({
    busId: 'BUS001',
    tripId: trip.tripId,
    latitude: 17.0504,
    longitude: 82.1659,
    speed: 30,
    heading: 90
  });

  console.log('\n=== Simulating GPS coordinates (2nd Ping near Samalkot to trigger crossed status) ===');
  const locationResult = await updateLocation({
    busId: 'BUS001',
    tripId: trip.tripId,
    latitude: 17.0504,
    longitude: 82.1659,
    speed: 35,
    heading: 95
  });

  const updatedTrip = await Trip.findOne({ tripId: trip.tripId }).lean();
  console.log('\n=== Updated Trip Document (after 2 pings showing route progress change) ===');
  console.log(JSON.stringify(updatedTrip, null, 2));

  console.log('\n=== Stopping Trip ===');
  const stoppedTrip = await stopTrip({ busId: 'BUS001', tripId: trip.tripId });
  console.log('Trip Status after Stop:', stoppedTrip.status);

  const activeBusDocAfterStop = await ActiveBus.findOne({ busId: 'BUS001' }).lean();
  console.log('ActiveBus Document exists after stop:', !!activeBusDocAfterStop);

  await mongoose.disconnect();
}

run().catch(console.error);
