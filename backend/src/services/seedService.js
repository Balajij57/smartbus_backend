import { Bus } from '../models/Bus.js';
import { Route } from '../models/Route.js';
import { BusStop } from '../models/BusStop.js';

export async function seedTrackingData() {
  // Clean up existing routes to re-seed with fresh coordinates
  await Route.deleteMany({ routeId: { $in: ['ROUTE-A', 'ROUTE-B', 'ROUTE-C', 'ROUTE-D'] } });

  // Route A: Samalkot to Aditya University
  await Route.create({
    routeId: 'ROUTE-A',
    routeName: 'Samalkot to Aditya University Route',
    collegeLocation: { name: 'Aditya University', latitude: 17.0912, longitude: 82.0665 },
    villages: [
      { villageId: 'ROUTE-A-VIL-001', villageName: 'Samalkot', latitude: 17.0504, longitude: 82.1659, sequence: 1, radiusMeters: 250, kind: 'origin' },
      { villageId: 'ROUTE-A-VIL-002', villageName: 'Vetlapalem', latitude: 17.0259, longitude: 82.1369, sequence: 2, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-A-VIL-003', villageName: 'Peddapuram', latitude: 17.0757, longitude: 82.1433, sequence: 3, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-A-VIL-004', villageName: 'Yerrampalem', latitude: 17.0864, longitude: 82.0945, sequence: 4, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-A-VIL-005', villageName: 'Aditya University', latitude: 17.0912, longitude: 82.0665, sequence: 5, radiusMeters: 250, kind: 'college' },
    ],
  });

  // Route B: Kakinada to Aditya University
  await Route.create({
    routeId: 'ROUTE-B',
    routeName: 'Kakinada to Aditya University Route',
    collegeLocation: { name: 'Aditya University', latitude: 17.0912, longitude: 82.0665 },
    villages: [
      { villageId: 'ROUTE-B-VIL-001', villageName: 'Kakinada', latitude: 16.9891, longitude: 82.2439, sequence: 1, radiusMeters: 250, kind: 'origin' },
      { villageId: 'ROUTE-B-VIL-002', villageName: 'Madhavapatnam', latitude: 17.0142, longitude: 82.2155, sequence: 2, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-B-VIL-003', villageName: 'Samalkot', latitude: 17.0504, longitude: 82.1659, sequence: 3, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-B-VIL-004', villageName: 'Peddapuram', latitude: 17.0757, longitude: 82.1433, sequence: 4, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-B-VIL-005', villageName: 'Aditya University', latitude: 17.0912, longitude: 82.0665, sequence: 5, radiusMeters: 250, kind: 'college' },
    ],
  });

  // Route C: Rajahmundry to Aditya University
  await Route.create({
    routeId: 'ROUTE-C',
    routeName: 'Rajahmundry to Aditya University Route',
    collegeLocation: { name: 'Aditya University', latitude: 17.0912, longitude: 82.0665 },
    villages: [
      { villageId: 'ROUTE-C-VIL-001', villageName: 'Rajahmundry', latitude: 17.0005, longitude: 81.7835, sequence: 1, radiusMeters: 250, kind: 'origin' },
      { villageId: 'ROUTE-C-VIL-002', villageName: 'Lalacheruvu', latitude: 17.0125, longitude: 81.8025, sequence: 2, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-C-VIL-003', villageName: 'Rajanagaram', latitude: 17.0792, longitude: 81.8985, sequence: 3, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-C-VIL-004', villageName: 'Gandepalli', latitude: 17.0874, longitude: 82.0125, sequence: 4, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-C-VIL-005', villageName: 'Aditya University', latitude: 17.0912, longitude: 82.0665, sequence: 5, radiusMeters: 250, kind: 'college' },
    ],
  });

  // Route D: Peddapuram to Aditya University
  await Route.create({
    routeId: 'ROUTE-D',
    routeName: 'Peddapuram to Aditya University Route',
    collegeLocation: { name: 'Aditya University', latitude: 17.0912, longitude: 82.0665 },
    villages: [
      { villageId: 'ROUTE-D-VIL-001', villageName: 'Peddapuram', latitude: 17.0757, longitude: 82.1433, sequence: 1, radiusMeters: 250, kind: 'origin' },
      { villageId: 'ROUTE-D-VIL-002', villageName: 'Yerrampalem', latitude: 17.0864, longitude: 82.0945, sequence: 2, radiusMeters: 250, kind: 'village' },
      { villageId: 'ROUTE-D-VIL-003', villageName: 'Aditya University', latitude: 17.0912, longitude: 82.0665, sequence: 3, radiusMeters: 250, kind: 'college' },
    ],
  });

  const buses = [
    { busId: 'BUS001', busNumber: 'BUS-12', routeId: 'ROUTE-A', routeName: 'Samalkot Route', driverId: 'DRV001', status: 'inactive', active: true },
    { busId: 'BUS002', busNumber: 'BUS-07', routeId: 'ROUTE-B', routeName: 'Kakinada Route', driverId: 'DRV002', status: 'inactive', active: true },
    { busId: 'BUS003', busNumber: 'BUS-03', routeId: 'ROUTE-C', routeName: 'Rajahmundry Route', driverId: '', status: 'inactive', active: true },
    { busId: 'BUS004', busNumber: 'BUS-09', routeId: 'ROUTE-D', routeName: 'Peddapuram Route', driverId: '', status: 'inactive', active: true },
  ];

  for (const bus of buses) {
    await Bus.updateOne({ busId: bus.busId }, { $set: bus }, { upsert: true });
  }

  // Seed master BusStop collection
  await BusStop.deleteMany({});
  await BusStop.create([
    { stopName: 'Kakinada', latitude: 16.9891, longitude: 82.2439, landmark: 'Collector Office', radiusMeters: 250 },
    { stopName: 'Samalkot', latitude: 17.0504, longitude: 82.1659, landmark: 'Railway Station', radiusMeters: 250 },
    { stopName: 'Peddapuram', latitude: 17.0757, longitude: 82.1433, landmark: 'Main Center', radiusMeters: 250 },
    { stopName: 'Rajahmundry', latitude: 17.0005, longitude: 81.7835, landmark: 'RTC Complex', radiusMeters: 250 },
    { stopName: 'Venkatapuram', latitude: 17.0259, longitude: 82.1369, landmark: 'Temple', radiusMeters: 250 },
    { stopName: 'Yanam', latitude: 16.7326, longitude: 82.2155, landmark: 'Bridge', radiusMeters: 250 },
    { stopName: 'Lalacheruvu', landmark: 'High School', latitude: 17.0125, longitude: 81.8025, radiusMeters: 250 }
  ]);
}
