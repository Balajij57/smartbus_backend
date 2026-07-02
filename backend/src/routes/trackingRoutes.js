import { Router } from 'express';
import {
  getCurrentBusLocationController,
  getEtaController,
  getRouteProgressController,
  getTrackingSnapshotController,
  getTripHistoryController,
  getVillageStatusController,
  startTripController,
  stopTripController,
  updateLocationController,
  syncLocationHistoryController,
  getActiveBusesController,
  getActiveTripController,
} from '../controllers/trackingController.js';
import { authenticateToken, requireDriver } from '../middleware/auth.js';

const router = Router();

router.get('/trips/active', authenticateToken, requireDriver, getActiveTripController);
router.post('/trips/start', authenticateToken, requireDriver, startTripController);
router.post('/trips/:tripId/stop', authenticateToken, requireDriver, stopTripController);
router.post('/trips/:tripId/location', authenticateToken, requireDriver, updateLocationController);
router.post('/trips/:tripId/sync', authenticateToken, requireDriver, syncLocationHistoryController);

router.get('/tracking/active-buses', getActiveBusesController);
router.get('/tracking/bus/:busId/current', getCurrentBusLocationController);

router.get('/tracking/bus/:busId/progress', getRouteProgressController);
router.get('/tracking/bus/:busId/eta', getEtaController);
router.get('/tracking/bus/:busId/villages', getVillageStatusController);
router.get('/tracking/bus/:busId/snapshot', getTrackingSnapshotController);
router.get('/trips/history/:busId', getTripHistoryController);

export default router;
