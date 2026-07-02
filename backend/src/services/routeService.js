import { Student } from '../models/Student.js';
import { BusRoute } from '../models/BusRoute.js';
import { Bus } from '../models/Bus.js';
import { Route } from '../models/Route.js';
import { BusStop } from '../models/BusStop.js';
import { Trip } from '../models/Trip.js';
import { ActiveBus } from '../models/ActiveBus.js';
import { LiveLocation } from '../models/LiveLocation.js';
import { haversineDistanceKm } from '../utils/geo.js';
import { ADITYA_UNIVERSITY_COORDS, normalizeLatLng, detectDrift, normalizeStopName, getDisplayStopName } from '../utils/coordResolver.js';

export async function rebuildBusRoute(busNumber) {
  if (!busNumber) return null;

  // Defect 16: If bus has active trip, block route rebuild operations.
  const bus = await Bus.findOne({ busNumber }).lean();
  if (bus) {
    const activeTrip = await Trip.findOne({ busId: bus.busId, status: 'active' }).lean();
    if (activeTrip) {
      throw new Error('Cannot modify route while a trip is active.');
    }
  }

  // 1. Fetch all active students on this bus
  const students = await Student.find({
    $or: [
      { 'bus_details.bus_number': busNumber },
      { 'busNumber': busNumber }
    ],
    status: 'active'
  }).lean();

  const activeStudents = students.filter(
    s =>
      ((s.bus_details?.bus_number === busNumber) || (s.busNumber === busNumber)) &&
      (s.boardingPoint || s.bus_details?.boarding_point) &&
      !s.isDeleted &&
      s.status === 'active'
  );

  if (activeStudents.length === 0) {
    // Delete BusRoute document
    await BusRoute.deleteOne({ busNumber });
    
    // Clear ActiveBus route snapshot references and mark route inactive
    const busId = bus?.busId;
    await ActiveBus.updateMany(
      { $or: [{ busNumber }, { busId }] },
      {
        $unset: {
          routeProgress: "",
          currentStopIndex: "",
          nextStopIndex: "",
          remainingDistance: "",
          nextVillage: ""
        }
      }
    );

    if (busId) {
      await LiveLocation.updateMany(
        { busId },
        { $unset: { nextStop: "" } }
      );
      await Trip.updateMany(
        { busId, status: 'active' },
        {
          $set: {
            routeSnapshot: [],
            routeSnapshotHash: ""
          }
        }
      );
    }
    
    console.log(`🚌 Rebuilt BusRoute for ${busNumber}: Deleted route (0 active students assigned).`);
    return [];
  }


  // Fetch the Bus record to retrieve route villages for Priority 2
  let routeVillages = [];
  if (bus && bus.routeId) {
    const route = await Route.findOne({ routeId: bus.routeId }).lean();
    if (route && route.villages) {
      routeVillages = route.villages;
    }
  }

  // 2. Group by unique boarding point
  const stopMap = new Map();
  const stopStudentsMap = new Map(); // For logging students assigned

  for (const s of activeStudents) {
    // Defect 4: Normalize Stop/Boarding point names (case-insensitive, trimmed, unified whitespaces)
    const rawBp = s.boardingPoint || s.bus_details?.boarding_point || 'Unknown';
    const normalizedKey = normalizeStopName(rawBp);
    const boardingPoint = getDisplayStopName(rawBp);

    if (!stopStudentsMap.has(normalizedKey)) {
      stopStudentsMap.set(normalizedKey, []);
    }
    stopStudentsMap.get(normalizedKey).push(s.name);

    if (!stopMap.has(normalizedKey)) {
      // Resolve coordinates based on Priority 1, 2, 3
      let lat = 0;
      let lng = 0;
      let rad = s.allowedRadiusMeters || 250;
      let landmark = s.landmark || '';

      // Priority 1: BusStop Master Collection
      const masterStop = await BusStop.findOne({ stopName: new RegExp(`^${boardingPoint.trim()}$`, 'i') }).lean();
      if (masterStop && masterStop.latitude && masterStop.longitude) {
        const { latitude, longitude } = normalizeLatLng(masterStop.latitude, masterStop.longitude);
        lat = latitude;
        lng = longitude;
        if (masterStop.radiusMeters) rad = masterStop.radiusMeters;
        if (masterStop.landmark) landmark = masterStop.landmark;

        // Perform drift audits against lower priorities for warning logs
        const matchingVillage = routeVillages.find(
          v => normalizeStopName(v.villageName) === normalizedKey
        );
        if (matchingVillage && matchingVillage.latitude && matchingVillage.longitude) {
          const vCoords = normalizeLatLng(matchingVillage.latitude, matchingVillage.longitude);
          detectDrift('Route stop coordinates', { latitude: lat, longitude: lng }, vCoords);
        }
        if (s.latitude && s.longitude) {
          const sCoords = normalizeLatLng(s.latitude, s.longitude);
          detectDrift('Student coordinates', { latitude: lat, longitude: lng }, sCoords);
        }
      } else {
        // Priority 2: Route Master Village List
        const matchingVillage = routeVillages.find(
          v => normalizeStopName(v.villageName) === normalizedKey
        );
        if (matchingVillage && matchingVillage.latitude && matchingVillage.longitude) {
          const { latitude, longitude } = normalizeLatLng(matchingVillage.latitude, matchingVillage.longitude);
          lat = latitude;
          lng = longitude;
          if (matchingVillage.radiusMeters) rad = matchingVillage.radiusMeters;

          if (s.latitude && s.longitude) {
            const sCoords = normalizeLatLng(s.latitude, s.longitude);
            detectDrift('Student coordinates', { latitude: lat, longitude: lng }, sCoords);
          }
        } else {
          // Priority 3: Student Fallback Coordinates
          const { latitude, longitude } = normalizeLatLng(s.latitude || s.home_latitude || 0, s.longitude || s.home_longitude || 0);
          lat = latitude;
          lng = longitude;
        }
      }

      if (!lat || !lng || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        throw new Error(`Invalid or missing coordinates for stop: ${boardingPoint}`);
      }

      stopMap.set(normalizedKey, {
        stopName: boardingPoint,
        latitude: lat,
        longitude: lng,
        studentCount: 0,
        allowedRadiusMeters: rad,
        landmark: landmark
      });
    }

    const stop = stopMap.get(normalizedKey);
    stop.studentCount += 1;
  }

  // Convert map to array
  let rawStops = Array.from(stopMap.values());

  // 3. Sort stops by distance to Aditya University (descending order - furthest first)
  rawStops.sort((a, b) => {
    const distA = haversineDistanceKm(a, ADITYA_UNIVERSITY_COORDS);
    const distB = haversineDistanceKm(b, ADITYA_UNIVERSITY_COORDS);
    return distB - distA; // Descending
  });

  if (rawStops.length === 0) {
    await BusRoute.deleteOne({ busNumber });
    const busId = bus?.busId;
    await ActiveBus.updateMany(
      { $or: [{ busNumber }, { busId }] },
      {
        $unset: {
          routeProgress: "",
          currentStopIndex: "",
          nextStopIndex: "",
          remainingDistance: "",
          nextVillage: ""
        }
      }
    );
    if (busId) {
      await LiveLocation.updateMany(
        { busId },
        { $unset: { nextStop: "" } }
      );
      await Trip.updateMany(
        { busId, status: 'active' },
        {
          $set: {
            routeSnapshot: [],
            routeSnapshotHash: ""
          }
        }
      );
    }
    return [];
  }

  // Defect 22: Append Aditya University destination stop exactly using ADITYA_UNIVERSITY_COORDS constant
  rawStops.push({
    stopName: 'Aditya University',
    latitude: ADITYA_UNIVERSITY_COORDS.latitude,
    longitude: ADITYA_UNIVERSITY_COORDS.longitude,
    studentCount: 0,
    allowedRadiusMeters: 500,
    landmark: 'Campus'
  });

  // Attempt OSRM Trip Optimization
  if (rawStops.length > 2) {
    const coords = rawStops.map(s => `${s.longitude},${s.latitude}`).join(';');
    const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&destination=last&roundtrip=false`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      console.log(`Optimizing route ${busNumber} via OSRM Trip API...`);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.code === 'Ok' && data.waypoints) {
          // Sort rawStops to match the OSRM optimized visited order
          const sortedWaypoints = [...data.waypoints].sort((a, b) => a.trips_index - b.trips_index);
          const optimized = sortedWaypoints.map(wp => rawStops[wp.waypoint_index]);
          if (optimized.length === rawStops.length) {
            rawStops = optimized;
            console.log(`✓ OSRM successfully optimized dynamic stop ordering for ${busNumber}.`);
          }
        } else {
          throw new Error(`OSRM Trip API returned code: ${data.code}`);
        }
      } else {
        throw new Error(`OSRM Trip API status error: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[OSRM Fallback] OSRM unavailable. Falling back to distance-based routing. Reason: ${err.message}`);
    }
  }

  // 4. Map sequence numbers
  const stops = rawStops.map((stop, index) => ({
    stopName: stop.stopName,
    latitude: stop.latitude,
    longitude: stop.longitude,
    studentCount: stop.studentCount,
    allowedRadiusMeters: stop.allowedRadiusMeters || 250,
    landmark: stop.landmark || '',
    sequence: index + 1
  }));

  // 5. Save/Update BusRoute collection
  await BusRoute.updateOne(
    { busNumber },
    { $set: { stops } },
    { upsert: true }
  );

  // 6. Verification Logging
  console.log(`\nBus: ${busNumber}\n`);
  for (const stop of stops) {
    if (stop.stopName === 'Aditya University') continue;
    const normalizedKey = stop.stopName.trim().replace(/\s+/g, ' ').toLowerCase();
    const sList = stopStudentsMap.get(normalizedKey) || [];
    console.log(`Stop: ${stop.stopName}`);
    console.log(`Latitude: ${stop.latitude}`);
    console.log(`Longitude: ${stop.longitude}`);
    console.log(`Students:`);
    sList.forEach(name => console.log(`* ${name}`));
    console.log(`  Count: ${stop.studentCount}\n`);
  }

  console.log(`🚌 Rebuilt BusRoute for ${busNumber}: ${stops.length} stops generated.`);
  return stops;
}
