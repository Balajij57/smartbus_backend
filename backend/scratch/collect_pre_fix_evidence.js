import { connectDB } from '../src/config/db.js';
import { Student } from '../src/models/Student.js';
import { Bus } from '../src/models/Bus.js';
import { Driver } from '../src/models/Driver.js';
import { Trip } from '../src/models/Trip.js';
import { ActiveBus } from '../src/models/ActiveBus.js';
import { BusRoute } from '../src/models/BusRoute.js';
import { LiveLocation } from '../src/models/LiveLocation.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = 'C:\\Users\\katab\\.gemini\\antigravity\\brain\\e8b713cf-5bcc-41de-b8e0-9ed4df0c1a4e';

async function run() {
  await connectDB();
  console.log('Connected to Database.');

  // 1. One student assigned to BUS-3. Boarding point = Ramesampeta.
  let student = await Student.findOne({ qr_student_id: 'STU_RAMESAMPETA' });
  if (!student) {
    student = await Student.create({
      _id: 'STU_RAMESAMPETA',
      qr_student_id: 'STU_RAMESAMPETA',
      register_no: '22B91A0599',
      name: 'Ramesampeta Student',
      bus_details: {
        bus_id: 'BUS003',
        bus_number: 'BUS-03',
        route_name: 'North Zone',
        boarding_point: 'Ramesampeta'
      },
      busNumber: 'BUS-03',
      boardingPoint: 'Ramesampeta',
      status: 'active'
    });
    console.log('Created student at Ramesampeta.');
  } else {
    student.busNumber = 'BUS-03';
    student.boardingPoint = 'Ramesampeta';
    student.bus_details = {
      bus_id: 'BUS003',
      bus_number: 'BUS-03',
      route_name: 'North Zone',
      boarding_point: 'Ramesampeta'
    };
    student.status = 'active';
    await student.save();
    console.log('Ensured student is at Ramesampeta.');
  }

  // Ensure Ramesampeta stop exists in BusRoute
  let busRoute = await BusRoute.findOne({ busNumber: 'BUS-03' });
  if (busRoute) {
    const hasRamesampeta = busRoute.stops.some(s => s.stopName.toLowerCase().includes('ramesampeta'));
    if (!hasRamesampeta) {
      busRoute.stops.push({
        stopName: 'Ramesampeta',
        latitude: 17.2066,
        longitude: 82.0135,
        sequence: 1,
        studentCount: 1,
        allowedRadiusMeters: 250
      });
      await busRoute.save();
    } else {
      busRoute.stops.forEach(s => {
        if (s.stopName.toLowerCase().includes('ramesampeta')) {
          s.studentCount = 1;
        }
      });
      busRoute.markModified('stops');
      await busRoute.save();
    }
  }

  // 3. Driver starts trip / Ensure ActiveBus and Active Trip exist
  let trip = await Trip.findOne({ busId: 'BUS003', status: 'active' });
  if (!trip) {
    trip = await Trip.create({
      tripId: 'TRIP-BUS-3-REAL-ROUTE',
      busId: 'BUS003',
      driverId: 'DRV001',
      routeId: 'Route-North',
      direction: 'to_college',
      tripType: 'Trip 1 - Home → College',
      startTime: new Date(),
      status: 'active',
      routeProgress: [
        {
          villageId: 'Ramesampeta',
          villageName: 'Ramesampeta',
          sequence: 1,
          latitude: 17.2066,
          longitude: 82.0135,
          crossed: false,
          crossedAt: null,
          status: 'current',
          studentCount: 1,
          allowedRadiusMeters: 250
        },
        {
          villageId: 'Aditya University',
          villageName: 'Aditya University',
          sequence: 2,
          latitude: 17.0912,
          longitude: 82.0665,
          crossed: false,
          crossedAt: null,
          status: 'pending',
          studentCount: 0,
          allowedRadiusMeters: 500
        }
      ],
      routeSnapshot: [
        {
          villageId: 'Ramesampeta',
          villageName: 'Ramesampeta',
          sequence: 1,
          latitude: 17.2066,
          longitude: 82.0135,
          studentCount: 1
        },
        {
          villageId: 'Aditya University',
          villageName: 'Aditya University',
          sequence: 2,
          latitude: 17.0912,
          longitude: 82.0665,
          studentCount: 0
        }
      ],
      routeSnapshotHash: 'hash-value',
      currentLocation: { latitude: 17.2066, longitude: 82.0135, speed: 0, heading: 0, timestamp: new Date() },
      remainingDistanceKm: 15,
      totalDistanceKm: 15,
      lastUpdatedAt: new Date()
    });
    console.log('Created active trip.');
  }

  // Let's ensure ActiveBus exists and has coordinate at Ramesampeta
  let activeBus = await ActiveBus.findOne({ busId: 'BUS003' });
  if (!activeBus) {
    activeBus = await ActiveBus.create({
      busId: 'BUS003',
      busNumber: 'BUS-03',
      location: {
        type: 'Point',
        coordinates: [82.0135, 17.2066]
      },
      speed: 0,
      heading: 0,
      currentTripId: trip.tripId,
      lastUpdatedAt: new Date(),
      routeProgress: trip.routeProgress,
      currentStopIndex: 0,
      nextStopIndex: 1
    });
    console.log('Created ActiveBus at Ramesampeta.');
  } else {
    activeBus.location = {
      type: 'Point',
      coordinates: [82.0135, 17.2066]
    };
    activeBus.currentTripId = trip.tripId;
    activeBus.routeProgress = trip.routeProgress;
    activeBus.currentStopIndex = 0;
    activeBus.nextStopIndex = 1;
    await activeBus.save();
    console.log('Updated ActiveBus location to Ramesampeta.');
  }

  // Create latest LiveLocation
  await LiveLocation.create({
    busId: 'BUS003',
    tripId: trip.tripId,
    latitude: 17.2066,
    longitude: 82.0135,
    speed: 0,
    heading: 0,
    timestamp: new Date()
  });

  // Query HTTP endpoints and write response
  const fetchEndpoint = async (urlPath) => {
    const res = await fetch(`http://localhost:5000${urlPath}`);
    return await res.json();
  };

  try {
    const trackingRes = await fetchEndpoint('/api/debug/tracking/BUS-03');
    fs.writeFileSync(path.join(artifactDir, 'debug_tracking_before_fix.json'), JSON.stringify(trackingRes, null, 2));
    console.log('Saved debug_tracking_before_fix.json.');

    const databaseRes = await fetchEndpoint('/api/debug/database-truth/BUS-03');
    fs.writeFileSync(path.join(artifactDir, 'debug_database_truth_before_fix.json'), JSON.stringify(databaseRes, null, 2));
    console.log('Saved debug_database_truth_before_fix.json.');
  } catch (err) {
    console.error('Failed to query local server: ', err.message);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
