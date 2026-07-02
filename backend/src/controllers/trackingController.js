import {
  getCurrentBusLocation,
  getETA,
  getRouteProgress,
  getTrackingSnapshot,
  getTripHistory,
  getVillagesStatus,
  startTrip,
  stopTrip,
  updateLocation,
  syncLocationHistory,
  getActiveBuses,
  buildTrackingState,
} from '../services/trackingService.js';
import { Trip } from '../models/Trip.js';
import { ActiveBus } from '../models/ActiveBus.js';
import { Bus } from '../models/Bus.js';

function badRequest(res, error) {
  return res.status(400).json({ error: error.message || 'Bad request' });
}

export async function getActiveTripController(req, res) {
  try {
    const trip = await Trip.findOne({
      $or: [{ driverId: req.user.id }, { driverId: req.user.username }],
      status: 'active'
    });
    return res.json(trip || null);
  } catch (error) {
    return badRequest(res, error);
  }
}


export async function startTripController(req, res) {
  try {
    const { busId, driverId, direction, startVillageId } = req.body || {};
    if (!busId || !driverId) throw new Error('busId and driverId are required');

    // CRITICAL: Ensure authenticated user matches driver ID
    if (req.user.id !== driverId) {
      return res.status(403).json({ error: 'Unauthorized: Driver ID mismatch' });
    }

    const trip = await startTrip({ busId, driverId, direction, startVillageId });
    return res.status(201).json(trip);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function stopTripController(req, res) {
  try {
    const { tripId } = req.params;
    const { busId, force } = req.body || {};
    if (!tripId || !busId) throw new Error('tripId and busId are required');

    // CRITICAL: Validate that active trip driverId matches authenticated driver user
    const trip = await Trip.findOne({ tripId, busId, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });
    if (trip.driverId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You are not the driver of this trip' });
    }

    const completedTrip = await stopTrip({ busId, tripId, force: !!force });
    return res.json(completedTrip);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function updateLocationController(req, res) {
  try {
    const { tripId } = req.params;
    const { busId, latitude, longitude, speed, heading, timestamp } = req.body || {};
    if (!tripId || !busId) throw new Error('tripId and busId are required');
    if (latitude == null || longitude == null) throw new Error('latitude and longitude are required');

    // CRITICAL: Validate active trip ownership
    const trip = await Trip.findOne({ tripId, busId, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });
    if (trip.driverId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You are not the driver of this trip' });
    }

    const result = await updateLocation({ tripId, busId, latitude, longitude, speed, heading, timestamp });
    return res.json(result.payload);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function syncLocationHistoryController(req, res) {
  try {
    const { tripId } = req.params;
    const { busId, locationBuffer } = req.body || {};
    if (!tripId || !busId) throw new Error('tripId and busId are required');
    if (!Array.isArray(locationBuffer)) throw new Error('locationBuffer must be an array');

    // CRITICAL: Validate active trip ownership
    const trip = await Trip.findOne({ tripId, busId, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });
    if (trip.driverId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You are not the driver of this trip' });
    }

    const payload = await syncLocationHistory({ busId, tripId, locationBuffer });
    return res.json(payload);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getCurrentBusLocationController(req, res) {
  try {
    const data = await getCurrentBusLocation(req.params.busId);
    return res.json(data || null);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getRouteProgressController(req, res) {
  try {
    const { busId } = req.params;
    const bus = await Bus.findOne({ busId });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });
    const state = await buildTrackingState(bus.busNumber);
    if (!state || state.tripStatus === 'inactive') {
      return res.json({ tripStatus: 'inactive', routeProgress: [], currentLocation: null, remainingDistanceKm: 0, currentSpeedKmph: 0 });
    }
    return res.json({
      tripId: state.tripId || 'trip-id',
      routeProgress: state.routeProgress,
      currentLocation: state.currentGps ? {
        latitude: state.currentGps.latitude,
        longitude: state.currentGps.longitude,
        timestamp: state.lastGpsUpdateAt || new Date()
      } : null,
      remainingDistanceKm: state.distanceRemaining,
      currentSpeedKmph: state.currentGps ? state.currentGps.speed || 0 : 0,
      tripStatus: state.tripStatus,
      direction: state.direction
    });
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getEtaController(req, res) {
  try {
    const { busId } = req.params;
    const bus = await Bus.findOne({ busId });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });
    const state = await buildTrackingState(bus.busNumber);
    if (!state || state.tripStatus === 'inactive') {
      return res.json({ currentSpeedKmph: 0, distanceRemainingKm: 0, nextVillage: null, etaToNextVillageMinutes: 0, etaToNextVillageLabel: '--', etaToCollegeMinutes: 0, etaToCollegeLabel: '--' });
    }
    return res.json({
      currentSpeedKmph: state.currentGps ? state.currentGps.speed || 0 : 0,
      distanceRemainingKm: state.distanceRemaining,
      nextVillage: state.nextStop ? { villageName: state.nextStop } : null,
      etaToNextVillageMinutes: state.etaToNextStop,
      etaToNextVillageLabel: `${state.etaToNextStop} min`,
      etaToCollegeMinutes: state.etaToDestination,
      etaToCollegeLabel: `${state.etaToDestination} min`
    });
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getVillageStatusController(req, res) {
  try {
    const data = await getVillagesStatus(req.params.busId);
    return res.json(data);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getTripHistoryController(req, res) {
  try {
    const data = await getTripHistory(req.params.busId);
    return res.json(data);
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getTrackingSnapshotController(req, res) {
  try {
    const { busId } = req.params;
    const bus = await Bus.findOne({ busId });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });
    const state = await buildTrackingState(bus.busNumber);
    if (!state || state.tripStatus === 'inactive') {
      return res.json({
        busId,
        status: 'inactive',
        currentLocation: bus.lastKnownLocation || null,
        routeProgress: [],
        eta: null,
        nextVillage: null,
      });
    }

    return res.json({
      busId,
      status: state.tripStatus,
      direction: state.direction || 'to_college',
      currentLocation: state.currentGps ? {
        latitude: state.currentGps.latitude,
        longitude: state.currentGps.longitude,
        timestamp: state.lastGpsUpdateAt || new Date()
      } : null,
      routeProgress: state.routeProgress,
      remainingDistanceKm: state.distanceRemaining,
      speedKmph: state.currentGps ? state.currentGps.speed || 0 : 0,
      eta: {
        distanceRemainingKm: state.distanceRemaining,
        currentSpeedKmph: state.currentGps ? state.currentGps.speed || 0 : 0,
        nextVillage: state.nextStop ? {
          villageName: state.nextStop
        } : null,
        etaToNextVillageMinutes: state.etaToNextStop,
        etaToCollegeMinutes: state.etaToDestination,
        toNextVillageLabel: `${state.etaToNextStop} min`,
        toCollegeLabel: `${state.etaToDestination} min`
      },
      nextVillage: state.nextStop ? {
        villageName: state.nextStop
      } : null,
      lastUpdatedAt: state.lastGpsUpdateAt || null
    });
  } catch (error) {
    return badRequest(res, error);
  }
}

export async function getActiveBusesController(req, res) {
  try {
    const data = await getActiveBuses();
    return res.json(data);
  } catch (error) {
    return badRequest(res, error);
  }
}

