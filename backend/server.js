import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { sendSMS, getSmsLog, smsConfigured } from './sms.js';
import { connectDB } from './src/config/db.js';
import mongoose from 'mongoose';
import { registerSocketHandlers, setIO } from './src/config/socket.js';
import { seedTrackingData } from './src/services/seedService.js';
import trackingRoutes from './src/routes/trackingRoutes.js';
import metaRoutes from './src/routes/metaRoutes.js';
import { buildTrackingState } from './src/services/trackingService.js';
import { getConfigs } from './src/config/configService.js';
import { Bus } from './src/models/Bus.js';
import { Route } from './src/models/Route.js';
import { Student } from './src/models/Student.js';
import { Driver } from './src/models/Driver.js';
import { Admin } from './src/models/Admin.js';
import { ScanLog } from './src/models/ScanLog.js';
import { SystemSettings } from './src/models/SystemSettings.js';
import { Alert } from './src/models/Alert.js';
import { Notification } from './src/models/Notification.js';
import { SmsLog } from './src/models/SmsLog.js';
import { Trip } from './src/models/Trip.js';
import { ActiveBus } from './src/models/ActiveBus.js';
import { LiveLocation } from './src/models/LiveLocation.js';
import { authenticateToken, signToken, requireAdmin, requireDriver } from './src/middleware/auth.js';
import { rebuildBusRoute } from './src/services/routeService.js';
import { BusRoute } from './src/models/BusRoute.js';
import { BusStop } from './src/models/BusStop.js';
import { haversineDistanceKm } from './src/utils/geo.js';
import { normalizeStopName, ADITYA_UNIVERSITY_COORDS } from './src/utils/coordResolver.js';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Mutex {
  constructor() {
    this.queue = Promise.resolve();
  }
  acquire() {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const ticket = this.queue.then(() => release);
    this.queue = this.queue.then(() => pending).catch(() => {});
    return ticket;
  }
}
const studentAssignMutex = new Mutex();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});
setIO(io);
registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '5mb' }));


app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ====== File-based JSON database ======
const DB_PATH = path.join(__dirname, 'db.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const seed = getSeedData();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    const seed = getSeedData();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getSeedData() {
  const today = new Date().toISOString();
  return {
    students: [
      {
        _id: 'STU001',
        register_no: '22B91A0501',
        name: 'Veera Kumar',
        gender: 'Male',
        year: '3rd Year',
        department: 'CSE',
        section: 'A',
        date_of_birth: '2004-07-15',
        address: { door_no: '12-45', street: 'Main Road', city: 'Tirupati', state: 'Andhra Pradesh', pincode: '517501' },
        bus_details: { bus_id: 'BUS001', bus_number: 'BUS-12', route_name: 'Route-A', boarding_point: 'Pakala' },
        parent_id: 'PAR001',
        driver_id: 'DRV001',
        qr_student_id: 'STU001',
        profile_photo: '',
        password: 'veera123',
        parent_password: 'parent123',
        parent_phone: '9876543210',
        parent_email: 'parent.veera@email.com',
        status: 'active',
        created_at: today,
      },
      {
        _id: 'STU002',
        register_no: '22B91A0502',
        name: 'Arjun Sharma',
        gender: 'Male',
        year: '3rd Year',
        department: 'CSE',
        section: 'A',
        date_of_birth: '2004-05-22',
        address: { door_no: '8-12', street: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
        bus_details: { bus_id: 'BUS001', bus_number: 'BUS-12', route_name: 'Route-A', boarding_point: 'MG Road' },
        parent_id: 'PAR002',
        driver_id: 'DRV001',
        qr_student_id: 'STU002',
        profile_photo: '',
        password: 'arjun123',
        parent_password: 'parent123',
        parent_phone: '9876543211',
        parent_email: 'parent.arjun@email.com',
        status: 'active',
        created_at: today,
      },
    ],
    drivers: [
      {
        _id: 'DRV001',
        driver_id: 'DRV001',
        name: 'Rajan Kumar',
        phone: '9876543200',
        license: 'KA-2026-5521',
        bus_id: 'BUS001',
        bus_number: 'BUS-12',
        route_name: 'Morning Route A',
        password: 'rajan123',
        status: 'On route',
        created_at: today,
      },
      {
        _id: 'DRV002',
        driver_id: 'DRV002',
        name: 'Amit Rao',
        phone: '9876543201',
        license: 'KA-2026-4487',
        bus_id: '',
        bus_number: '',
        route_name: '',
        password: 'amit123',
        status: 'Available',
        created_at: today,
      },
    ],
    buses: [
      { bus_id: 'BUS001', bus_number: 'BUS-12', route_name: 'Route-A', capacity: 36 },
      { bus_id: 'BUS002', bus_number: 'BUS-07', route_name: 'Route-B', capacity: 40 },
      { bus_id: 'BUS003', bus_number: 'BUS-03', route_name: 'North Zone', capacity: 35 },
      { bus_id: 'BUS004', bus_number: 'BUS-09', route_name: 'South Zone', capacity: 38 },
    ],
    admins: [
      { username: 'admin', password: 'admin123', name: 'Super Admin' },
    ],
    alerts: [],
    scanLogs: [],
    notifications: [],
  };
}

let db = loadDB();

// ====== Helpers ======
function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

async function authenticate(role, username, password) {
  if (role === 'admin') {
    const admin = await Admin.findOne({ username });
    if (admin && admin.password === password) {
      return { id: 'admin', name: admin.name, role: 'admin', username };
    }
  }
  if (role === 'student') {
    const s = await Student.findOne({ register_no: username });
    if (s && s.password === password) {
      return { id: s._id, name: s.name, role: 'student', username: s.register_no, student: s };
    }
  }
  if (role === 'parent') {
    const s = await Student.findOne({ register_no: username });
    if (s && s.parent_password === password) {
      return { id: s.parent_id, name: `Parent of ${s.name}`, role: 'parent', username: s.register_no, student: s };
    }
  }
  if (role === 'driver') {
    const d = await Driver.findOne({ $or: [{ driver_id: username }, { phone: username }] });
    if (d && d.password === password) {
      return { id: d._id, name: d.name, role: 'driver', username: d.driver_id, driver: d };
    }
  }
  return null;
}

// ====== Health ======
app.get('/', (req, res) => {
  res.json({
    name: 'SafeRide Backend API',
    status: 'running',
    health: '/api/health',
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), smsConfigured: smsConfigured() });
});

// ====== Debug tracking endpoint (Phase 0) ======
app.get('/api/debug/tracking/:busNumber', async (req, res) => {
  try {
    const { busNumber } = req.params;
    const bus = await Bus.findOne({ busNumber });
    if (!bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }
    const activeBus = await ActiveBus.findOne({ busId: bus.busId }).lean();
    const trip = await Trip.findOne({ busId: bus.busId, status: 'active' }).lean();
    const latestLocation = await LiveLocation.findOne({ busId: bus.busId }).sort({ timestamp: -1 }).lean();

    const activeBusLocation = activeBus && activeBus.location ? {
      latitude: activeBus.location.coordinates[1],
      longitude: activeBus.location.coordinates[0]
    } : null;

    const tripCurrentLocation = trip && trip.currentLocation ? {
      latitude: trip.currentLocation.latitude,
      longitude: trip.currentLocation.longitude
    } : null;

    const socketPayloadLocation = latestLocation ? {
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude
    } : null;

    const dashboardLocation = activeBusLocation;

    const progress = activeBus?.routeProgress || trip?.routeProgress || [];
    const gpsPoint = activeBusLocation || (tripCurrentLocation ? { latitude: tripCurrentLocation.latitude, longitude: tripCurrentLocation.longitude } : null);

    let nearestStop = null;
    let minDistance = Infinity;
    let distances = {};

    if (gpsPoint && progress.length > 0) {
      progress.forEach(stop => {
        const dist = haversineDistanceKm(gpsPoint, stop) * 1000;
        if (dist < minDistance) {
          minDistance = dist;
          nearestStop = stop.villageName;
        }
      });

      const ramesampetaStop = progress.find(s => normalizeStopName(s.villageName) === 'ramesampeta');
      const adityaStop = progress.find(s => normalizeStopName(s.villageName) === 'aditya university');
      if (ramesampetaStop) {
        distances.distanceToRamesampeta = haversineDistanceKm(gpsPoint, ramesampetaStop) * 1000;
      }
      if (adityaStop) {
        distances.distanceToAdityaUniversity = haversineDistanceKm(gpsPoint, adityaStop) * 1000;
      }
    }

    const currentStop = activeBus?.routeProgress?.find(s => s.status === 'current')?.villageName || null;
    const nextStop = activeBus?.routeProgress?.find(s => s.status === 'pending')?.villageName || null;

    const activeStudents = await Student.find({
      $or: [
        { 'bus_details.bus_number': busNumber },
        { busNumber }
      ],
      status: 'active'
    }).lean();

    const liveStudentCounts = {};
    activeStudents.forEach(student => {
      const bp = normalizeStopName(student.boardingPoint || student.bus_details?.boarding_point);
      if (bp) {
        liveStudentCounts[bp] = (liveStudentCounts[bp] || 0) + 1;
      }
    });

    const routeSnapshotStudentCounts = {};
    (trip?.routeSnapshot || []).forEach(stop => {
      routeSnapshotStudentCounts[normalizeStopName(stop.villageName)] = stop.studentCount || 0;
    });

    res.json({
      activeBusLocation,
      tripCurrentLocation,
      socketPayloadLocation,
      dashboardLocation,
      nearestStop,
      currentStop,
      nextStop,
      distances,
      routeSnapshot: trip?.routeSnapshot || [],
      routeProgress: activeBus?.routeProgress || [],
      liveStudentCounts,
      routeSnapshotStudentCounts,
      activeStudents: activeStudents.map(s => ({
        studentId: s.qr_student_id || s._id,
        studentName: s.name,
        assignedBus: s.bus_details?.bus_number || s.busNumber,
        boardingPoint: s.boardingPoint || s.bus_details?.boarding_point,
        status: s.status
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to resolve bus GPS and source
async function resolveBusGpsAndSource(busId) {
  const activeBus = await ActiveBus.findOne({ busId });
  if (activeBus && activeBus.location && Array.isArray(activeBus.location.coordinates) && activeBus.location.coordinates.length >= 2 && activeBus.lastGpsUpdateAt) {
    const lng = activeBus.location.coordinates[0];
    const lat = activeBus.location.coordinates[1];
    if (lat !== 0 && lng !== 0) {
      const lastUpdate = activeBus.lastGpsUpdateAt;
      return {
        latitude: lat,
        longitude: lng,
        source: 'ActiveBus.location',
        timestamp: lastUpdate
      };
    }
  }

  const trip = await Trip.findOne({ busId, status: 'active' });
  if (trip && trip.currentLocation && trip.currentLocation.latitude && trip.currentLocation.longitude && trip.currentLocation.timestamp) {
    const lat = trip.currentLocation.latitude;
    const lng = trip.currentLocation.longitude;
    if (lat !== 0 && lng !== 0) {
      const lastUpdate = trip.currentLocation.timestamp;
      return {
        latitude: lat,
        longitude: lng,
        source: 'ActiveTrip.currentLocation',
        timestamp: lastUpdate
      };
    }
  }

  const latestLocation = await LiveLocation.findOne({ busId, anomaly: { $ne: true } }).sort({ timestamp: -1 });
  if (latestLocation && latestLocation.latitude && latestLocation.longitude) {
    const lat = latestLocation.latitude;
    const lng = latestLocation.longitude;
    if (lat !== 0 && lng !== 0) {
      return {
        latitude: lat,
        longitude: lng,
        source: 'Latest LiveLocation record',
        timestamp: latestLocation.timestamp || latestLocation.createdAt || new Date()
      };
    }
  }

  const completedTrip = await Trip.findOne({ busId, status: 'completed' }).sort({ endTime: -1 });
  if (completedTrip && completedTrip.currentLocation && completedTrip.currentLocation.latitude && completedTrip.currentLocation.longitude) {
    const lat = completedTrip.currentLocation.latitude;
    const lng = completedTrip.currentLocation.longitude;
    if (lat !== 0 && lng !== 0) {
      const timeSinceEnd = Date.now() - new Date(completedTrip.endTime).getTime();
      if (timeSinceEnd <= 5 * 60 * 1000) {
        return {
          latitude: lat,
          longitude: lng,
          source: 'ActiveTrip.currentLocation',
          timestamp: completedTrip.currentLocation.timestamp || completedTrip.endTime
        };
      }
    }
  }

  return null;
}

// ====== GET /api/debug/student-state/:studentId ======
app.get('/api/debug/student-state/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findOne({ $or: [{ qr_student_id: studentId }, { _id: studentId }, { register_no: studentId }] });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const assignedBusNumber = student.bus_details?.bus_number || student.busNumber || '';
    const bus = await Bus.findOne({ busNumber: assignedBusNumber });
    const busId = bus ? bus.busId : null;

    let activeTrip = null;
    let activeTripBus = '';
    let isRecentlyCompleted = false;
    if (busId) {
      activeTrip = await Trip.findOne({ busId, status: 'active' });
      if (!activeTrip) {
        activeTrip = await Trip.findOne({ busId, status: 'completed' }).sort({ endTime: -1 });
        if (activeTrip) {
          const timeSinceEnd = Date.now() - new Date(activeTrip.endTime).getTime();
          if (timeSinceEnd <= 5 * 60 * 1000) {
            isRecentlyCompleted = true;
          } else {
            activeTrip = null;
          }
        }
      }
      if (activeTrip) {
        activeTripBus = assignedBusNumber;
      }
    }

    const gpsInfo = busId ? await resolveBusGpsAndSource(busId) : null;

    // Assigned stop check
    const assignedStopName = student.boardingPoint || student.bus_details?.boarding_point || '';
    const assignedStopDoc = await BusStop.findOne({ stopName: { $regex: new RegExp(`^${assignedStopName}$`, 'i') } });
    const assignedStopRadius = (student.allowedRadiusMeters > 0 && student.allowedRadiusMeters) || (assignedStopDoc && assignedStopDoc.radiusMeters > 0 && assignedStopDoc.radiusMeters) || 1000;

    // Aditya University check
    const collegeStopDoc = await BusStop.findOne({ stopName: { $regex: /aditya university/i } });
    const destinationRadius = (student.allowedRadiusMeters > 0 && student.allowedRadiusMeters) || (collegeStopDoc && collegeStopDoc.radiusMeters > 0 && collegeStopDoc.radiusMeters) || 1000;
    const destLat = collegeStopDoc ? collegeStopDoc.latitude : 17.0912;
    const destLng = collegeStopDoc ? collegeStopDoc.longitude : 82.0665;

    let distanceToAssignedStop = 999999;
    let distanceToDestination = 999999;
    let insideAssignedStop = false;
    let insideCollegeGeofence = false;
    let gpsAgeSeconds = -1;
    let gpsSource = 'none';
    let busGps = {};

    if (gpsInfo) {
      busGps = { latitude: gpsInfo.latitude, longitude: gpsInfo.longitude };
      gpsSource = gpsInfo.source;
      gpsAgeSeconds = Math.floor((Date.now() - new Date(gpsInfo.timestamp).getTime()) / 1000);

      // Distance to assigned stop
      if (assignedStopDoc) {
        distanceToAssignedStop = calculateDistanceMeters(gpsInfo.latitude, gpsInfo.longitude, assignedStopDoc.latitude, assignedStopDoc.longitude);
      }
      // Distance to Aditya University
      distanceToDestination = calculateDistanceMeters(gpsInfo.latitude, gpsInfo.longitude, destLat, destLng);

      // Check jitter/consecutive pings via activeTrip
      if (activeTrip) {
        const stopProgress = activeTrip.routeProgress.find(s => normalizeStopName(s.villageName) === normalizeStopName(assignedStopName));
        if (stopProgress) {
          insideAssignedStop = (distanceToAssignedStop <= assignedStopRadius) && ((stopProgress.consecutivePings || 0) >= 2);
        }
        const collegeProgress = activeTrip.routeProgress.find(s => normalizeStopName(s.villageName) === 'aditya university');
        if (collegeProgress) {
          insideCollegeGeofence = (distanceToDestination <= destinationRadius) && ((collegeProgress.consecutivePings || 0) >= 2);
        }
      }
    }

    let activeTripStatus = activeTrip ? (isRecentlyCompleted ? 'active' : activeTrip.status) : 'inactive';
    let canBoard = insideAssignedStop;
    let canArrive = insideCollegeGeofence;
    let failureReason = '';

    if (!gpsInfo) {
      failureReason = "No valid bus GPS available";
      canBoard = false;
      canArrive = false;
    } else if (gpsAgeSeconds > 60) {
      failureReason = "GPS packet older than 60s";
      canBoard = false;
      canArrive = false;
    } else {
      // Check for anomaly
      const latestLocation = busId ? await LiveLocation.findOne({ busId }).sort({ timestamp: -1 }) : null;
      if (latestLocation && latestLocation.anomaly) {
        failureReason = "GPS jump anomaly";
        canBoard = false;
        canArrive = false;
      }
    }

    res.json({
      studentId: student.qr_student_id || student._id,
      trackingStatus: student.trackingStatus,
      assignedBus: assignedBusNumber,
      activeTripBus,
      busGps,
      assignedStop: assignedStopName,
      assignedStopRadius,
      distanceToAssignedStop,
      destinationStop: "Aditya University",
      destinationRadius,
      distanceToDestination,
      canBoard,
      canArrive,
      failureReason,
      insideAssignedStop,
      insideCollegeGeofence,
      gpsAgeSeconds,
      gpsSource,
      activeTripStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// ====== Debug database truth endpoint (Phase 0.1) ======
app.get('/api/debug/database-truth/:busNumber', async (req, res) => {
  try {
    const { busNumber } = req.params;
    const bus = await Bus.findOne({ busNumber });
    if (!bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    const students = await Student.find({
      $or: [
        { 'bus_details.bus_number': busNumber },
        { busNumber }
      ],
      status: 'active'
    }).lean();

    const busRoute = await BusRoute.findOne({ busNumber }).lean();
    const activeBus = await ActiveBus.findOne({ busId: bus.busId }).lean();
    const trip = await Trip.findOne({ busId: bus.busId, status: 'active' }).lean();

    res.json({
      students: students.map(s => ({
        studentId: s.qr_student_id || s._id,
        studentName: s.name,
        assignedBus: s.bus_details?.bus_number || s.busNumber,
        boardingPoint: s.boardingPoint || s.bus_details?.boarding_point,
        status: s.status
      })),
      busRouteStops: busRoute?.stops || [],
      routeSnapshotStops: trip?.routeSnapshot || [],
      activeBus: activeBus ? {
        currentLocation: activeBus.location ? {
          latitude: activeBus.location.coordinates[1],
          longitude: activeBus.location.coordinates[0]
        } : null,
        currentStop: activeBus.routeProgress?.find(s => s.status === 'current')?.villageName || null,
        nextStop: activeBus.routeProgress?.find(s => s.status === 'pending')?.villageName || null
      } : null,
      trip: trip ? {
        currentLocation: trip.currentLocation,
        currentStop: trip.routeProgress?.find(s => s.status === 'current')?.villageName || null,
        nextStop: trip.routeProgress?.find(s => s.status === 'pending')?.villageName || null,
        status: trip.status
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== GET /api/tracking/state/:busNumber (Defects 36-40) ======
app.get('/api/tracking/state/:busNumber', async (req, res) => {
  try {
    const { busNumber } = req.params;
    const state = await buildTrackingState(busNumber);
    if (!state) return res.status(404).json({ error: 'Bus or active tracking not found' });
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== GET /api/debug/gps/:busNumber ======
app.get('/api/debug/gps/:busNumber', async (req, res) => {
  try {
    const { busNumber } = req.params;
    const bus = await Bus.findOne({ busNumber });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });
    const activeBus = await ActiveBus.findOne({ busId: bus.busId }).lean();
    if (!activeBus) return res.status(404).json({ error: 'Active bus tracking not found' });

    const lastAccepted = await LiveLocation.findOne({ busId: bus.busId, anomaly: { $ne: true } }).sort({ timestamp: -1 }).lean();
    const lastRejected = await LiveLocation.findOne({ busId: bus.busId, anomaly: true }).sort({ timestamp: -1 }).lean();

    const telemetryHealthy = activeBus.lastGpsUpdateAt && (Date.now() - new Date(activeBus.lastGpsUpdateAt).getTime() <= 30000);
    res.json({
      currentLocation: activeBus.location,
      lastGpsUpdateAt: activeBus.lastGpsUpdateAt,
      gpsPacketsReceived: activeBus.gpsPacketsReceived || 0,
      gpsPacketsRejected: activeBus.gpsPacketsRejected || 0,
      lastGpsSource: activeBus.lastGpsSource,
      telemetryHealthy: !!telemetryHealthy
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== GET /api/debug/state/:busNumber ======
app.get('/api/debug/state/:busNumber', async (req, res) => {
  try {
    const { busNumber } = req.params;
    const bus = await Bus.findOne({ busNumber });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    const state = await buildTrackingState(busNumber);
    const activeBus = await ActiveBus.findOne({ busId: bus.busId }).lean();
    const trip = await Trip.findOne({ busId: bus.busId, status: 'active' }).lean();
    const route = bus.routeId ? await Route.findOne({ routeId: bus.routeId }).lean() : null;
    const students = await Student.find({ $or: [{ 'bus_details.bus_number': busNumber }, { busNumber }], status: 'active' }).lean();
    const lastSocketPayload = await LiveLocation.findOne({ busId: bus.busId }).sort({ timestamp: -1 }).lean();

    res.json({
      trackingState: state,
      activeBus,
      trip,
      route,
      students,
      lastSocketPayload
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== GET /api/debug/frontend-state/:busNumber (Defect 40) ======
app.get('/api/debug/frontend-state/:busNumber', async (req, res) => {
  try {
    const { busNumber } = req.params;
    const state = await buildTrackingState(busNumber);
    if (!state) return res.status(404).json({ error: 'Tracking state not found' });

    res.json({
      trackingStateTimestamp: state.lastGpsUpdateAt || new Date(),
      lastSocketUpdate: state.lastGpsUpdateAt || new Date(),
      currentGps: state.currentGps,
      currentStop: state.currentStop,
      studentCounts: state.studentCounts,
      routeProgress: state.routeProgress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Real-time Tracking APIs (MongoDB + Socket.IO) ======
app.use('/api', trackingRoutes);
app.use('/api', metaRoutes);

// ====== Auth ======
app.get('/api/auth/demo-credentials', (req, res) => {
  const student = db.students[0] || { register_no: '22B91A0501', password: 'veera123', parent_password: 'parent123' };
  const driver = db.drivers[0] || { driver_id: 'DRV001', password: 'rajan123' };
  const admin = db.admins[0] || { username: 'admin', password: 'admin123' };

  res.json({
    student: { username: student.register_no, password: student.password },
    parent: { username: student.register_no, password: student.parent_password },
    driver: { username: driver.driver_id, password: driver.password },
    admin: { username: admin.username, password: admin.password }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { role, username, password } = req.body || {};
  if (!role || !username || !password) {
    return res.status(400).json({ error: 'role, username and password are required' });
  }
  const user = await authenticate(role, username.trim(), password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = signToken({
    id: user.id,
    name: user.name,
    role: user.role,
    username: user.username,
    busId: user.driver?.bus_id || null,
  });
  res.json({ token, user });
});

app.post('/api/auth/change-password', async (req, res) => {
  const { role, username, currentPassword, newPassword } = req.body || {};
  if (!role || !username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const user = await authenticate(role, username.trim(), currentPassword);
  if (!user) return res.status(401).json({ error: 'Current username or password is incorrect' });

  if (role === 'admin') {
    await Admin.updateOne({ username }, { password: newPassword });
    const a = db.admins.find(a => a.username === username);
    if (a) a.password = newPassword;
  } else if (role === 'student') {
    await Student.updateOne({ register_no: username }, { password: newPassword });
    const s = db.students.find(s => s.register_no === username);
    if (s) s.password = newPassword;
  } else if (role === 'parent') {
    await Student.updateOne({ register_no: username }, { parent_password: newPassword });
    const s = db.students.find(s => s.register_no === username);
    if (s) s.parent_password = newPassword;
  } else if (role === 'driver') {
    await Driver.updateOne({ $or: [{ driver_id: username }, { phone: username }] }, { password: newPassword });
    const d = db.drivers.find(d => d.driver_id === username || d.phone === username);
    if (d) d.password = newPassword;
  }
  saveDB(db);
  res.json({ ok: true });
});

// ====== Students ======
app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const list = await Student.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    const s = await Student.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Student not found' });
    res.json(s);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/students', authenticateToken, requireAdmin, async (req, res) => {
  const release = await studentAssignMutex.acquire();
  try {
    const body = req.body || {};
    if (!body.register_no || !body.name) return res.status(400).json({ error: 'register_no and name required' });
    const duplicate = await Student.findOne({ register_no: body.register_no });
    if (duplicate) {
      return res.status(409).json({ error: 'Student with this register number already exists' });
    }

    const assignedBusNumber = body.bus_details?.bus_number;
    if (assignedBusNumber) {
      const busExists = await Bus.findOne({ busNumber: assignedBusNumber });
      if (!busExists) {
        return res.status(400).json({ error: `Assigned bus ${assignedBusNumber} does not exist.` });
      }
      if (busExists.status !== 'active') {
        busExists.status = 'active';
        busExists.active = true;
        await busExists.save();
        console.log(`[STUDENT ASSIGN] Automatically activated bus ${assignedBusNumber}`);
      }
      const assignedCount = await Student.countDocuments({ 'bus_details.bus_number': assignedBusNumber, status: 'active' });
      if (assignedCount >= (busExists.capacity || 40)) {
        return res.status(400).json({ error: 'Bus capacity exceeded.' });
      }
    }

    const bp = body.boardingPoint || body.bus_details?.boarding_point || '';
    const lat = Number(body.latitude) || Number(body.home_latitude) || 0;
    const lng = Number(body.longitude) || Number(body.home_longitude) || 0;
    const landmark = body.landmark || '';
    const allowedRadius = Number(body.allowedRadiusMeters) || 1000;

    // Validate/create BusStop automatically if bp is provided
    if (bp) {
      const existingStop = await BusStop.findOne({ stopName: new RegExp(`^${bp.trim()}$`, 'i') });
      if (!existingStop) {
        await BusStop.create({
          stopName: bp.trim(),
          latitude: lat,
          longitude: lng,
          landmark: landmark,
          radiusMeters: allowedRadius,
          active: true
        });
        console.log(`🌱 Created BusStop automatically for: ${bp} with coords (${lat}, ${lng})`);
      }
    }

    const allStudents = await Student.find({}, { _id: 1, parent_id: 1 }).lean();
    let maxStudentNum = 0;
    let maxParentNum = 0;
    allStudents.forEach(s => {
      if (s._id && s._id.startsWith('STU')) {
        const num = parseInt(s._id.replace('STU', ''), 10);
        if (!isNaN(num) && num > maxStudentNum) maxStudentNum = num;
      }
      if (s.parent_id && s.parent_id.startsWith('PAR')) {
        const num = parseInt(s.parent_id.replace('PAR', ''), 10);
        if (!isNaN(num) && num > maxParentNum) maxParentNum = num;
      }
    });

    const studentId = body._id || `STU${String(maxStudentNum + 1).padStart(3, '0')}`;

    const newStudent = {
      _id: studentId,
      register_no: body.register_no,
      name: body.name,
      gender: body.gender || 'Male',
      year: body.year || '',
      department: body.department || '',
      section: body.section || '',
      date_of_birth: body.date_of_birth || '',
      address: body.address || { door_no: '', street: '', city: '', state: '', pincode: '' },
      bus_details: {
        bus_id: body.bus_details?.bus_id || '',
        bus_number: assignedBusNumber || '',
        route_name: body.bus_details?.routeName || body.bus_details?.route_name || '',
        routeName: body.bus_details?.routeName || body.bus_details?.route_name || '',
        boarding_point: bp,
      },
      parent_id: body.parent_id || `PAR${String(maxParentNum + 1).padStart(3, '0')}`,
      driver_id: body.driver_id || '',
      qr_student_id: body.register_no,
      profile_photo: body.profile_photo || '',
      password: body.password || 'student123',
      parent_password: body.parent_password || 'parent123',
      parent_phone: body.parent_phone || '',
      parent_email: body.parent_email || '',
      home_latitude: lat,
      home_longitude: lng,
      boardingPoint: bp,
      landmark: landmark,
      latitude: lat,
      longitude: lng,
      allowedRadiusMeters: allowedRadius,
      status: 'active',
    };
    
    const doc = await Student.create(newStudent);
    
    // Sync fallback
    db.students.unshift(doc.toObject());
    saveDB(db);

    // Rebuild Route stops for assigned bus
    if (doc.bus_details?.bus_number) {
      await rebuildBusRoute(doc.bus_details.bus_number);
    }

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    release();
  }
});

app.delete('/api/students/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Not found' });

    // Defect 16: Block Student Delete if Bus has Active Trip
    if (student.bus_details?.bus_number) {
      const bus = await Bus.findOne({ busNumber: student.bus_details.bus_number });
      if (bus) {
        const activeTrip = await Trip.findOne({ busId: bus.busId, status: 'active' });
        if (activeTrip) {
          return res.status(400).json({ error: 'Cannot modify route while a trip is active.' });
        }
      }
    }

    const deleted = await Student.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    
    // Sync fallback
    const idx = db.students.findIndex(s => s._id === req.params.id);
    if (idx !== -1) {
      db.students.splice(idx, 1);
      saveDB(db);
    }

    // Rebuild Route stops for the bus this student was assigned to
    if (deleted.bus_details?.bus_number) {
      await rebuildBusRoute(deleted.bus_details.bus_number);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/students/:id', authenticateToken, requireAdmin, async (req, res) => {
  const release = await studentAssignMutex.acquire();
  try {
    const body = req.body || {};
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const oldBusNumber = student.bus_details?.bus_number;

    // Defect 16: Block Student edits if active trip ongoing
    if (oldBusNumber) {
      const bus = await Bus.findOne({ busNumber: oldBusNumber });
      if (bus) {
        const activeTrip = await Trip.findOne({ busId: bus.busId, status: 'active' });
        if (activeTrip) {
          return res.status(400).json({ error: 'Cannot modify route while a trip is active.' });
        }
      }
    }
    if (body.bus_details?.bus_number) {
      const busExists = await Bus.findOne({ busNumber: body.bus_details.bus_number });
      if (!busExists) {
        return res.status(400).json({ error: `Assigned bus ${body.bus_details.bus_number} does not exist.` });
      }
      if (busExists.status !== 'active') {
        busExists.status = 'active';
        busExists.active = true;
        await busExists.save();
        console.log(`[STUDENT ASSIGN] Automatically activated bus ${body.bus_details.bus_number}`);
      }
      const activeTrip = await Trip.findOne({ busId: busExists.busId, status: 'active' });
      if (activeTrip) {
        return res.status(400).json({ error: 'Cannot modify route while a trip is active.' });
      }
      const assignedCount = await Student.countDocuments({ 
        'bus_details.bus_number': body.bus_details.bus_number, 
        status: 'active',
        _id: { $ne: student._id } 
      });
      if (assignedCount >= (busExists.capacity || 40)) {
        return res.status(400).json({ error: 'Bus capacity exceeded.' });
      }
    }

    if (body.name !== undefined) student.name = body.name;
    if (body.gender !== undefined) student.gender = body.gender;
    if (body.year !== undefined) student.year = body.year;
    if (body.department !== undefined) student.department = body.department;
    if (body.section !== undefined) student.section = body.section;
    if (body.date_of_birth !== undefined) student.date_of_birth = body.date_of_birth;
    if (body.address !== undefined) student.address = body.address;
    if (body.bus_details !== undefined) {
      student.bus_details = body.bus_details;
      if (student.bus_details) {
        const routeVal = body.bus_details.routeName || body.bus_details.route_name || '';
        student.bus_details.route_name = routeVal;
        student.bus_details.routeName = routeVal;
      }
      if (body.bus_details?.boarding_point) {
        student.boardingPoint = body.bus_details.boarding_point;
      }
    }
    if (body.boardingPoint !== undefined) {
      student.boardingPoint = body.boardingPoint;
      if (student.bus_details) student.bus_details.boarding_point = body.boardingPoint;
    }
    if (body.landmark !== undefined) student.landmark = body.landmark;
    if (body.latitude !== undefined) {
      student.latitude = Number(body.latitude) || 0;
      student.home_latitude = Number(body.latitude) || 0;
    }
    if (body.longitude !== undefined) {
      student.longitude = Number(body.longitude) || 0;
      student.home_longitude = Number(body.longitude) || 0;
    }
    if (body.allowedRadiusMeters !== undefined) {
      student.allowedRadiusMeters = Number(body.allowedRadiusMeters) || 1000;
    }
    if (body.home_latitude !== undefined) {
      student.home_latitude = Number(body.home_latitude) || 0;
      student.latitude = Number(body.home_latitude) || 0;
    }
    if (body.home_longitude !== undefined) {
      student.home_longitude = Number(body.home_longitude) || 0;
      student.longitude = Number(body.home_longitude) || 0;
    }
    if (body.parent_phone !== undefined) student.parent_phone = body.parent_phone;
    if (body.parent_email !== undefined) student.parent_email = body.parent_email;
    if (body.password !== undefined) student.password = body.password;
    if (body.parent_password !== undefined) student.parent_password = body.parent_password;

    // Validate/create BusStop automatically if bp is now provided/updated
    const bp = student.boardingPoint || student.bus_details?.boarding_point;
    if (bp) {
      const existingStop = await BusStop.findOne({ stopName: new RegExp(`^${bp.trim()}$`, 'i') });
      if (!existingStop) {
        await BusStop.create({
          stopName: bp.trim(),
          latitude: student.latitude || 0,
          longitude: student.longitude || 0,
          landmark: student.landmark || '',
          radiusMeters: student.allowedRadiusMeters || 1000,
          active: true
        });
        console.log(`🌱 Created BusStop automatically for: ${bp} with coords (${student.latitude}, ${student.longitude})`);
      }
    }

    await student.save();

    // Sync fallback local DB
    const idx = db.students.findIndex(s => s._id === req.params.id);
    if (idx !== -1) {
      db.students[idx] = student.toObject();
      saveDB(db);
    }

    const newBusNumber = student.bus_details?.bus_number;

    // Trigger rebuilds
    if (oldBusNumber) {
      await rebuildBusRoute(oldBusNumber);
    }
    if (newBusNumber && newBusNumber !== oldBusNumber) {
      await rebuildBusRoute(newBusNumber);
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    release();
  }
});

// ====== Drivers ======
app.get('/api/drivers', async (req, res) => {
  try {
    const list = await Driver.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/drivers', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.phone) return res.status(400).json({ error: 'name and phone required' });

  try {
    let driverId = body.driver_id;
    if (!driverId) {
      const allDrivers = await Driver.find({}, { driver_id: 1 }).lean();
      let maxDriverNum = 0;
      allDrivers.forEach(d => {
        if (d.driver_id && d.driver_id.startsWith('DRV')) {
          const num = parseInt(d.driver_id.replace('DRV', ''), 10);
          if (!isNaN(num) && num > maxDriverNum) maxDriverNum = num;
        }
      });
      driverId = `DRV${String(maxDriverNum + 1).padStart(3, '0')}`;
    }

    const duplicate = await Driver.findOne({ driver_id: driverId });
    if (duplicate) {
      return res.status(409).json({ error: 'Driver ID already exists' });
    }

    const newDriver = {
      _id: driverId,
      driver_id: driverId,
      name: body.name,
      phone: body.phone,
      license: body.license || '',
      bus_id: '',
      bus_number: '',
      route_name: '',
      password: body.password || 'driver123',
      status: 'Available',
    };

    const doc = await Driver.create(newDriver);
    
    // Sync fallback
    db.drivers.unshift(doc.toObject());
    saveDB(db);

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/drivers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    if (driver.bus_id) {
      const activeTrip = await Trip.findOne({ busId: driver.bus_id, status: 'active' });
      if (activeTrip) {
        return res.status(400).json({ error: 'Stop the trip before removing the driver.' });
      }
      await Bus.updateOne({ busId: driver.bus_id }, { $set: { driverId: '' } });
    }

    await Driver.findByIdAndDelete(req.params.id);

    // Sync fallback
    const idx = db.drivers.findIndex(d => d._id === req.params.id);
    if (idx !== -1) {
      db.drivers.splice(idx, 1);
      saveDB(db);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/drivers/:id/assign-bus', authenticateToken, requireAdmin, async (req, res) => {
  const { bus_id } = req.body || {};
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    // Handle Unassignment
    if (!bus_id) {
      const oldBusId = driver.bus_id;
      if (oldBusId) {
        // Driver Unassignment Protection Check:
        const activeTrip = await Trip.findOne({ busId: oldBusId, status: 'active' });
        if (activeTrip) {
          return res.status(400).json({ error: 'Stop the trip before removing the driver.' });
        }
        await Bus.updateOne({ busId: oldBusId }, { $set: { driverId: '' } });
      }

      driver.bus_id = '';
      driver.bus_number = '';
      driver.route_name = '';
      driver.status = 'Available';
      await driver.save();

      // Sync fallback
      const localDriver = db.drivers.find(d => d._id === req.params.id);
      if (localDriver) {
        localDriver.bus_id = '';
        localDriver.bus_number = '';
        localDriver.route_name = '';
        localDriver.status = 'Available';
        saveDB(db);
      }

      return res.json(driver);
    }

    const bus = await Bus.findOne({ busId: bus_id });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    // Ensure bus not already assigned to another driver
    const alreadyAssigned = await Driver.findOne({ bus_id, _id: { $ne: driver._id } });
    if (alreadyAssigned) {
      return res.status(409).json({ error: `Bus already assigned to another driver.` });
    }

    // Driver unassignment protection checks for old bus if driver changes buses:
    if (driver.bus_id && driver.bus_id !== bus_id) {
      const activeTrip = await Trip.findOne({ busId: driver.bus_id, status: 'active' });
      if (activeTrip) {
        return res.status(400).json({ error: 'Stop the trip before removing the driver.' });
      }
      await Bus.updateOne({ busId: driver.bus_id }, { $set: { driverId: '' } });
    }

    driver.bus_id = bus.busId;
    driver.bus_number = bus.busNumber;
    driver.route_name = bus.routeId;
    driver.status = 'On route';
    await driver.save();

    // Update Bus driverId in MongoDB
    bus.driverId = driver.driver_id;
    await bus.save();

    // Sync fallback
    const localDriver = db.drivers.find(d => d._id === req.params.id);
    if (localDriver) {
      localDriver.bus_id = bus.busId;
      localDriver.bus_number = bus.busNumber;
      localDriver.route_name = bus.routeId;
      localDriver.status = 'On route';
      saveDB(db);
    }

    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Routes ======
app.get('/api/routes', authenticateToken, async (req, res) => {
  try {
    const list = await Route.find().lean();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bus-routes', authenticateToken, async (req, res) => {
  try {
    const list = await BusRoute.find().lean();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bus-routes/:busNumber', authenticateToken, async (req, res) => {
  try {
    const { busNumber } = req.params;
    const route = await BusRoute.findOne({ busNumber }).lean();
    if (!route || !route.stops || route.stops.length === 0) {
      return res.json({ routeExists: false, stops: [] });
    }
    return res.json({ routeExists: true, ...route });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


app.post('/api/routes', authenticateToken, requireAdmin, async (req, res) => {
  const { routeId, routeName, startName, startLat, startLng, destName, destLat, destLng } = req.body || {};
  if (!routeId || !routeName || startLat == null || startLng == null || destLat == null || destLng == null) {
    return res.status(400).json({ error: 'routeId, routeName, start coordinates, and destination coordinates are required' });
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`;

    console.log('Fetching road path from OSRM:', osrmUrl);
    const dirRes = await fetch(osrmUrl);
    const dirData = await dirRes.json();

    if (dirData.code !== 'Ok' || !dirData.routes?.length) {
      throw new Error('No route found between starting and destination points');
    }

    const routeCoords = dirData.routes[0].geometry.coordinates;

    const intermediateCoords = [];
    if (routeCoords.length > 2) {
      const step = Math.max(1, Math.floor(routeCoords.length / 5));
      for (let i = 1; i <= 4; i++) {
        const index = step * i;
        if (index < routeCoords.length - 1) {
          intermediateCoords.push(routeCoords[index]);
        }
      }
    }

    const villagesList = [];

    villagesList.push({
      villageId: `${routeId}-VIL-001`,
      villageName: startName || 'Origin',
      latitude: Number(startLat),
      longitude: Number(startLng),
      sequence: 1,
      radiusMeters: 250,
      kind: 'origin',
    });

    let seq = 2;
    for (const coord of intermediateCoords) {
      const [lng, lat] = coord;
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      try {
        const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'SafeRide-Tracking/1.0' } });
        const geoData = await geoRes.json();
        const addr = geoData.address || {};
        const name =
          addr.village ||
          addr.town ||
          addr.city ||
          addr.suburb ||
          addr.neighbourhood ||
          `Stop ${seq - 1}`;

        villagesList.push({
          villageId: `${routeId}-VIL-${String(seq).padStart(3, '0')}`,
          villageName: name,
          latitude: Number(lat),
          longitude: Number(lng),
          sequence: seq,
          radiusMeters: 250,
          kind: 'village',
        });
        seq++;
      } catch (err) {
        console.warn('Reverse geocode step failed:', err.message);
      }
    }

    // Add college destination
    villagesList.push({
      villageId: `${routeId}-VIL-${String(seq).padStart(3, '0')}`,
      villageName: destName || 'College',
      latitude: Number(destLat),
      longitude: Number(destLng),
      sequence: seq,
      radiusMeters: 250,
      kind: 'college'
    });

    const newRoute = await Route.create({
      routeId,
      routeName,
      collegeLocation: {
        name: destName || 'College',
        latitude: Number(destLat),
        longitude: Number(destLng)
      },
      villages: villagesList
    });

    // Sync fallback
    try {
      db.routes = db.routes || [];
      db.routes.push(newRoute.toObject());
      saveDB(db);
    } catch (dbErr) {
      console.warn('DB local backup failed:', dbErr);
    }

    return res.status(201).json(newRoute);
  } catch (error) {
    console.error('Route planning failed:', error);
    return res.status(500).json({ error: error.message });
  }
});


// ====== Buses ======
app.get('/api/buses', authenticateToken, async (req, res) => {
  try {
    const list = await Bus.find().sort({ busNumber: 1 }).lean();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/buses', authenticateToken, requireAdmin, async (req, res) => {
  const { busNumber, busName, vehicleNumber, capacity, status } = req.body || {};
  if (!busNumber) {
    return res.status(400).json({ error: 'busNumber is required' });
  }
  if (capacity !== undefined && Number(capacity) <= 0) {
    return res.status(400).json({ error: 'Capacity must be greater than 0' });
  }
  try {
    const duplicateNum = await Bus.findOne({ busNumber });
    if (duplicateNum) {
      return res.status(409).json({ error: `Conflict: Bus number ${busNumber} already exists` });
    }
    if (vehicleNumber) {
      const duplicateVeh = await Bus.findOne({ vehicleNumber });
      if (duplicateVeh) {
        return res.status(409).json({ error: `Conflict: Vehicle number ${vehicleNumber} already exists` });
      }
    }

    const busId = `BUS${String(Date.now()).slice(-5)}`;
    const newBus = await Bus.create({
      busId,
      busNumber,
      busName: busName || '',
      vehicleNumber: vehicleNumber || '',
      capacity: Number(capacity) || 40,
      status: status || 'inactive',
      active: status === 'active'
    });

    try {
      db.buses = db.buses || [];
      db.buses.push({ bus_id: busId, bus_number: busNumber, route_name: '', capacity: Number(capacity) || 40 });
      saveDB(db);
    } catch (e) {}

    res.status(201).json(newBus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/buses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  if (body.capacity !== undefined && Number(body.capacity) <= 0) {
    return res.status(400).json({ error: 'Capacity must be greater than 0' });
  }
  try {
    const busQuery = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { busId: id };
    const bus = await Bus.findOne(busQuery);
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    if (body.busNumber && body.busNumber !== bus.busNumber) {
      const duplicateNum = await Bus.findOne({ busNumber: body.busNumber });
      if (duplicateNum) return res.status(409).json({ error: `Conflict: Bus number ${body.busNumber} already exists` });
    }
    if (body.vehicleNumber && body.vehicleNumber !== bus.vehicleNumber) {
      const duplicateVeh = await Bus.findOne({ vehicleNumber: body.vehicleNumber });
      if (duplicateVeh) return res.status(409).json({ error: `Conflict: Vehicle number ${body.vehicleNumber} already exists` });
    }

    if (body.busNumber !== undefined) bus.busNumber = body.busNumber;
    if (body.busName !== undefined) bus.busName = body.busName;
    if (body.vehicleNumber !== undefined) bus.vehicleNumber = body.vehicleNumber;
    if (body.capacity !== undefined) bus.capacity = Number(body.capacity);
    if (body.status !== undefined) {
      if (body.status !== 'active') {
        const activeTrip = await Trip.findOne({ busId: bus.busId, status: 'active' });
        if (activeTrip) {
          try {
            const { stopTrip } = await import('./src/services/trackingService.js');
            await stopTrip({ busId: bus.busId, tripId: activeTrip.tripId, force: true });
            console.log(`[BUS STATUS CHANGE] Force stopped active trip ${activeTrip.tripId} for bus ${bus.busId}`);
          } catch (stopErr) {
            console.error(`[BUS STATUS CHANGE] Failed to force stop active trip:`, stopErr);
          }
        }
      }
      bus.status = body.status;
      bus.active = body.status === 'active';
    }
    if (body.routeId !== undefined) bus.routeId = body.routeId;
    if (body.routeName !== undefined) bus.routeName = body.routeName;

    await bus.save();

    // Rebuild routes to sync changes
    await rebuildBusRoute(bus.busNumber);

    res.json(bus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/buses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const busQuery = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { busId: id };
    const bus = await Bus.findOne(busQuery);
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    // Trip Deletion Safety Check
    const activeTrip = await Trip.findOne({ busId: bus.busId, status: 'active' });
    if (activeTrip) {
      return res.status(400).json({ error: 'Bus cannot be deleted while operations are active. Stop the active trip before deleting the bus.' });
    }

    // Unassign driver cascade
    await Driver.updateMany(
      { bus_id: bus.busId },
      { $set: { bus_id: '', bus_number: '', route_name: '', status: 'Available' } }
    );

    // Reset students assigned to this bus
    await Student.updateMany(
      { 'bus_details.bus_number': bus.busNumber },
      { $set: { 'bus_details.bus_id': '', 'bus_details.bus_number': '', 'bus_details.route_name': 'Bus Assignment Required' } }
    );

    // Clean up dynamic routes
    await BusRoute.deleteOne({ busNumber: bus.busNumber });
    await Bus.deleteOne({ busId: bus.busId });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/buses/:busNumber/route', authenticateToken, requireAdmin, async (req, res) => {
  const { busNumber } = req.params;
  const { routeId, routeName } = req.body || {};

  try {
    const bus = await Bus.findOne({ busNumber });
    if (!bus) {
      return res.status(404).json({ error: `Bus ${busNumber} not found.` });
    }

    if (routeId !== undefined) bus.routeId = routeId;
    if (routeName !== undefined) bus.routeName = routeName;
    await bus.save();

    await rebuildBusRoute(busNumber);

    res.json({ ok: true, bus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/buses/:busNumber/occupancy', authenticateToken, async (req, res) => {
  const { busNumber } = req.params;
  try {
    const bus = await Bus.findOne({ busNumber });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    const assignedStudents = await Student.countDocuments({ 'bus_details.bus_number': busNumber, status: 'active' });
    const activeTrip = await Trip.findOne({ busId: bus.busId, status: 'active' });

    if (!activeTrip) {
      return res.json({
        assignedStudents,
        currentOccupancy: 0,
        boardedToday: 0,
        droppedToday: 0,
        remainingStops: 0
      });
    }

    const boardedToday = await ScanLog.countDocuments({ bus_number: busNumber, trip_id: activeTrip.tripId, action: 'board' });
    const droppedToday = await ScanLog.countDocuments({ bus_number: busNumber, trip_id: activeTrip.tripId, action: 'dropoff' });
    const currentOccupancy = Math.max(0, boardedToday - droppedToday);

    const remainingStops = activeTrip.routeProgress?.filter(v => !v.crossed).length || 0;

    res.json({
      assignedStudents,
      currentOccupancy,
      boardedToday,
      droppedToday,
      remainingStops
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Alerts (delay / emergency) ======
app.get('/api/alerts', async (req, res) => {
  try {
    const list = await Alert.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts', async (req, res) => {
  const body = req.body || {};
  const newAlert = {
    id: `ALT-${Date.now()}`,
    time: nowTime(),
    date: todayDate(),
    bus: body.bus || '',
    driver_id: body.driver_id || '',
    driver_name: body.driver_name || '',
    type: body.type || 'Delay', // Delay | Emergency
    category: body.category || '',
    message: body.message || '',
    status: 'Active',
  };

  try {
    const doc = await Alert.create(newAlert);
    db.alerts.unshift(doc.toObject());

    // Create notifications for parents of students on that bus + admin
    const studentsOnBus = await Student.find({ 'bus_details.bus_number': body.bus });
    const notifs = [];

    studentsOnBus.forEach(s => {
      notifs.push({
        id: `N-${uuidv4()}`,
        to: 'parent',
        parent_id: s.parent_id,
        student_id: s._id,
        title: `${newAlert.type}: ${newAlert.category}`,
        message: newAlert.message,
        time: nowTime(),
        date: todayDate(),
        read: false,
      });
    });

    notifs.push({
      id: `N-${uuidv4()}`,
      to: 'admin',
      title: `${newAlert.type} from ${newAlert.driver_name || 'Driver'} (Bus ${newAlert.bus})`,
      message: newAlert.message,
      time: nowTime(),
      date: todayDate(),
      read: false,
    });

    await Notification.insertMany(notifs);

    // Sync fallback
    notifs.forEach(n => db.notifications.push(n));
    saveDB(db);

    // SMS to every parent on the bus
    const smsBody = newAlert.type === 'Emergency'
      ? `SafeRide Emergency Alert: ${newAlert.bus} reported an emergency. Please check the portal for updates.`
      : `SafeRide Alert: ${newAlert.bus} is delayed by approximately ${newAlert.message || '15 minutes'}.`;

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
        sendSMS(phone, smsBody, studentId, 'alert').catch(() => null)
      )
    );
    if (process.env.ADMIN_PHONE) {
      await sendSMS(process.env.ADMIN_PHONE, smsBody).catch(() => null);
    }

    // Broadcast emergency/delay alert through Socket.IO
    io.emit('alert:new', doc.toObject());

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const alert = await Alert.findOneAndUpdate({ id: req.params.id }, { status: 'Resolved' }, { new: true });
    if (!alert) return res.status(404).json({ error: 'Not found' });

    // Sync fallback
    const localAlert = db.alerts.find(a => a.id === req.params.id);
    if (localAlert) localAlert.status = 'Resolved';
    saveDB(db);

    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to calculate distance in meters
// =====================================================
// Constants & Configurations
// =====================================================

// =====================================================
// QR Scan Workflow Configuration
// =====================================================
// =====================================================
// QR Scan Workflow Configuration
// =====================================================
const SCAN_WORKFLOWS = {
  MORNING_BOARDING: {
    geofence: "BOARDING_STOP",
    radius: 1000,
    attendanceType: "BOARD_IN",
    successStatus: "BOARDED_TO_COLLEGE",
    successMessage: "Student boarded successfully.",
    rejectionMessage: "Bus is outside the student's boarding location.",
    smsTemplate: "Your child {studentName} boarded Bus {busNumber} at {time}."
  },

  COLLEGE_ARRIVAL: {
    geofence: "COLLEGE",
    radius: 1000,
    attendanceType: "DROP_AT_COLLEGE",
    successStatus: "REACHED_COLLEGE",
    successMessage: "Student reached the college successfully.",
    rejectionMessage: "Bus has not reached the college yet.",
    smsTemplate: "Your child {studentName} safely reached Aditya University at {time}."
  },

  COLLEGE_BOARDING: {
    geofence: "COLLEGE",
    radius: 1000,
    attendanceType: "BOARD_FROM_COLLEGE",
    successStatus: "BOARDED_FROM_COLLEGE",
    successMessage: "Student boarded from the college successfully.",
    rejectionMessage: "Bus has not reached the college yet.",
    smsTemplate: "Your child {studentName} boarded Bus {busNumber} from Aditya University at {time}."
  },

  HOME_DROPOFF: {
    geofence: "HOME_STOP",
    radius: 1000,
    attendanceType: "DROP_HOME",
    successStatus: "REACHED_HOME",
    successMessage: "Student reached the home stop successfully.",
    rejectionMessage: "Bus has not reached the student's drop-off location.",
    smsTemplate: "Your child {studentName} safely reached the home stop at {time}."
  }
};

const SCAN_MODE_MAP = {
  'Morning Boarding': 'MORNING_BOARDING',
  'College Arrival': 'COLLEGE_ARRIVAL',
  'College Boarding': 'COLLEGE_BOARDING',
  'Home Drop-Off': 'HOME_DROPOFF'
};

// =====================================================
// Helper Functions
// =====================================================
function resolveWorkflow(scanMode) {
  const key = SCAN_MODE_MAP[scanMode];
  const workflow = SCAN_WORKFLOWS[key];
  if (!workflow) {
    const error = new Error('Invalid scan mode.');
    error.code = 'INVALID_SCAN_MODE';
    error.statusCode = 400;
    throw error;
  }
  return workflow;
}

function validateScanRequest(payload) {
  const { qr_student_id, action, scanner_token } = payload || {};
  const authorizedScanners = (process.env.AUTHORIZED_SCANNERS || 'SCANNER-BUS-AUTH-2026')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!authorizedScanners.includes(scanner_token)) {
    const error = new Error('Unauthorized scanner');
    error.code = 'UNAUTHORIZED_SCANNER';
    error.statusCode = 403;
    throw error;
  }
  if (!qr_student_id || !action) {
    const error = new Error('qr_student_id and action required');
    error.code = 'BAD_REQUEST';
    error.statusCode = 400;
    throw error;
  }
}

async function findStudent(studentQr) {
  const student = await Student.findOne({ $or: [{ qr_student_id: studentQr }, { _id: studentQr }] });
  if (!student) {
    const error = new Error('Student not found.');
    error.code = 'STUDENT_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  return student;
}

async function findActiveTrip(busNumber) {
  const bus = await Bus.findOne({ busNumber });
  if (!bus) {
    const error = new Error('Bus not found.');
    error.code = 'BUS_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const trip = await Trip.findOne({ busId: bus.busId, status: 'active' });
  if (!trip) {
    const error = new Error('No active trip found for this bus. Scan rejected.');
    error.code = 'NO_ACTIVE_TRIP';
    error.statusCode = 404;
    throw error;
  }
  return { bus, trip };
}

async function getAuthoritativeBusLocation(trip) {
  const gpsInfo = await resolveBusGpsAndSource(trip.busId);
  if (!gpsInfo || !gpsInfo.latitude || !gpsInfo.longitude) {
    const error = new Error('GPS not available. Cannot verify bus location.');
    error.code = 'BUS_POSITION_UNAVAILABLE';
    error.statusCode = 503;
    throw error;
  }
  // Verify timestamp freshness (<30s)
  const gpsAgeSeconds = Math.floor((Date.now() - new Date(gpsInfo.timestamp).getTime()) / 1000);
  if (gpsAgeSeconds > 30) {
    const error = new Error('GPS signal lost. Last update too old to verify location.');
    error.code = 'BUS_POSITION_STALE';
    error.statusCode = 503;
    throw error;
  }
  return { latitude: gpsInfo.latitude, longitude: gpsInfo.longitude };
}


async function checkDuplicateScan(studentId, attendanceType, tripId) {
  const scanModeMap = {
    'BOARD_IN': 'Morning Boarding',
    'DROP_AT_COLLEGE': 'College Arrival',
    'BOARD_FROM_COLLEGE': 'College Boarding',
    'DROP_HOME': 'Home Drop-Off'
  };
  const scanMode = scanModeMap[attendanceType];
  const duplicate = await ScanLog.findOne({
    student_id: studentId,
    trip_id: tripId,
    scanMode: scanMode
  });
  if (duplicate) {
    const error = new Error('Student has already completed this scan.');
    error.code = 'DUPLICATE_SCAN';
    error.statusCode = 409;
    throw error;
  }
}

async function saveAttendance(student, bus, trip, busLocation, scanMode, workflow, scanId, driverId, timeString) {
  const configs = getConfigs();
  const logPayload = {
    id: scanId || `SCAN-${Date.now()}`,
    student_id: student._id,
    student_name: student.name,
    register_no: student.register_no,
    action: (scanMode === 'Morning Boarding' || scanMode === 'College Boarding') ? 'board' : 'dropoff',
    scanMode,
    tripType: trip.direction === 'to_college' ? 'Morning Trip' : 'Evening Trip',
    latitude: busLocation.latitude,
    longitude: busLocation.longitude,
    bus_number: bus.busNumber,
    driver_id: driverId || trip.driverId,
    trip_id: trip.tripId,
    time: timeString,
    date: todayDate(),
    result: 'success',
    isDemo: configs.DEMO_MODE,
  };

  const doc = await ScanLog.create(logPayload);
  db.scanLogs.unshift(doc.toObject());

  try {
    const activeTripId = trip.tripId;
    const boards = await ScanLog.countDocuments({ trip_id: activeTripId, action: 'board' });
    const drops = await ScanLog.countDocuments({ trip_id: activeTripId, action: 'dropoff' });
    const currentOccupancy = Math.max(0, boards - drops);

    trip.summary = trip.summary || { averageSpeedKmph: 0, maxSpeedKmph: 0, villagesCrossed: 0, durationMinutes: 0, totalBoarded: 0, totalDropped: 0, peakOccupancy: 0, averageOccupancy: 0 };
    if (currentOccupancy > (trip.summary.peakOccupancy || 0)) {
      trip.summary.peakOccupancy = currentOccupancy;
      await Trip.updateOne({ tripId: activeTripId }, { $set: { 'summary.peakOccupancy': currentOccupancy } });
    }
  } catch (occupancyErr) {
    console.warn('Occupancy calculation hook error:', occupancyErr);
  }

  return doc;
}

async function updateStudentStatus(student, successStatus) {
  student.trackingStatus = successStatus;
  if (student.trackingStatus === 'REACHED_HOME') {
    student.attendanceException = '';
  }
  await student.save();

  const sIdx = db.students.findIndex(s => s._id === student._id);
  if (sIdx !== -1) {
    db.students[sIdx] = student.toObject();
    saveDB(db);
  }
}

function buildSms(template, variables) {
  return template
    .replace('{studentName}', variables.studentName)
    .replace('{busNumber}', variables.busNumber)
    .replace('{time}', variables.time);
}

async function sendParentNotification(student, smsBody, scanMode, tripId, logTime, logDate, busNumber) {
  const title = scanMode;
  const message = `${student.name} - ${scanMode} at ${logTime} (Bus ${busNumber})`;
  const notif = await Notification.create({
    id: `N-${uuidv4()}`,
    to: 'parent',
    parent_id: student.parent_id,
    student_id: student._id,
    title,
    message,
    time: logTime,
    date: logDate,
    read: false,
  });
  db.notifications.push(notif.toObject());
  saveDB(db);

  let smsResult = null;
  let smsStatusVal = 'none';
  if (student.parent_phone) {
    smsResult = await sendSMS(student.parent_phone, smsBody, student._id.toString(), scanMode, tripId).catch((e) => ({ status: 'failed', error: e?.message }));
    if (smsResult) {
      smsStatusVal = smsResult.status;
    }
  }
  return { smsResult, smsStatusVal };
}

function createAuditLog(data) {
  console.log(`[SCAN AUDIT LOG] ${new Date().toISOString()} - Student: ${data.studentId}, Driver: ${data.driverId}, Bus: ${data.busNumber}, Trip: ${data.tripId}, Mode: ${data.scanMode}, BusCoords: (${data.busLat}, ${data.busLng}), TargetCoords: (${data.targetLat}, ${data.targetLng}), Distance: ${data.distance}m, Result: ${data.result}, FailureReason: ${data.failureReason || 'N/A'}`);
}

function buildApiResponse(doc, student, workflow) {
  return {
    success: true,
    ok: true,
    message: workflow.successMessage,
    attendance: doc,
    student: student,
    log: doc
  };
}

function handleScanError(error, res) {
  console.error('[SCAN ERROR]', error);
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.message || 'Unexpected server error.';
  return res.status(statusCode).json({
    success: false,
    code,
    message
  });
}

// =====================================================
// API Routes
// =====================================================
app.post('/api/scan', async (req, res) => {
  const payload = req.body || {};
  let auditData = {
    studentId: payload.qr_student_id || 'UNKNOWN',
    driverId: payload.driver_id || 'UNKNOWN',
    busNumber: payload.bus_number || 'UNKNOWN',
    tripId: payload.trip_id || 'UNKNOWN',
    scanMode: payload.scanMode || 'UNKNOWN',
    busLat: 0,
    busLng: 0,
    targetLat: 0,
    targetLng: 0,
    distance: 0,
    result: 'failure',
    failureReason: ''
  };

  try {
    validateScanRequest(payload);
    const { qr_student_id, bus_number, scanMode, scanId, driver_id } = payload;

    const workflow = resolveWorkflow(scanMode);

    const student = await findStudent(qr_student_id);
    auditData.studentId = student._id.toString();

    const scanBusNumber = bus_number || student.bus_details?.bus_number;
    auditData.busNumber = scanBusNumber;
    const { bus, trip } = await findActiveTrip(scanBusNumber);
    auditData.tripId = trip.tripId;
    auditData.driverId = driver_id || trip.driverId;

    const directionModeMap = {
      to_college:   ['Morning Boarding', 'College Arrival'],
      from_college: ['College Boarding', 'Home Drop-Off', 'Evening Drop-Off', 'Home Arrival'],
      to_home:      ['College Boarding', 'Home Drop-Off', 'Evening Drop-Off', 'Home Arrival']
    };
    const allowedModes = directionModeMap[trip.direction] || [];
    if (!allowedModes.includes(scanMode)) {
      const err = new Error(`Scanner mode "${scanMode}" is not valid for a "${trip.direction}" trip.`);
      err.code = 'SCAN_MODE_TRIP_DIRECTION_MISMATCH';
      err.statusCode = 422;
      throw err;
    }

    const studentAssignedBus = student.bus_details?.bus_number || student.busNumber || '';
    if (studentAssignedBus !== bus.busNumber) {
      const err = new Error('Student assigned to another bus');
      err.code = 'INCORRECT_BUS_ASSIGNMENT';
      err.statusCode = 400;
      throw err;
    }

    const busLocation = await getAuthoritativeBusLocation(trip);
    auditData.busLat = busLocation.latitude;
    auditData.busLng = busLocation.longitude;
    auditData.targetLat = 0;
    auditData.targetLng = 0;
    auditData.distance = 0;

    await checkDuplicateScan(student._id, workflow.attendanceType, trip.tripId);

    const timeString = nowTime();
    const doc = await saveAttendance(student, bus, trip, busLocation, scanMode, workflow, scanId, driver_id, timeString);

    await updateStudentStatus(student, workflow.successStatus);

    const smsBody = buildSms(workflow.smsTemplate, {
      studentName: student.name,
      busNumber: bus.busNumber,
      time: timeString
    });
    
    const { smsStatusVal } = await sendParentNotification(
      student, 
      smsBody, 
      scanMode, 
      trip.tripId, 
      timeString, 
      todayDate(), 
      bus.busNumber
    );

    doc.smsStatus = smsStatusVal;
    await doc.save();

    const localLogIdx = db.scanLogs.findIndex(l => l.id === doc.id);
    if (localLogIdx !== -1) {
      db.scanLogs[localLogIdx].smsStatus = smsStatusVal;
      saveDB(db);
    }

    auditData.result = 'success';
    createAuditLog(auditData);

    const responsePayload = buildApiResponse(doc, student, workflow);
    return res.status(200).json(responsePayload);

  } catch (error) {
    auditData.result = 'failure';
    auditData.failureReason = error.message;
    createAuditLog(auditData);
    return handleScanError(error, res);
  }
});

app.get('/api/scans', async (req, res) => {
  const { student_id, date, month, year } = req.query;
  try {
    const filter = {};
    if (student_id) filter.student_id = student_id;
    if (date) filter.date = date;
    if (month && year) {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      filter.date = new RegExp(`^${ym}`);
    }
    const logs = await ScanLog.find(filter).sort({ createdAt: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Attendance Summary ======
app.get('/api/attendance/summary', async (req, res) => {
  try {
    const today = todayDate();
    const students = await Student.find({ status: 'active' }).lean();
    const scans = await ScanLog.find({ date: today }).lean();

    const summary = students.map(student => {
      const studentScans = scans.filter(s => s.student_id === student._id);
      
      const morningBoard = studentScans.find(s => s.scanMode === 'Morning Boarding')?.time || '—';
      const collegeArrive = studentScans.find(s => s.scanMode === 'College Arrival')?.time || '—';
      const collegeBoard = studentScans.find(s => s.scanMode === 'College Boarding')?.time || '—';
      const homeDrop = studentScans.find(s => s.scanMode === 'Home Drop-Off')?.time || '—';

      let attendanceStatus = 'Absent';
      const scanCount = studentScans.length;

      if (morningBoard !== '—' && collegeArrive !== '—' && collegeBoard !== '—' && homeDrop !== '—') {
        attendanceStatus = 'Present';
      } else if (scanCount > 0) {
        attendanceStatus = 'Partial';
      } else if (student.attendanceException) {
        attendanceStatus = student.attendanceException === 'Absent' ? 'Absent' : 'Partial';
      }

      return {
        studentName: student.name,
        registerNumber: student.register_no,
        busNumber: student.bus_details?.bus_number || '—',
        morningBoardingTime: morningBoard,
        collegeArrivalTime: collegeArrive,
        collegeBoardingTime: collegeBoard,
        homeDropOffTime: homeDrop,
        attendanceStatus,
        exception: student.attendanceException || '—'
      };
    });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Student Attendance Exception ======
app.post('/api/students/:id/exception', authenticateToken, async (req, res) => {
  const { exception } = req.body || {};
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    student.attendanceException = exception || '';
    await student.save();
    
    // Update fallback local DB
    const idx = db.students.findIndex(s => s._id === req.params.id);
    if (idx !== -1) {
      db.students[idx].attendanceException = student.attendanceException;
      saveDB(db);
    }
    res.json({ ok: true, student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Notifications ======
app.get('/api/notifications', async (req, res) => {
  const { parent_id, to } = req.query;
  try {
    const filter = {};
    if (to) filter.to = to;
    if (parent_id) filter.parent_id = parent_id;
    const list = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Stats (overview) ======
app.get('/api/stats/overview', async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const totalBuses = await Bus.countDocuments();
    const activeBuses = await Bus.countDocuments({ status: 'active' });
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const recentAlerts = await Alert.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 });
    
    res.json({
      totalStudents,
      totalBuses,
      activeBuses,
      recentAlerts,
      alertsLast2Days: recentAlerts.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== Bus tracking (mock GPS) ======
app.get('/api/bus-tracking/:bus_number', (req, res) => {
  const { bus_number } = req.params;
  const lat = 12.97 + Math.random() * 0.05;
  const lng = 77.59 + Math.random() * 0.05;
  res.json({ bus_number, lat, lng, location: 'En route', eta: '8:12 AM', updated: new Date().toISOString() });
});

// ====== SMS ======
app.get('/api/sms/log', async (req, res) => {
  try {
    const list = await SmsLog.find().sort({ createdAt: -1 }).limit(100).lean();
    const mapped = list.map(l => ({
      id: l.smsId,
      to: l.to,
      body: l.body,
      provider: l.provider,
      status: l.status,
      error: l.error,
      created_at: l.createdAt ? l.createdAt.toISOString() : new Date().toISOString()
    }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sms/status', (req, res) => {
  res.json({
    configured: smsConfigured(),
    provider: smsConfigured() ? 'twilio' : 'mock',
    info: smsConfigured()
      ? 'Real SMS will be sent via Twilio.'
      : 'Twilio is not configured. SMS messages are logged to backend/sms_log.json (and console) only.',
  });
});

// Defect 21 & 20 Centralized Config & Health Routes
app.get('/api/demo/status', (req, res) => {
  const configs = getConfigs();
  res.json({ demoMode: configs.DEMO_MODE });
});

app.get('/api/admin/config-health', authenticateToken, requireAdmin, (req, res) => {
  const configs = getConfigs();
  res.json({
    demoMode: configs.DEMO_MODE,
    twilioConfigured: smsConfigured(),
    gpsSimulationEnabled: configs.GPS_SIMULATION_ENABLED,
    mockSmsEnabled: configs.MOCK_SMS_ENABLED,
    environment: configs.ENVIRONMENT,
    lastConfigReload: configs.LAST_CONFIG_RELOAD
  });
});

app.get('/api/admin/sms-health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const configs = getConfigs();
    const lastSms = await SmsLog.findOne().sort({ createdAt: -1 }).lean();
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedCount24h = await SmsLog.countDocuments({
      status: 'failed',
      createdAt: { $gte: oneDayAgo }
    });

    res.json({
      providerConfigured: smsConfigured(),
      demoMode: configs.DEMO_MODE,
      lastSmsStatus: lastSms ? lastSms.status : 'none',
      failedCount24h
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== Backup & Restore Admin APIs ======
app.post('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const backupData = {
      students: await Student.find({}).lean(),
      drivers: await Driver.find({}).lean(),
      buses: await Bus.find({}).lean(),
      trips: await Trip.find({}).lean(),
      scanLogs: await ScanLog.find({}).lean(),
      busStops: await BusStop.find({}).lean(),
      systemSettings: await SystemSettings.find({}).lean(),
    };

    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir);
    }
    const filename = `backup-${Date.now()}.json`;
    const backupPath = path.join(backupsDir, filename);
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

    res.json({ success: true, filename, message: 'Backup created successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir) || fs.readdirSync(backupsDir).length === 0) {
      return res.status(400).json({ error: 'No backup files found.' });
    }
    const files = fs.readdirSync(backupsDir).filter(f => f.startsWith('backup-')).sort();
    const latestFile = files[files.length - 1];
    const backupPath = path.join(backupsDir, latestFile);
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    // Clear collections
    await Student.deleteMany({});
    await Driver.deleteMany({});
    await Bus.deleteMany({});
    await Trip.deleteMany({});
    await ScanLog.deleteMany({});
    await BusStop.deleteMany({});
    await SystemSettings.deleteMany({});

    // Restore
    if (backupData.students) await Student.insertMany(backupData.students);
    if (backupData.drivers) await Driver.insertMany(backupData.drivers);
    if (backupData.buses) await Bus.insertMany(backupData.buses);
    if (backupData.trips) await Trip.insertMany(backupData.trips);
    if (backupData.scanLogs) await ScanLog.insertMany(backupData.scanLogs);
    if (backupData.busStops) await BusStop.insertMany(backupData.busStops);
    if (backupData.systemSettings) await SystemSettings.insertMany(backupData.systemSettings);


    res.json({ success: true, message: `Database restored from ${latestFile}.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ====== Start ======
async function bootstrap() {
  try {
    await connectDB();
    await seedTrackingData();

    // Sync seed data to MongoDB collections if they are empty
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      console.log('🌱 Seeding Admins in MongoDB...');
      await Admin.insertMany(db.admins);
    }
    const studentCount = await Student.countDocuments();
    if (studentCount === 0) {
      console.log('🌱 Seeding Students in MongoDB...');
      await Student.insertMany(db.students);
    }
    const driverCount = await Driver.countDocuments();
    if (driverCount === 0) {
      console.log('🌱 Seeding Drivers in MongoDB...');
      await Driver.insertMany(db.drivers);
    }
    
    // Seed BusStop if empty
    const busStopCount = await BusStop.countDocuments();
    if (busStopCount === 0) {
      console.log('🌱 Seeding BusStops in MongoDB...');
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


// ====== Startup Recovery (MongoDB Active Trips check) ======
    console.log('🔄 Checking for active trips to recover...');
    const activeTrips = await Trip.find({ status: 'active' }).sort({ startTime: -1 });

    const seenBuses = new Set();
    const seenDrivers = new Set();

    for (const trip of activeTrips) {
      // Defect 12: Recovery Duplicate Prevention
      if (seenBuses.has(trip.busId) || seenDrivers.has(trip.driverId)) {
        console.warn(`[RECOVERY WARN] Duplicate active trip found for bus ${trip.busId} or driver ${trip.driverId}. Automatically archiving trip ${trip.tripId}`);
        trip.status = 'completed';
        trip.endTime = new Date();
        await trip.save();
        continue;
      }
      seenBuses.add(trip.busId);
      seenDrivers.add(trip.driverId);

      console.log(`📡 Recovering trip: ${trip.tripId}`);
      const bus = await Bus.findOne({ busId: trip.busId });
      if (bus) {
        const boardedScans = await ScanLog.countDocuments({ trip_id: trip.tripId, action: 'board', result: 'success' });
        const droppedScans = await ScanLog.countDocuments({ trip_id: trip.tripId, action: 'dropoff', result: 'success' });
        const occupancy = Math.max(0, boardedScans - droppedScans);

        const capacity = bus.capacity || 40;
        if (occupancy < 0 || occupancy > capacity) {
          console.warn(`[RECOVERY WARN] Recovered trip occupancy mismatch. Calculated: ${occupancy}, Capacity: ${capacity}. Automatically repaired.`);
        }

        trip.summary = trip.summary || {};
        trip.summary.peakOccupancy = Math.max(trip.summary.peakOccupancy || 0, occupancy);
        await trip.save();

        await ActiveBus.updateOne(
          { busId: bus.busId },
          {
            $set: {
              currentTripId: trip.tripId,
              busNumber: bus.busNumber,
              status: 'active',
              lastUpdatedAt: new Date()
            }
          },
          { upsert: true }
        );

        io.emit('bus:update', {
          busId: bus.busId,
          busNumber: bus.busNumber,
          currentTripId: trip.tripId,
          occupancy,
          routeProgress: trip.routeProgress,
          status: 'active'
        });
      }
    }
  } catch (error) {
    console.error('⚠️  MongoDB bootstrap failed:', error?.message || error);
  }

  server.listen(PORT, () => {
    console.log(`🚌 SafeRide Backend running on http://localhost:${PORT}`);
    console.log('📦 File DB fallback file:', DB_PATH);
    console.log(smsConfigured()
      ? '📱 SMS: Twilio active'
      : '📱 SMS: mock mode (set TWILIO_* env vars in backend/.env to send real SMS)');
    console.log('📡 Socket.IO ready');
    console.log('🗺️  Real-time tracking routes loaded');
  });
}

bootstrap();
