import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { Bus } from '../models/Bus.js';
import { Route } from '../models/Route.js';
import { BusRoute } from '../models/BusRoute.js';
import { LiveLocation } from '../models/LiveLocation.js';
import { Trip } from '../models/Trip.js';
import { ActiveBus } from '../models/ActiveBus.js';
import { TrackingEvent } from '../models/TrackingEvent.js';
import { BusStop } from '../models/BusStop.js';
import { emitBusUpdate } from '../config/socket.js';
import { formatEta, haversineDistanceKm } from '../utils/geo.js';
import { Student } from '../models/Student.js';
import { ScanLog } from '../models/ScanLog.js';
import { sendSMS } from '../../sms.js';
import { ADITYA_UNIVERSITY_COORDS, normalizeLatLng, normalizeStopName, getDisplayStopName } from '../utils/coordResolver.js';

export async function startTrip({ busId, driverId, direction, startVillageId }) {
  const bus = await Bus.findOne({ busId });
  if (!bus) throw new Error('Bus not found');

  if (bus.status !== 'active') {
    throw new Error('Bus is inactive. Activate the bus before starting operations.');
  }

  const assignedStudentsCount = await Student.countDocuments({ 'bus_details.bus_number': bus.busNumber, status: 'active' });
  if (assignedStudentsCount === 0) {
    throw new Error('No students assigned to this bus.');
  }

  const activeTripBus = await Trip.findOne({ busId, status: 'active' });
  if (activeTripBus) throw new Error('Bus already has an active trip.');

  const activeTripDriver = await Trip.findOne({ driverId, status: 'active' });
  if (activeTripDriver) throw new Error('Driver already has an active trip.');

  const route = await Route.findOne({ routeId: bus.routeId });

  let villages = [];
  const busRoute = await BusRoute.findOne({ busNumber: bus.busNumber }).lean();

  if (busRoute && busRoute.stops.length > 0) {
    villages = busRoute.stops.map(stop => ({
      villageId: stop.stopName,
      villageName: stop.stopName,
      latitude: stop.latitude,
      longitude: stop.longitude,
      sequence: stop.sequence,
      studentCount: stop.studentCount,
      allowedRadiusMeters: stop.allowedRadiusMeters || 200,
      landmark: stop.landmark || '',
    }));
  } else {
    // Fallback to static route
    if (!route) throw new Error('Route not found for bus');
    villages = route.villages.map(v => ({
      villageId: v.villageId,
      villageName: v.villageName,
      latitude: v.latitude,
      longitude: v.longitude,
      sequence: v.sequence,
      studentCount: 0,
    }));
  }

  // Defect 11: Direction Validation
  const resolvedDirection = direction || 'to_college';
  if (resolvedDirection === 'to_college') {
    // Morning: start from boarding points, end at Aditya University
    villages.sort((a, b) => a.sequence - b.sequence);
    const lastStop = villages[villages.length - 1];
    if (lastStop && lastStop.villageName !== 'Aditya University') {
      villages.push({
        villageId: 'Aditya University',
        villageName: 'Aditya University',
        latitude: ADITYA_UNIVERSITY_COORDS.latitude,
        longitude: ADITYA_UNIVERSITY_COORDS.longitude,
        sequence: villages.length + 1,
        studentCount: 0,
        allowedRadiusMeters: 500,
        landmark: 'Campus'
      });
    }
  } else if (resolvedDirection === 'from_college') {
    // Evening: start from Aditya University, end at boarding points
    // Sort reverse sequence
    villages.sort((a, b) => b.sequence - a.sequence);
    const firstStop = villages[0];
    if (firstStop && firstStop.villageName !== 'Aditya University') {
      villages.unshift({
        villageId: 'Aditya University',
        villageName: 'Aditya University',
        latitude: ADITYA_UNIVERSITY_COORDS.latitude,
        longitude: ADITYA_UNIVERSITY_COORDS.longitude,
        sequence: 0,
        studentCount: 0,
        allowedRadiusMeters: 500,
        landmark: 'Campus'
      });
    }
  }

  const allStudentsOnBus = await Student.find({
    $or: [
      { 'bus_details.bus_number': bus.busNumber },
      { 'busNumber': bus.busNumber }
    ],
    status: 'active'
  }).lean();

  const routeProgress = villages.map((v, index) => {
    let liveCount = 0;
    if (v.villageName !== 'Aditya University') {
      const normalizedKey = normalizeStopName(v.villageName);
      liveCount = allStudentsOnBus.filter(s => {
        const rawBp = s.boardingPoint || s.bus_details?.boarding_point || '';
        return normalizeStopName(rawBp) === normalizedKey;
      }).length;
      if (v.studentCount !== undefined && v.studentCount !== liveCount) {
        console.warn(`[SNAPSHOT WARN] Mismatch in studentCount for stop ${v.villageName}. Original: ${v.studentCount}, Live: ${liveCount}. Syncing...`);
      }
    }
    return {
      villageId: v.villageId,
      villageName: v.villageName,
      sequence: index + 1,
      latitude: v.latitude,
      longitude: v.longitude,
      crossed: false,
      crossedAt: null,
      consecutivePings: 0,
      status: index === 0 ? 'current' : 'pending',
      allowedRadiusMeters: v.allowedRadiusMeters || 200,
      studentCount: liveCount,
      landmark: v.landmark || '',
    };
  });

  const tripId = `TRIP-${uuidv4()}`;
  const resolvedTripType = resolvedDirection === 'to_college' ? 'Trip 1 - Home → College' : 'Trip 2 - College → Home';

  // Defect 18: Route Snapshot Preservation & Defect 32: Hash generation
  const routeSnapshot = JSON.parse(JSON.stringify(routeProgress));

  // Only append if not already present
  const alreadyHasCollege = routeSnapshot.some(
    s => normalizeStopName(s.villageName) === normalizeStopName('Aditya University')
  );
  if (!alreadyHasCollege) {
    const collegeStop = {
      villageId:          'Aditya University',
      villageName:        'Aditya University',
      latitude:            17.0912,
      longitude:           82.0665,
      allowedRadiusMeters: 500,
      sequence:            routeSnapshot.length + 1,
      isDestination:       true,
      crossed:             false,
      autoBackfilled:      false,
      consecutivePings:    0,
      status:              'pending'
    };
    routeSnapshot.push(collegeStop);
    routeProgress.push({ ...collegeStop });
  }

  const routeSnapshotHash = crypto.createHash('sha256').update(JSON.stringify(routeSnapshot)).digest('hex');

  const trip = await Trip.create({
    tripId,
    busId,
    driverId,
    routeId: route ? route.routeId : bus.routeId,
    direction: resolvedDirection,
    tripType: resolvedTripType,
    startTime: new Date(),
    status: 'active',
    routeProgress,
    routeSnapshot,
    routeSnapshotHash,
    scannerEnabled: false,
    currentLocation: null,
    lastUpdatedAt: new Date(),
    isDemo: process.env.DEMO_MODE === 'true',
    summary: {
      averageSpeedKmph: 0,
      maxSpeedKmph: 0,
      villagesCrossed: 0,
      durationMinutes: 0,
      totalBoarded: 0,
      totalDropped: 0,
      peakOccupancy: 0,
      averageOccupancy: 0
    }
  });

  // Hot Path ActiveBus: initialize active bus location tracking
  await ActiveBus.updateOne(
    { busId },
    {
      $set: {
        busNumber: bus.busNumber,
        location: {
          type: 'Point',
          coordinates: [villages[0].longitude, villages[0].latitude]
        },
        speed: 0,
        heading: 0,
        currentTripId: tripId,
        lastUpdatedAt: new Date(),
        routeProgress: routeProgress,
        currentStopIndex: 0,
        nextStopIndex: 1,
      }
    },
    { upsert: true }
  );

  bus.currentTripId = tripId;
  bus.currentVillageId = routeProgress[0]?.villageId || null;
  bus.nextVillageId = routeProgress[1]?.villageId || null;
  await bus.save();

  await TrackingEvent.create({
    tripId: trip.tripId,
    busId,
    kind: 'trip-started',
    title: 'Trip started',
    message: `Trip started for bus ${bus.busNumber} (${direction === 'from_college' ? 'Return' : 'Forward'})`,
    payload: { busNumber: bus.busNumber, routeName: route ? route.routeName : bus.routeId, direction },
  });

  const studentsOnBus = await Student.find({ 'bus_details.bus_id': busId });
  const startStopName = routeProgress[0]?.villageName || 'origin';
  const smsBody = `SafeRide: Bus ${bus.busNumber} has started from ${startStopName}. Track live location in the SafeRide portal.`;
  
  const uniquePhones = new Map();
  for (const s of studentsOnBus) {
    if (s.parent_phone) {
      const cleanPhone = s.parent_phone.trim();
      if (!uniquePhones.has(cleanPhone)) {
        uniquePhones.set(cleanPhone, s._id.toString());
      }
    }
  }

  await Promise.all(
    Array.from(uniquePhones.entries()).map(([phone, studentId]) =>
      sendSMS(phone, smsBody, studentId, 'trip-start', tripId).catch(() => null)
    )
  );

  return trip;
}

export async function stopTrip({ busId, tripId, force = false }) {
  const trip = await Trip.findOne({ tripId, busId, status: 'active' });
  if (!trip) throw new Error('Active trip not found');

  const bus = await Bus.findOne({ busId });
  if (!bus) throw new Error('Bus not found');

  if (trip.direction === 'to_college') {
    const incomplete = await Student.find({
      'bus_details.bus_number': bus.busNumber,
      trackingStatus: 'BOARDED_TO_COLLEGE',
      attendanceException: { $in: ['', null] }
    });
    if (incomplete.length > 0) {
      if (force) {
        for (const student of incomplete) {
          student.trackingStatus = 'REACHED_COLLEGE';
          await student.save();
        }
        console.log(`[FORCE STOP] Auto-arrived ${incomplete.length} students at college.`);
      } else {
        throw new Error(`Cannot stop trip. ${incomplete.length} boarded student(s) have not arrived at college yet.`);
      }
    }
  } else if (trip.direction === 'from_college') {
    const incomplete = await Student.find({
      'bus_details.bus_number': bus.busNumber,
      trackingStatus: 'BOARDED_FROM_COLLEGE',
      attendanceException: { $in: ['', null] }
    });
    if (incomplete.length > 0) {
      if (force) {
        for (const student of incomplete) {
          student.trackingStatus = 'REACHED_HOME';
          await student.save();
        }
        console.log(`[FORCE STOP] Auto-arrived ${incomplete.length} students at home.`);
      } else {
        throw new Error(`Cannot stop trip. ${incomplete.length} boarded student(s) have not reached home yet.`);
      }
    }
  }

  const locations = await LiveLocation.find({ tripId, anomaly: { $ne: true } }).sort({ timestamp: 1 }).lean();
  const speeds = locations.map((l) => l.speed || 0);
  const averageSpeedKmph = speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : 0;
  const maxSpeedKmph = speeds.length ? Math.max(...speeds) : 0;
  const villagesCrossed = trip.routeProgress.filter((v) => v.crossed).length;
  const durationMinutes = Math.max(1, Math.round((Date.now() - new Date(trip.startTime).getTime()) / 60000));

  const totalBoarded = await ScanLog.countDocuments({ trip_id: tripId, action: 'board' });
  const totalDropped = await ScanLog.countDocuments({ trip_id: tripId, action: 'dropoff' });
  const currentOccupancy = totalBoarded - totalDropped;

  // Validation: Check if occupancy matches boundary safety rules
  if (currentOccupancy < 0 || currentOccupancy > (bus.capacity || 40)) {
    console.warn(`Occupancy inconsistency detected. Current occupancy is ${currentOccupancy} for completed trip ${tripId}.`);
  }

  // Extract coordinates for GeoJSON cold path archival (longitude, latitude)
  const coordinates = locations.map(l => [l.longitude, l.latitude]);

  const completedTrip = await Trip.findOneAndUpdate(
    { tripId, busId, status: 'active' },
    {
      $set: {
        status: 'completed',
        endTime: new Date(),
        routePath: {
          type: 'LineString',
          coordinates,
        },
        summary: {
          averageSpeedKmph: Number(averageSpeedKmph.toFixed(1)),
          maxSpeedKmph: Number(maxSpeedKmph.toFixed(1)),
          villagesCrossed,
          durationMinutes,
          totalBoarded,
          totalDropped,
          peakOccupancy: trip.summary?.peakOccupancy || totalBoarded,
          averageOccupancy: Math.round((totalBoarded + totalDropped) / 2)
        }
      }
    },
    { new: true }
  );

  if (!completedTrip) {
    throw new Error('Active trip not found');
  }

  // Remove ActiveBus (hot path cleanup)
  await ActiveBus.deleteOne({ busId });

  // Clean up LiveLocation records for this trip since it's archived
  await LiveLocation.deleteMany({ tripId });

  const freshBus = await Bus.findOne({ busId });
  if (freshBus) {
    freshBus.currentTripId = null;
    freshBus.currentVillageId = null;
    freshBus.nextVillageId = null;
    await freshBus.save();
  }

  await TrackingEvent.create({
    tripId: completedTrip.tripId,
    busId,
    kind: 'trip-stopped',
    title: 'Trip completed',
    message: `Trip completed for bus ${bus?.busNumber || busId}`,
    payload: completedTrip.summary || {},
  });

  const studentsOnBus = await Student.find({ 'bus_details.bus_id': busId });
  const smsBody = `SafeRide: Bus ${bus?.busNumber || busId} has completed today's trip.`;
  
  const uniquePhones = new Map();
  for (const s of studentsOnBus) {
    if (s.parent_phone) {
      const cleanPhone = s.parent_phone.trim();
      if (!uniquePhones.has(cleanPhone)) {
        uniquePhones.set(cleanPhone, s._id.toString());
      }
    }
  }

  await Promise.all(
    Array.from(uniquePhones.entries()).map(([phone, studentId]) =>
      sendSMS(phone, smsBody, studentId, 'trip-stop', tripId).catch(() => null)
    )
  );

  return completedTrip;
}

export async function updateLocation({ busId, tripId, latitude, longitude, speed = 0, heading = 0, timestamp = new Date(), accuracy = 10, silent = false }) {
  const trip = await Trip.findOne({ tripId, busId, status: 'active' });
  if (!trip) throw new Error('Active trip not found');
  const bus = await Bus.findOne({ busId });
  if (!bus) throw new Error('Bus not found');
  const route = await Route.findOne({ routeId: trip.routeId });
  if (!route) throw new Error('Route not found');

  // Defect 32: Snapshot SHA256 integrity validation
  const currentHash = crypto.createHash('sha256').update(JSON.stringify(trip.routeSnapshot)).digest('hex');
  if (trip.routeSnapshotHash && currentHash !== trip.routeSnapshotHash) {
    throw new Error('Route snapshot integrity violation detected.');
  }

  const { latitude: cleanLat, longitude: cleanLng } = normalizeLatLng(latitude, longitude);

  // Andhra Pradesh boundary geofence check
  const isOutOfAP = cleanLat < 15.0 || cleanLat > 19.5 || cleanLng < 79.0 || cleanLng > 85.0;
  if (isOutOfAP) {
    const reason = 'GPS coordinates outside Andhra Pradesh boundaries';
    console.log('[GPS REJECTED]', JSON.stringify({ busNumber: bus.busNumber, latitude, longitude, reason }));
    await ActiveBus.updateOne(
      { busId },
      { $inc: { gpsPacketsRejected: 1 } }
    );
    throw new Error(reason);
  }

  const lastLocation = await LiveLocation.findOne({ tripId, anomaly: { $ne: true } }).sort({ timestamp: -1 }).lean();

  // Defect 17: GPS Timestamp Integrity
  if (lastLocation && new Date(timestamp).getTime() < new Date(lastLocation.timestamp).getTime()) {
    const reason = 'Out-of-order GPS packet rejected';
    console.warn(`[GPS TIMESTAMP WARNING] Out-of-order GPS packet rejected. Incoming: ${timestamp}, Last: ${lastLocation.timestamp}`);
    await ActiveBus.updateOne(
      { busId },
      { $inc: { gpsPacketsRejected: 1 } }
    );
    throw new Error(reason);
  }

let isSuspicious = false;
let isAnomaly = false;
let anomalyReason = '';

if (lastLocation) {
  const dist = haversineDistanceKm(
    { latitude: lastLocation.latitude, longitude: lastLocation.longitude },
    { latitude: cleanLat, longitude: cleanLng }
  );

  // Reject GPS updates with unrealistic speed calculations or jumps greater than 500m
  const timeDiffSeconds = (new Date(timestamp).getTime() - new Date(lastLocation.timestamp).getTime()) / 1000;
  const timeDiffHrs = timeDiffSeconds / 3600;

  if (dist > 0.5 && timeDiffSeconds <= 15) {
    isAnomaly = true;
    anomalyReason = 'GPS jump detected';
    console.warn(`[GPS ANOMALY] Jump > 500m detected and filtered. Distance: ${(dist*1000).toFixed(1)}m`);
  }

  if (timeDiffHrs > 0 && !isAnomaly) {
    const calculatedSpeed = dist / timeDiffHrs;
    const maxSpeed = process.env.MAX_BUS_SPEED_KMH ? Number(process.env.MAX_BUS_SPEED_KMH) : 90;
    if (calculatedSpeed > maxSpeed) {
      isAnomaly = true;
      anomalyReason = 'GPS jump detected'; // Mark speed anomalies similarly
      console.warn(`[GPS SPOOFING WARNING] GPS spoofing or invalid location detected. Speed: ${calculatedSpeed.toFixed(2)} km/h`);
    }
  }
}

const isLowAccuracy = Number(accuracy) > 50;

// Save the record
const location = await LiveLocation.create({
  busId,
  tripId,
  latitude: cleanLat,
  longitude: cleanLng,
  speed,
  heading,
  timestamp: new Date(timestamp),
  suspicious: isSuspicious,
  anomaly: isAnomaly,
  reason: anomalyReason,
  lowAccuracy: isLowAccuracy,
  isDemo: process.env.DEMO_MODE === 'true',
});

if (isAnomaly) {
  const reason = anomalyReason || 'GPS jump detected';
  console.log('[GPS REJECTED]', JSON.stringify({ busNumber: bus.busNumber, latitude: cleanLat, longitude: cleanLng, reason }));
  await ActiveBus.updateOne(
    { busId },
    { $inc: { gpsPacketsRejected: 1 } }
  );
  return { location, trip, payload: { anomaly: true, reason } };
}

// Accepted packet logic
console.log('[GPS ACCEPTED]', JSON.stringify({ busNumber: bus.busNumber, latitude: cleanLat, longitude: cleanLng, accuracy, timestamp, accepted: true }));


  await ActiveBus.updateOne(
    { busId },
    {
      $set: {
        location: {
          type: 'Point',
          coordinates: [cleanLng, cleanLat]
        },
        speed,
        heading,
        lastUpdatedAt: new Date(),
        lastGpsUpdateAt: new Date(),
        lastGpsSource: 'device',
        lastGpsAccuracy: accuracy,
        accuracy,
        lastTelemetryStatus: 'active'
      },
      $inc: { gpsPacketsReceived: 1, packetCount: 1 }
    }
  );

  const currentPoint = { latitude: cleanLat, longitude: cleanLng };

  const allBusStops = await BusStop.find({});

  // Calculate distance to all stops to find the nearest stop and handle geofencing
  let nearestStop = null;
  let minDistanceMeters = Infinity;

  trip.routeProgress.forEach((stop) => {
    const matchedStop = allBusStops.find(s => normalizeStopName(s.stopName) === normalizeStopName(stop.villageName));
    const allowedRadius = matchedStop ? matchedStop.radiusMeters : (stop.allowedRadiusMeters || 250);

    const dist = haversineDistanceKm(currentPoint, stop) * 1000;
    if (dist <= allowedRadius) {
      stop.consecutivePings = (stop.consecutivePings || 0) + 1;
    } else {
      stop.consecutivePings = 0;
    }

    if (dist < minDistanceMeters) {
      minDistanceMeters = dist;
      nearestStop = stop;
    }
  });

  const nearestStopConfig = allBusStops.find(s => normalizeStopName(s.stopName) === normalizeStopName(nearestStop?.villageName));
  const nearestStopRadius = nearestStopConfig ? nearestStopConfig.radiusMeters : (nearestStop?.allowedRadiusMeters || 200);

  // Geofence Check: if inside the nearest stop's radius and accuracy is acceptable
  if (!isLowAccuracy && nearestStop && minDistanceMeters <= nearestStopRadius && !isSuspicious && (nearestStop.consecutivePings >= 2)) {
    if (nearestStop.villageName === 'Aditya University') {
      // Complete trip on Aditya University geofence entry
      trip.routeProgress.forEach((stop) => {
        if (!stop.crossed) {
          stop.crossed = true;
          if (!stop.crossedAt) stop.crossedAt = new Date(timestamp);
          stop.status = 'crossed';
          if (stop.sequence < nearestStop.sequence) {
            stop.autoBackfilled = true;
          }
        }
      });
      trip.markModified('routeProgress');
      trip.currentLocation = { latitude: cleanLat, longitude: cleanLng, speed, heading, timestamp: new Date(timestamp) };
      trip.currentSpeedKmph = speed;
      trip.remainingDistanceKm = 0;
      trip.totalDistanceKm = Number((trip.routeProgress.length * 0.5).toFixed(2));
      trip.lastUpdatedAt = new Date(timestamp);
      await trip.save();

      await stopTrip({ busId, tripId, force: true });

      const trackingState = await buildTrackingState(bus.busNumber);
      emitBusUpdate(trackingState);
      return { location, trip, payload: trackingState };
    } else {
      trip.routeProgress.forEach((stop) => {
        if (stop.sequence <= nearestStop.sequence) {
          if (!stop.crossed) {
            stop.crossed = true;
            stop.crossedAt = new Date(timestamp);
            stop.status = 'crossed';
            if (stop.sequence < nearestStop.sequence) {
              stop.autoBackfilled = true;
            }

            TrackingEvent.create({
              tripId,
              busId,
              kind: 'village-crossed',
              title: 'Village crossed',
              message: `${stop.villageName} crossed by bus ${bus.busNumber}`,
              payload: { villageId: stop.villageId, villageName: stop.villageName, autoBackfilled: stop.sequence < nearestStop.sequence },
            }).catch(() => {});
          }
        }
      });
    }
  }

  // Update current/crossed status in trip.routeProgress
  let nearestStopOverall = null;
  let minOverallDistanceMeters = Infinity;
  trip.routeProgress.forEach((stop) => {
    const dist = haversineDistanceKm(currentPoint, stop) * 1000;
    if (dist < minOverallDistanceMeters) {
      minOverallDistanceMeters = dist;
      nearestStopOverall = stop;
    }
  });

  trip.routeProgress.forEach((stop) => {
    if (nearestStopOverall && stop.villageId === nearestStopOverall.villageId) {
      stop.status = 'current';
    } else if (stop.crossed) {
      stop.status = 'crossed';
    } else {
      stop.status = 'pending';
    }
  });

  const crossedCount = trip.routeProgress.filter(v => v.crossed).length;
  const currentStopIndex = Math.max(0, crossedCount - 1);
  const nextStopIndex = crossedCount;

  const sortedProgress = [...trip.routeProgress].sort((a, b) => a.sequence - b.sequence);
  const curStop = sortedProgress[currentStopIndex];
  const nxtStop = sortedProgress[nextStopIndex];
  bus.currentVillageId = curStop ? curStop.villageId : null;
  bus.nextVillageId = nxtStop ? nxtStop.villageId : null;

  trip.markModified('routeProgress');
  trip.currentLocation = { latitude: cleanLat, longitude: cleanLng, speed, heading, timestamp: new Date(timestamp) };
  trip.currentSpeedKmph = speed;
  trip.lastUpdatedAt = new Date(timestamp);
  
  await trip.save();

  await ActiveBus.updateOne(
    { busId },
    {
      $set: {
        routeProgress: trip.routeProgress,
        currentStopIndex,
        nextStopIndex,
      }
    }
  );

  bus.lastKnownLocation = { latitude: cleanLat, longitude: cleanLng, speed, heading, timestamp: new Date(timestamp) };
  await bus.save();

  // Return and emit the unified trackingState
  const trackingState = await buildTrackingState(bus.busNumber);
  emitBusUpdate(trackingState);
  return { location, trip, payload: trackingState };
}

// Bulk offline synchronization endpoint
export async function syncLocationHistory({ busId, tripId, locationBuffer }) {
  const trip = await Trip.findOne({ tripId, busId, status: 'active' });
  if (!trip) throw new Error('Active trip not found');
  if (!locationBuffer || locationBuffer.length === 0) return null;

  const historicalPoints = locationBuffer.slice(0, -1);
  const finalPoint = locationBuffer[locationBuffer.length - 1];

  if (historicalPoints.length > 0) {
    const documents = historicalPoints.map((point) => ({
      busId,
      tripId,
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed || 0,
      heading: point.heading || 0,
      timestamp: new Date(point.timestamp || Date.now()),
      suspicious: false,
      isDemo: process.env.DEMO_MODE === 'true',
    }));
    await LiveLocation.insertMany(documents);
  }

  const lastUpdate = await updateLocation({
    busId,
    tripId,
    latitude: finalPoint.latitude,
    longitude: finalPoint.longitude,
    speed: finalPoint.speed || 0,
    heading: finalPoint.heading || 0,
    timestamp: finalPoint.timestamp || new Date(),
    silent: true,
  });

  return lastUpdate ? lastUpdate.payload : null;
}

export async function getLiveBusLocation(busId) {
  const active = await ActiveBus.findOne({ busId }).lean();
  if (active) {
    return {
      busId: active.busId,
      busNumber: active.busNumber,
      latitude: active.location.coordinates[1],
      longitude: active.location.coordinates[0],
      speed: active.speed,
      heading: active.heading,
      lastUpdatedAt: active.lastUpdatedAt,
      currentTripId: active.currentTripId,
    };
  }
  const bus = await Bus.findOne({ busId }).lean();
  return bus?.lastKnownLocation || null;
}

export async function getCurrentBusLocation(busId) {
  return getLiveBusLocation(busId);
}

export async function getRouteProgress(busId) {
  const active = await ActiveBus.findOne({ busId }).lean();
  if (!active) {
    return { tripStatus: 'inactive', routeProgress: [], currentLocation: null, remainingDistanceKm: 0, currentSpeedKmph: 0 };
  }
  const trip = await Trip.findOne({ tripId: active.currentTripId }).lean();
  if (!trip) throw new Error('Trip not found');
  return {
    tripId: trip.tripId,
    routeProgress: trip.routeProgress,
    currentLocation: trip.currentLocation,
    remainingDistanceKm: trip.remainingDistanceKm,
    currentSpeedKmph: trip.currentSpeedKmph,
    tripStatus: trip.status,
    direction: trip.direction,
  };
}

export async function getETA(busId) {
  const active = await ActiveBus.findOne({ busId }).lean();
  if (!active) {
    return { currentSpeedKmph: 0, distanceRemainingKm: 0, nextVillage: null, etaToNextVillageMinutes: 0, etaToNextVillageLabel: '--', etaToCollegeMinutes: 0, etaToCollegeLabel: '--' };
  }
  const trip = await Trip.findOne({ tripId: active.currentTripId }).lean();
  if (!trip) throw new Error('Trip not found');

  const nextVillage = trip.routeProgress.filter((v) => !v.crossed).sort((a, b) => a.sequence - b.sequence)[0] || null;
  const safeSpeed = Math.max(trip.currentSpeedKmph || 0, 25);
  const currentPoint = trip.currentLocation;
  let distanceToNextVillageKm = 0;
  if (currentPoint && nextVillage) {
    distanceToNextVillageKm = haversineDistanceKm(currentPoint, nextVillage);
  }
  const etaToNextVillageMinutes = nextVillage ? (distanceToNextVillageKm / safeSpeed) * 60 : 0;
  const etaToCollegeMinutes = (trip.remainingDistanceKm || 0) > 0 ? ((trip.remainingDistanceKm || 0) / safeSpeed) * 60 : 0;

  return {
    currentSpeedKmph: trip.currentSpeedKmph || 0,
    distanceRemainingKm: Number((trip.remainingDistanceKm || 0).toFixed(2)),
    nextVillage: nextVillage
      ? { villageId: nextVillage.villageId, villageName: nextVillage.villageName, sequence: nextVillage.sequence }
      : null,
    etaToNextVillageMinutes: Number(etaToNextVillageMinutes.toFixed(1)),
    etaToNextVillageLabel: formatEta(etaToNextVillageMinutes),
    etaToCollegeMinutes: Number(etaToCollegeMinutes.toFixed(1)),
    etaToCollegeLabel: formatEta(etaToCollegeMinutes),
  };
}

export async function getVillagesStatus(busId) {
  const active = await ActiveBus.findOne({ busId }).lean();
  if (!active) return [];
  const trip = await Trip.findOne({ tripId: active.currentTripId }).lean();
  return trip ? trip.routeProgress : [];
}

export async function getTripHistory(busId) {
  return Trip.find({ busId }).sort({ startTime: -1 }).limit(30).lean();
}

export async function getTrackingSnapshot(busId) {
  const bus = await Bus.findOne({ busId }).lean();
  if (!bus) throw new Error('Bus not found');
  const active = await ActiveBus.findOne({ busId }).lean();
  if (!active) {
    return {
      busId,
      status: 'inactive',
      currentLocation: bus.lastKnownLocation || null,
      routeProgress: [],
      eta: null,
      nextVillage: null,
    };
  }
  const [progress, eta] = await Promise.all([getRouteProgress(busId), getETA(busId)]);
  return {
    busId,
    status: progress.tripStatus,
    direction: progress.direction,
    currentLocation: progress.currentLocation,
    routeProgress: progress.routeProgress,
    remainingDistanceKm: progress.remainingDistanceKm,
    speedKmph: progress.currentSpeedKmph,
    eta,
    nextVillage: eta.nextVillage,
    lastUpdatedAt: progress.currentLocation?.timestamp || null,
  };
}

export async function getActiveBuses() {
  const activeList = await ActiveBus.find().lean();
  const snapshots = await Promise.all(
    activeList.map((active) => getTrackingSnapshot(active.busId).catch(() => null))
  );
  return snapshots.filter(Boolean);
}

export async function resolveCurrentGps(busNumber) {
  const bus = await Bus.findOne({ busNumber });
  if (!bus) return null;
  const activeBus = await ActiveBus.findOne({ busId: bus.busId }).lean();
  if (activeBus && activeBus.location && activeBus.location.coordinates) {
    return {
      latitude: activeBus.location.coordinates[1],
      longitude: activeBus.location.coordinates[0],
      source: activeBus.lastGpsSource || 'ActiveBus',
      timestamp: activeBus.lastGpsUpdateAt || activeBus.lastUpdatedAt || new Date(),
      accuracy: activeBus.lastGpsAccuracy || 10
    };
  }
  
  const trip = await Trip.findOne({ busId: bus.busId, status: 'active' }).lean();
  if (trip && trip.currentLocation) {
    return {
      latitude: trip.currentLocation.latitude,
      longitude: trip.currentLocation.longitude,
      source: 'Trip',
      timestamp: trip.lastUpdatedAt || new Date(),
      accuracy: 10
    };
  }

  const latestLocation = await LiveLocation.findOne({ busId: bus.busId }).sort({ timestamp: -1 }).lean();
  if (latestLocation) {
    return {
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude,
      source: 'LiveLocation',
      timestamp: latestLocation.timestamp,
      accuracy: latestLocation.lowAccuracy ? 100 : 10
    };
  }

  if (bus.lastKnownLocation) {
    return {
      latitude: bus.lastKnownLocation.latitude,
      longitude: bus.lastKnownLocation.longitude,
      source: 'BusLastKnown',
      timestamp: bus.lastKnownLocation.timestamp || new Date(),
      accuracy: 10
    };
  }

  return null;
}

export async function buildTrackingState(busNumber) {
  const bus = await Bus.findOne({ busNumber });
  if (!bus) return null;

  const activeBus = await ActiveBus.findOne({ busId: bus.busId });
  const trip = await Trip.findOne({ busId: bus.busId, status: 'active' });

  if (!activeBus || !trip) {
    return {
      busId: bus.busId,
      busNumber,
      tripStatus: 'inactive',
      currentGps: null,
      nearestStop: null,
      currentStop: 'Unknown',
      nextStop: null,
      distanceRemaining: 0,
      etaToNextStop: 0,
      etaToDestination: 0,
      routeProgress: [],
      routeSnapshot: [],
      occupancy: 0,
      studentCounts: {},
      lastGpsUpdateAt: null,
      lastGpsSource: null,
      lastGpsAccuracy: null,
      gpsPacketsReceived: 0,
      gpsPacketsRejected: 0
    };
  }

  const coordinates = activeBus.location?.coordinates || [82.0665, 17.0912];
  const currentGps = {
    latitude: coordinates[1],
    longitude: coordinates[0]
  };

  // Student collection counts live
  const activeStudents = await Student.find({
    $or: [
      { 'bus_details.bus_number': busNumber },
      { busNumber }
    ],
    status: { $ne: 'deleted' }
  }).lean();

  const studentCounts = {};
  (activeBus.routeProgress || []).forEach(s => {
    studentCounts[s.villageName] = 0;
  });

  activeStudents.forEach(s => {
    const bp = s.boardingPoint || s.bus_details?.boarding_point;
    if (bp) {
      const matchingStop = (activeBus.routeProgress || []).find(stop => normalizeStopName(stop.villageName) === normalizeStopName(bp));
      if (matchingStop) {
        studentCounts[matchingStop.villageName] = (studentCounts[matchingStop.villageName] || 0) + 1;
      }
    }
  });

  // Calculate nearestStop, distanceToNearestStop, currentStop from GPS first
  let nearestStop = null;
  let minDistanceMeters = Infinity;
  let currentStop = 'Unknown';

  const routeProgress = (activeBus.routeProgress || []).map(stop => {
    const dist = haversineDistanceKm(currentGps, stop) * 1000;
    if (dist < minDistanceMeters) {
      minDistanceMeters = dist;
      nearestStop = stop.villageName;
    }
    // Update live studentCount
    return {
      ...stop,
      studentCount: studentCounts[stop.villageName] || 0
    };
  });

  const activeStop = routeProgress.find(stop => {
    const dist = haversineDistanceKm(currentGps, stop) * 1000;
    return dist <= (stop.allowedRadiusMeters || 200);
  });

  if (activeStop) {
    currentStop = activeStop.villageName;
  } else {
    const lastCrossed = [...routeProgress].reverse().find(s => s.crossed);
    currentStop = lastCrossed ? lastCrossed.villageName : (routeProgress[0]?.villageName || 'Unknown');
  }

  const nextStopObj = [...routeProgress]
    .sort((a, b) => a.sequence - b.sequence)
    .find(s => !s.crossed);
  const nextStop = nextStopObj ? nextStopObj.villageName : null;

  // Recalculate remaining distance
  const remainingVillages = routeProgress
    .filter((v) => !v.crossed)
    .sort((a, b) => a.sequence - b.sequence);

  const polyline = [currentGps, ...remainingVillages.map((v) => ({ latitude: v.latitude, longitude: v.longitude }))];
  let distanceRemaining = 0;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    distanceRemaining += haversineDistanceKm(polyline[i], polyline[i + 1]);
  }
  distanceRemaining = Number(distanceRemaining.toFixed(2));

  // Recalculate ETAs
  const lastSpeeds = await LiveLocation.find({ tripId: trip.tripId }).sort({ timestamp: -1 }).limit(3).select('speed').lean();
  const speedsArray = lastSpeeds.map(l => l.speed || 0);
  if (speedsArray.length === 0) speedsArray.push(activeBus.speed || 0);
  const avgSpeed = speedsArray.reduce((sum, v) => sum + v, 0) / speedsArray.length;
  const safeSpeed = avgSpeed < 5 ? 25 : Math.min(avgSpeed, 80);

  const distanceToNextStop = nextStopObj ? haversineDistanceKm(currentGps, nextStopObj) : 0;
  const etaToNextStop = distanceToNextStop > 0 ? (distanceToNextStop / safeSpeed) * 60 : 0;
  const etaToDestination = distanceRemaining > 0 ? (distanceRemaining / safeSpeed) * 60 : 0;

  // Occupancy live from ScanLogs
  const totalBoarded = await ScanLog.countDocuments({ trip_id: trip.tripId, action: 'board', result: 'success' });
  const totalDropped = await ScanLog.countDocuments({ trip_id: trip.tripId, action: 'dropoff', result: 'success' });
  const occupancy = Math.max(0, totalBoarded - totalDropped);

  const routeSnapshot = (trip.routeSnapshot || []).map(stop => {
    return {
      ...stop,
      studentCount: studentCounts[stop.villageName] || 0
    };
  });

  return {
    busId: bus.busId,
    busNumber,
    tripStatus: trip.status,
    currentGps,
    nearestStop,
    currentStop,
    nextStop,
    distanceRemaining,
    etaToNextStop: Number(etaToNextStop.toFixed(1)),
    etaToDestination: Number(etaToDestination.toFixed(1)),
    routeProgress,
    routeSnapshot,
    occupancy,
    studentCounts,
    lastGpsUpdateAt: activeBus.lastGpsUpdateAt,
    lastGpsSource: activeBus.lastGpsSource,
    lastGpsAccuracy: activeBus.lastGpsAccuracy,
    gpsPacketsReceived: activeBus.gpsPacketsReceived || 0,
    gpsPacketsRejected: activeBus.gpsPacketsRejected || 0,
    serverTime: new Date()
  };
}

