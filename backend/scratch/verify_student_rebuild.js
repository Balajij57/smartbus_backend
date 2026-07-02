import mongoose from 'mongoose';
import { Bus } from '../src/models/Bus.js';
import { Route } from '../src/models/Route.js';
import { Student } from '../src/models/Student.js';
import { BusRoute } from '../src/models/BusRoute.js';
import { rebuildBusRoute } from '../src/services/routeService.js';
import { normalizeStopName, getDisplayStopName } from '../src/utils/coordResolver.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbus';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const busNumber = 'REBUILD-01';
  const routeId = 'REBUILD-ROUTE-01';

  // Comprehensive Cleanup
  await Bus.deleteMany({ busNumber });
  await Route.deleteMany({ routeId });
  await Student.deleteMany({ $or: [{ 'bus_details.bus_number': busNumber }, { busNumber }] });
  await BusRoute.deleteMany({ busNumber });

  // Setup mock data
  await Route.create({
    routeId,
    routeName: 'Rebuild Route',
    collegeLocation: { latitude: 17.0912, longitude: 82.0665 },
    stops: []
  });

  await Bus.create({
    busId: 'REBUILD-BUS-ID',
    busNumber,
    routeId,
    capacity: 40,
    status: 'inactive'
  });

  // Create 3 active students with valid boarding points
  const activeStudentsData = [
    { _id: 'S-ACT-01', name: 'Active Student A', boardingPoint: 'Stop A', lat: 17.01, lng: 82.01, status: 'active' },
    { _id: 'S-ACT-02', name: 'Active Student B', boardingPoint: 'Stop B', lat: 17.02, lng: 82.02, status: 'active' },
    { _id: 'S-ACT-03', name: 'Active Student C', boardingPoint: 'Stop A', lat: 17.01, lng: 82.01, status: 'active' }
  ];

  // Create 1 active student with MISSING boarding point
  const studentWithMissingStop = [
    { _id: 'S-DEL-04', name: 'Student with Missing Stop D', boardingPoint: '', lat: 17.03, lng: 82.03, status: 'active' }
  ];

  for (const item of [...activeStudentsData, ...studentWithMissingStop]) {
    await Student.create({
      _id: item._id,
      register_no: item._id,
      name: item.name,
      bus_details: {
        bus_id: 'REBUILD-BUS-ID',
        bus_number: busNumber,
        boarding_point: item.boardingPoint
      },
      latitude: item.lat,
      longitude: item.lng,
      status: item.status,
      isDeleted: false
    });
  }

  // --- POST-FIX EXECUTION ---
  console.log('\n======================================================');
  console.log('--- POST-FIX (CURRENT CODE) ROUTE REBUILD ---');
  console.log('======================================================');
  const postFixStops = await rebuildBusRoute(busNumber);
  console.log('Generated Stops:', JSON.stringify(postFixStops, null, 2));

  // --- PRE-FIX SIMULATION ---
  console.log('\n======================================================');
  console.log('--- PRE-FIX (SIMULATED OLD CODE) ROUTE REBUILD ---');
  console.log('======================================================');
  
  // Re-read raw students (reproducing line 25 of pre-fix routeService)
  const students = await Student.find({
    $or: [
      { 'bus_details.bus_number': busNumber },
      { 'busNumber': busNumber }
    ],
    status: 'active'
  }).lean();

  // Pre-fix code ran loop over raw "students" instead of "activeStudents"
  const stopMap = new Map();
  for (const s of students) {
    const rawBp = s.boardingPoint || s.bus_details?.boarding_point || 'Unknown';
    const normalizedKey = normalizeStopName(rawBp);
    const boardingPoint = getDisplayStopName(rawBp);

    if (!stopMap.has(normalizedKey)) {
      stopMap.set(normalizedKey, {
        stopName: boardingPoint,
        latitude: s.latitude || 0,
        longitude: s.longitude || 0,
        studentCount: 0,
        allowedRadiusMeters: 250,
        landmark: ''
      });
    }
    const stop = stopMap.get(normalizedKey);
    stop.studentCount += 1;
  }
  let preFixStops = Array.from(stopMap.values());
  console.log('Simulated Pre-fix Stops (including student with missing stop):', JSON.stringify(preFixStops, null, 2));

  // Comprehensive Cleanup
  await Bus.deleteMany({ busNumber });
  await Route.deleteMany({ routeId });
  await Student.deleteMany({ $or: [{ 'bus_details.bus_number': busNumber }, { busNumber }] });
  await BusRoute.deleteMany({ busNumber });

  await mongoose.disconnect();
}

run().catch(console.error);
