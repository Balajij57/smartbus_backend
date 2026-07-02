// @ts-nocheck
import { haversineDistanceKm } from './geo';

export type TrackingVillage = {
  villageId: string;
  villageName: string;
  latitude: number;
  longitude: number;
  sequence: number;
  radiusMeters: number;
  kind: 'origin' | 'village' | 'college';
};

export type TrackingRoute = {
  routeId: string;
  routeName: string;
  collegeLocation: { name: string; latitude: number; longitude: number };
  villages: TrackingVillage[];
};

export type TrackingBus = {
  busId: string;
  busNumber: string;
  routeId: string;
  driverId: string;
  status: 'inactive' | 'active' | 'paused';
  currentTripId: string | null;
  currentVillageId: string | null;
  nextVillageId: string | null;
  lastKnownLocation?: { latitude: number; longitude: number; speed: number; heading: number; timestamp: string } | null;
};

export type TrackingProgressVillage = TrackingVillage & {
  crossed: boolean;
  crossedAt?: string | null;
  status: 'pending' | 'current' | 'crossed';
};

export type TrackingTrip = {
  tripId: string;
  busId: string;
  driverId: string;
  routeId: string;
  startTime: string;
  endTime: string | null;
  status: 'active' | 'completed';
  currentLocation?: { latitude: number; longitude: number; speed: number; heading: number; timestamp: string } | null;
  routeProgress: TrackingProgressVillage[];
  remainingDistanceKm: number;
  currentSpeedKmph: number;
  lastUpdatedAt?: string | null;
  summary?: { averageSpeedKmph?: number; maxSpeedKmph?: number; villagesCrossed?: number; durationMinutes?: number };
};

const KEY = 'smartbus-tracking-v2';

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function seed() {
  const route: TrackingRoute = {
    routeId: 'ROUTE-A',
    routeName: 'Samalkot to College Route',
    collegeLocation: { name: 'College', latitude: 17.0585, longitude: 82.1665 },
    villages: [
      { villageId: 'VIL-001', villageName: 'Pakala', latitude: 17.0453, longitude: 82.1692, sequence: 1, radiusMeters: 250, kind: 'origin' },
      { villageId: 'VIL-002', villageName: 'Village A', latitude: 17.0500, longitude: 82.1700, sequence: 2, radiusMeters: 250, kind: 'village' },
      { villageId: 'VIL-003', villageName: 'Village B', latitude: 17.0530, longitude: 82.1740, sequence: 3, radiusMeters: 250, kind: 'village' },
      { villageId: 'VIL-004', villageName: 'Village C', latitude: 17.0560, longitude: 82.1760, sequence: 4, radiusMeters: 250, kind: 'village' },
      { villageId: 'VIL-005', villageName: 'College', latitude: 17.0585, longitude: 82.1665, sequence: 5, radiusMeters: 250, kind: 'college' },
    ],
  };

  return {
    routes: [route],
    buses: [
      { busId: 'BUS001', busNumber: 'BUS-12', routeId: 'ROUTE-A', driverId: 'DRV001', status: 'inactive', currentTripId: null, currentVillageId: null, nextVillageId: null, lastKnownLocation: null },
      { busId: 'BUS002', busNumber: 'BUS-07', routeId: 'ROUTE-A', driverId: 'DRV002', status: 'inactive', currentTripId: null, currentVillageId: null, nextVillageId: null, lastKnownLocation: null },
      { busId: 'BUS003', busNumber: 'BUS-03', routeId: 'ROUTE-A', driverId: '', status: 'inactive', currentTripId: null, currentVillageId: null, nextVillageId: null, lastKnownLocation: null },
    ] as TrackingBus[],
    trips: [] as TrackingTrip[],
    liveLocations: [] as Array<{ busId: string; tripId: string; latitude: number; longitude: number; speed: number; heading: number; timestamp: string }>,
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const fresh = seed();
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

function write(value: ReturnType<typeof seed>) {
  localStorage.setItem(KEY, JSON.stringify(value));
}

function computeRemaining(current: { latitude: number; longitude: number }, villages: TrackingProgressVillage[], route: TrackingRoute) {
  const pending = villages.filter((v) => !v.crossed).sort((a, b) => a.sequence - b.sequence);
  const points = [current, ...pending.map((v) => ({ latitude: v.latitude, longitude: v.longitude })), route.collegeLocation];
  let remainingDistanceKm = 0;
  for (let i = 0; i < points.length - 1; i += 1) remainingDistanceKm += haversineDistanceKm(points[i], points[i + 1]);
  return remainingDistanceKm;
}

export const trackingMock = {
  async listBuses() {
    return read().buses;
  },
  async getRoute(routeId: string) {
    const route = read().routes.find((r) => r.routeId === routeId);
    if (!route) throw new Error('Route not found');
    return route as TrackingRoute;
  },
  async startTrip(busId: string, driverId: string, startVillageId?: string) {
    const db = read();
    const bus = db.buses.find((b) => b.busId === busId);
    if (!bus) throw new Error('Bus not found');
    const existing = db.trips.find((t) => t.busId === busId && t.status === 'active');
    if (existing) return existing;
    const route = db.routes.find((r) => r.routeId === bus.routeId)!;
    let villages = route.villages.slice().sort((a, b) => a.sequence - b.sequence);
    if (startVillageId) {
      const startIndex = villages.findIndex((v) => v.villageId === startVillageId);
      if (startIndex === -1) throw new Error('Invalid starting village selected');
      villages = villages.slice(startIndex);
    }
    const routeProgress: TrackingProgressVillage[] = villages.map((v, index) => ({
      ...v,
      sequence: index + 1,
      crossed: false,
      crossedAt: null,
      status: index === 0 ? 'current' : 'pending',
    }));
    const trip: TrackingTrip = {
      tripId: uid('TRIP'),
      busId,
      driverId,
      routeId: route.routeId,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'active',
      currentLocation: null,
      routeProgress,
      remainingDistanceKm: 0,
      currentSpeedKmph: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
    db.trips.unshift(trip);
    bus.status = 'active';
    bus.currentTripId = trip.tripId;
    bus.currentVillageId = routeProgress[0]?.villageId || null;
    bus.nextVillageId = routeProgress[1]?.villageId || null;
    write(db);
    return trip;
  },
  async stopTrip(tripId: string, busId: string) {
    const db = read();
    const trip = db.trips.find((t) => t.tripId === tripId && t.busId === busId && t.status === 'active');
    if (!trip) throw new Error('Active trip not found');
    trip.status = 'completed';
    trip.endTime = new Date().toISOString();
    const bus = db.buses.find((b) => b.busId === busId);
    if (bus) {
      bus.status = 'inactive';
      bus.currentTripId = null;
      bus.currentVillageId = null;
      bus.nextVillageId = null;
    }
    write(db);
    return trip;
  },
  async updateLocation(tripId: string, payload: { busId: string; latitude: number; longitude: number; speed?: number; heading?: number; timestamp?: string }) {
    const db = read();
    const trip = db.trips.find((t) => t.tripId === tripId && t.busId === payload.busId && t.status === 'active');
    if (!trip) throw new Error('Active trip not found');
    const bus = db.buses.find((b) => b.busId === payload.busId)!;
    const route = db.routes.find((r) => r.routeId === trip.routeId)!;
    const timestamp = payload.timestamp || new Date().toISOString();

    db.liveLocations.unshift({
      busId: payload.busId,
      tripId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed || 0,
      heading: payload.heading || 0,
      timestamp,
    });

    const point = { latitude: payload.latitude, longitude: payload.longitude };
    for (const village of trip.routeProgress.filter((v) => !v.crossed).sort((a, b) => a.sequence - b.sequence)) {
      const distanceKm = haversineDistanceKm(point, village);
      if (distanceKm * 1000 <= village.radiusMeters) {
        village.crossed = true;
        village.crossedAt = timestamp;
        village.status = 'crossed';
        const next = trip.routeProgress.filter((v) => !v.crossed).sort((a, b) => a.sequence - b.sequence)[0];
        if (next) next.status = 'current';
        bus.currentVillageId = village.villageId;
        bus.nextVillageId = next?.villageId || null;
        break;
      }
    }

    const remainingDistanceKm = computeRemaining(point, trip.routeProgress, route);
    trip.currentLocation = {
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed || 0,
      heading: payload.heading || 0,
      timestamp,
    };
    trip.currentSpeedKmph = payload.speed || 0;
    trip.remainingDistanceKm = Number(remainingDistanceKm.toFixed(2));
    trip.lastUpdatedAt = timestamp;

    bus.lastKnownLocation = trip.currentLocation;
    write(db);

    return this.getSnapshot(payload.busId);
  },
  async getSnapshot(busId: string) {
    const db = read();
    const bus = db.buses.find((b) => b.busId === busId);
    if (!bus) throw new Error('Bus not found');
    if (!bus.currentTripId) {
      return { busId, status: 'inactive', currentLocation: bus.lastKnownLocation || null, routeProgress: [], eta: null, nextVillage: null };
    }
    const trip = db.trips.find((t) => t.tripId === bus.currentTripId)!;
    const route = db.routes.find((r) => r.routeId === trip.routeId)!;
    const nextVillage = trip.routeProgress.filter((v) => !v.crossed).sort((a, b) => a.sequence - b.sequence)[0] || null;
    const speed = Math.max(trip.currentSpeedKmph || 0, 20);
    const distanceToNextVillageKm = trip.currentLocation && nextVillage ? haversineDistanceKm(trip.currentLocation, nextVillage) : 0;
    const etaToNextVillageMinutes = nextVillage ? (distanceToNextVillageKm / speed) * 60 : 0;
    const etaToCollegeMinutes = trip.remainingDistanceKm > 0 ? (trip.remainingDistanceKm / speed) * 60 : 0;
    return {
      busId,
      busNumber: bus.busNumber,
      routeId: route.routeId,
      routeName: route.routeName,
      status: trip.status,
      currentLocation: trip.currentLocation,
      routeProgress: trip.routeProgress,
      remainingDistanceKm: trip.remainingDistanceKm,
      speedKmph: trip.currentSpeedKmph,
      nextVillage,
      eta: {
        distanceRemainingKm: trip.remainingDistanceKm,
        currentSpeedKmph: trip.currentSpeedKmph,
        nextVillage,
        etaToNextVillageMinutes: Number(etaToNextVillageMinutes.toFixed(1)),
        etaToCollegeMinutes: Number(etaToCollegeMinutes.toFixed(1)),
      },
      lastUpdatedAt: trip.lastUpdatedAt,
    };
  },
  async getTripHistory(busId: string) {
    const db = read();
    return db.trips.filter((t) => t.busId === busId).sort((a, b) => b.startTime.localeCompare(a.startTime));
  },
};
