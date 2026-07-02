// API service layer.
// In dev: tries the real backend (proxied to localhost:5000).
// If the backend is unreachable, automatically falls back to an in-browser mock
// so the demo works out of the box.

import { mock } from './mockBackend';
import { trackingMock, type TrackingBus, type TrackingRoute, type TrackingTrip, type TrackingProgressVillage } from './trackingMock';
export type { TrackingBus, TrackingRoute, TrackingTrip, TrackingProgressVillage };

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export type Role = 'student' | 'parent' | 'admin' | 'driver';

export type Student = {
  _id: string;
  register_no: string;
  name: string;
  gender: string;
  year: string;
  department: string;
  section: string;
  date_of_birth: string;
  address: { door_no: string; street: string; city: string; state: string; pincode: string };
  bus_details: { bus_id: string; bus_number: string; route_name?: string; routeName?: string; boarding_point: string };
  parent_id: string;
  driver_id: string;
  qr_student_id: string;
  profile_photo: string;
  password?: string;
  parent_password?: string;
  parent_phone?: string;
  parent_email?: string;
  boardingPoint?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
  trackingStatus?: string;
  attendanceException?: string;
  status: 'active' | 'inactive';
  created_at: string;
  };
  
  export type Driver = {
  _id: string;
  driver_id: string;
  name: string;
  phone: string;
  license: string;
  bus_id: string;
  bus_number: string;
  route_name?: string;
  routeName?: string;
  password?: string;
  status: string;
  created_at: string;
  };
  
  export type Bus = { bus_id: string; bus_number: string; route_name?: string; routeName?: string; capacity: number };

export type BusRouteStop = {
  stopName: string;
  latitude: number;
  longitude: number;
  studentCount: number;
  sequence: number;
};

export type BusRoute = {
  busNumber: string;
  stops: BusRouteStop[];
};

export type AlertRec = {
  id: string;
  time: string;
  date: string;
  bus: string;
  driver_id: string;
  driver_name: string;
  type: 'Delay' | 'Emergency';
  category: string;
  message: string;
  status: 'Active' | 'Resolved';
  created_at: string;
};

export type ScanLog = {
  id: string;
  student_id: string;
  student_name: string;
  register_no: string;
  action: 'board' | 'dropoff';
  scanMode?: string;
  tripType?: string;
  latitude?: number;
  longitude?: number;
  smsStatus?: string;
  bus_number: string;
  time: string;
  date: string;
  created_at: string;
};

export type Notif = {
  id: string;
  to: 'parent' | 'admin';
  parent_id?: string;
  student_id?: string;
  title: string;
  message: string;
  time: string;
  date: string;
  created_at: string;
  read: boolean;
};

export type SmsRecord = {
  id: string;
  to: string;
  body: string;
  provider: 'twilio' | 'mock' | 'console';
  status: 'sent' | 'logged-only' | 'failed';
  error?: string | null;
  created_at: string;
};

export type User = {
  id: string;
  name: string;
  role: Role;
  username: string;
  student?: Student;
  driver?: Driver;
};

export type TrackingLocation = {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
};

export type TrackingSnapshot = {
  busId: string;
  busNumber?: string;
  routeId?: string;
  routeName?: string;
  status: 'inactive' | 'active' | 'completed' | 'paused' | string;
  direction?: 'to_college' | 'from_college' | string | null;
  currentLocation: TrackingLocation | null;
  routeProgress: TrackingProgressVillage[];
  remainingDistanceKm?: number;
  speedKmph?: number;
  nextVillage: TrackingProgressVillage | null;
  eta: {
    distanceRemainingKm: number;
    currentSpeedKmph: number;
    nextVillage: TrackingProgressVillage | null;
    etaToNextVillageMinutes: number;
    etaToCollegeMinutes: number;
  } | null;
  lastUpdatedAt?: string | null;
};

// --- Auto-detect backend availability ---
let USE_MOCK: boolean | null = null;

async function pingBackend(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const res = await fetch(`${API_BASE}/health`, { signal: ac.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureMode() {
  if (USE_MOCK === null) {
    const ok = await pingBackend();
    USE_MOCK = !ok;
    if (USE_MOCK) {
      // eslint-disable-next-line no-console
      console.info('[SafeRide] Real backend not detected — using in-browser mock backend (data persists in localStorage).');
    } else {
      // eslint-disable-next-line no-console
      console.info('[SafeRide] Connected to real backend at', API_BASE);
    }
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  };

  // Try to load auth token from local storage
  try {
    const raw = localStorage.getItem('sb-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token) {
        headers['Authorization'] = `Bearer ${parsed.token}`;
      }
    }
  } catch {}

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...init,
  });
  if ((res.status === 401 || res.status === 403) && !path.includes('/auth/login')) {
    localStorage.removeItem('sb-auth');
    window.location.href = '/login';
    throw new Error('Session expired. Redirecting to login.');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let body: any = null;
    try {
      body = await res.json();
      if (body?.error) msg = body.error;
      else if (body?.message) msg = body.message;
    } catch {}
    const errorObj = new Error(msg);
    if (body) {
      (errorObj as any).response = body;
    }
    throw errorObj;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Helper: run real or mock depending on detected mode
async function run<T>(realFn: () => Promise<T>, mockFn: () => Promise<T>): Promise<T> {
  await ensureMode();
  if (USE_MOCK) return mockFn();
  try {
    return await realFn();
  } catch (e) {
    // If real backend suddenly fails with a network error, switch to mock for this call only
    if (e instanceof TypeError) {
      USE_MOCK = true;
      // eslint-disable-next-line no-console
      console.info('[SmartBUS] Backend became unreachable — switching to mock backend.');
      return mockFn();
    }
    throw e;
  }
}

export const api = {
  // auth
  login: (role: Role, username: string, password: string) =>
    run(
      () => req<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ role, username, password }) }),
      () => mock.login(role, username, password),
    ),
  changePassword: (role: Role, username: string, currentPassword: string, newPassword: string) =>
    run(
      () => req<{ ok: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ role, username, currentPassword, newPassword }) }),
      () => mock.changePassword(role, username, currentPassword, newPassword),
    ),

  // students
  listStudents: () => run(() => req<Student[]>('/students'), () => mock.listStudents()),
  getStudent: (id: string) => run(() => req<Student>(`/students/${encodeURIComponent(id)}`), () => mock.getStudent(id)),
  createStudent: (s: Partial<Student>) =>
    run(() => req<Student>('/students', { method: 'POST', body: JSON.stringify(s) }), () => mock.createStudent(s)),
  updateStudent: (id: string, s: Partial<Student>) =>
    run(() => req<Student>(`/students/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(s) }), () => mock.updateStudent(id, s)),
  deleteStudent: (id: string) =>
    run(() => req<{ ok: true }>(`/students/${encodeURIComponent(id)}`, { method: 'DELETE' }), () => mock.deleteStudent(id)),

  // drivers
  listDrivers: () => run(() => req<Driver[]>('/drivers'), () => mock.listDrivers()),
  createDriver: (d: Partial<Driver>) =>
    run(() => req<Driver>('/drivers', { method: 'POST', body: JSON.stringify(d) }), () => mock.createDriver(d)),
  deleteDriver: (id: string) =>
    run(() => req<{ ok: true }>(`/drivers/${encodeURIComponent(id)}`, { method: 'DELETE' }), () => mock.deleteDriver(id)),
  assignBus: (id: string, bus_id: string) =>
    run(
      () => req<Driver>(`/drivers/${encodeURIComponent(id)}/assign-bus`, { method: 'PATCH', body: JSON.stringify({ bus_id }) }),
      () => mock.assignBus(id, bus_id),
    ),

  // buses
  listBuses: () => run(() => req<Bus[]>('/buses'), () => mock.listBuses()),
  createBus: (b: any) => run(() => req<Bus>('/buses', { method: 'POST', body: JSON.stringify(b) }), () => mock.createBus(b)),
  updateBus: (id: string, b: any) => run(() => req<Bus>(`/buses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(b) }), () => mock.updateBus(id, b)),
  deleteBus: (id: string) => run(() => req<{ ok: true }>(`/buses/${encodeURIComponent(id)}`, { method: 'DELETE' }), () => mock.deleteBus(id)),
  getBusOccupancy: (busNumber: string) => run(() => req<{ assignedStudents: number, currentOccupancy: number, boardedToday: number, droppedToday: number, remainingStops: number }>(`/buses/${encodeURIComponent(busNumber)}/occupancy`), () => Promise.resolve({ assignedStudents: 0, currentOccupancy: 0, boardedToday: 0, droppedToday: 0, remainingStops: 0 })),
  listBusRoutes: () => run(() => req<BusRoute[]>('/bus-routes'), () => Promise.resolve([])),
  getBusRoute: (busNumber: string) => run(() => req<{ routeExists: boolean; stops: BusRouteStop[] }>(`/bus-routes/${encodeURIComponent(busNumber)}`), () => Promise.resolve({ routeExists: false, stops: [] })),
  listRoutes: () => run(() => req<any[]>('/routes'), () => Promise.resolve([])),
  updateBusRoute: (busNumber: string, routeId: string, routeName: string) =>
    run(
      () => req<any>(`/buses/${encodeURIComponent(busNumber)}/route`, {
        method: 'PATCH',
        body: JSON.stringify({ routeId, routeName })
      }),
      () => Promise.resolve({ ok: true })
    ),
  createRoute: (routeData: any) => run(() => req<any>('/routes', { method: 'POST', body: JSON.stringify(routeData) }), () => Promise.resolve(routeData)),

  // alerts
  listAlerts: () => run(() => req<AlertRec[]>('/alerts'), () => mock.listAlerts()),
  createAlert: (a: Partial<AlertRec>) =>
    run(() => req<AlertRec>('/alerts', { method: 'POST', body: JSON.stringify(a) }), () => mock.createAlert(a)),

  // scans
  scan: (
    qr_student_id: string,
    action: 'board' | 'dropoff',
    bus_number?: string,
    scanId?: string,
    scanMode?: string,
    latitude?: number,
    longitude?: number,
    direction?: 'to_college' | 'from_college',
    driver_id?: string,
    trip_id?: string,
    gpsTimestamp?: number
  ) => {
    const scanner_token = (() => {
      const normalized = (bus_number || '').toUpperCase();
      if (normalized.includes('BUS-12')) return 'SCANNER_BUS12';
      if (normalized.includes('BUS-07')) return 'SCANNER_BUS07';
      if (normalized.includes('BUS-03')) return 'SCANNER_BUS03';
      return 'SCANNER_BUS12';
    })();

    if (USE_MOCK) {
      return mock.scan(qr_student_id, action, bus_number);
    }
    return req<{ ok: true; log: ScanLog; sms?: SmsRecord | null }>('/scan', {
      method: 'POST',
      body: JSON.stringify({ qr_student_id, action, bus_number, scanner_token, scanId, scanMode, latitude, longitude, direction, driver_id, trip_id, gpsTimestamp }),
    });
  },
  listScans: (params?: { student_id?: string; date?: string; month?: number; year?: number }) =>
    run(
      () => {
        const q = new URLSearchParams();
        if (params?.student_id) q.set('student_id', params.student_id);
        if (params?.date) q.set('date', params.date);
        if (params?.month) q.set('month', String(params.month));
        if (params?.year) q.set('year', String(params.year));
        return req<ScanLog[]>(`/scans${q.toString() ? `?${q.toString()}` : ''}`);
      },
      () => mock.listScans(params),
    ),

  // notifications
  listNotifications: (params?: { parent_id?: string; to?: 'parent' | 'admin' }) =>
    run(
      () => {
        const q = new URLSearchParams();
        if (params?.parent_id) q.set('parent_id', params.parent_id);
        if (params?.to) q.set('to', params.to);
        return req<Notif[]>(`/notifications${q.toString() ? `?${q.toString()}` : ''}`);
      },
      () => mock.listNotifications(params),
    ),

  // stats
  overview: () =>
    run(
      () =>
        req<{
          totalStudents: number;
          totalBuses: number;
          activeBuses: number;
          recentAlerts: AlertRec[];
          alertsLast2Days: number;
        }>('/stats/overview'),
      () => mock.overview(),
    ),

  // SMS
  listSmsLog: () => run(() => req<SmsRecord[]>('/sms/log'), () => mock.listSmsLog()),
  smsStatus: () =>
    run(
      () => req<{ configured: boolean; provider: string; info: string }>('/sms/status'),
      () => mock.smsStatus(),
    ),

  // tracking meta
  listTrackingBuses: () => run(() => req<TrackingBus[]>('/tracking/meta/buses'), () => trackingMock.listBuses()),
  getTrackingRoute: (routeId: string) => run(() => req<TrackingRoute>(`/tracking/meta/routes/${encodeURIComponent(routeId)}`), () => trackingMock.getRoute(routeId)),

  // trip lifecycle
  startTrip: (busId: string, driverId: string, startVillageId?: string, direction?: 'to_college' | 'from_college') =>
    run(
      () =>
        req<TrackingTrip>('/trips/start', {
          method: 'POST',
          body: JSON.stringify({ busId, driverId, startVillageId, direction }),
        }),
      () => trackingMock.startTrip(busId, driverId, startVillageId, direction),
    ),
  stopTrip: (tripId: string, busId: string, force?: boolean) => run(() => req<TrackingTrip>(`/trips/${encodeURIComponent(tripId)}/stop`, { method: 'POST', body: JSON.stringify({ busId, force }) }), () => trackingMock.stopTrip(tripId, busId)),
  updateTripLocation: (tripId: string, payload: { busId: string; latitude: number; longitude: number; speed?: number; heading?: number; timestamp?: string }) =>
    run(() => req<TrackingSnapshot>(`/trips/${encodeURIComponent(tripId)}/location`, { method: 'POST', body: JSON.stringify(payload) }), () => trackingMock.updateLocation(tripId, payload)),
  getTrackingSnapshot: (busId: string) => run(() => req<TrackingSnapshot>(`/tracking/bus/${encodeURIComponent(busId)}/snapshot`), () => trackingMock.getSnapshot(busId)),
  getCurrentBusLocation: (busId: string) => run(() => req<TrackingLocation | null>(`/tracking/bus/${encodeURIComponent(busId)}/current`), async () => (await trackingMock.getSnapshot(busId)).currentLocation),
  getRouteProgress: (busId: string) => run(() => req<{ routeProgress: TrackingProgressVillage[]; currentLocation: TrackingLocation | null; remainingDistanceKm: number; currentSpeedKmph: number; tripStatus: string }>(`/tracking/bus/${encodeURIComponent(busId)}/progress`), async () => {
    const snap = await trackingMock.getSnapshot(busId);
    return { routeProgress: snap.routeProgress, currentLocation: snap.currentLocation, remainingDistanceKm: snap.remainingDistanceKm || 0, currentSpeedKmph: snap.speedKmph || 0, tripStatus: snap.status };
  }),
  getTrackingEta: (busId: string) => run(() => req<NonNullable<TrackingSnapshot['eta']>>(`/tracking/bus/${encodeURIComponent(busId)}/eta`), async () => (await trackingMock.getSnapshot(busId)).eta!),
  getVillageStatus: (busId: string) => run(() => req<TrackingProgressVillage[]>(`/tracking/bus/${encodeURIComponent(busId)}/villages`), async () => (await trackingMock.getSnapshot(busId)).routeProgress),
  getTripHistory: (busId: string) => run(() => req<TrackingTrip[]>(`/trips/history/${encodeURIComponent(busId)}`), () => trackingMock.getTripHistory(busId)),
  getActiveBuses: () => run(() => req<TrackingSnapshot[]>('/tracking/active-buses'), () => []),
  getActiveTrip: () => run(() => req<TrackingTrip | null>('/trips/active'), () => Promise.resolve(null)),
  getTrackingState: (busNumber: string) => run(() => req<any>(`/tracking/state/${encodeURIComponent(busNumber)}`), () => Promise.resolve(null)),
  syncTripLocations: (tripId: string, busId: string, locationBuffer: Array<{ latitude: number; longitude: number; speed: number; heading: number; timestamp: string }>) =>
    run(() => req<TrackingSnapshot>(`/trips/${encodeURIComponent(tripId)}/sync`, { method: 'POST', body: JSON.stringify({ busId, locationBuffer }) }), () => trackingMock.getSnapshot(busId)),
  getAttendanceSummary: () => run(() => req<any[]>('/attendance/summary'), () => Promise.resolve([])),
  setStudentException: (id: string, exception: string) => run(() => req<{ ok: true; student: Student }>(`/students/${encodeURIComponent(id)}/exception`, { method: 'POST', body: JSON.stringify({ exception }) }), () => Promise.resolve({ ok: true } as any)),
};
