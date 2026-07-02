import { Router } from 'express';
import { Bus } from '../models/Bus.js';
import { Route } from '../models/Route.js';

const router = Router();

import fs from 'fs';
import path from 'path';

router.get('/tracking/meta/buses', async (_req, res) => {
  try {
    const buses = await Bus.find().sort({ busNumber: 1 }).lean();
    const routes = await Route.find().lean();
    
    let drivers = [];
    try {
      const dbPath = path.join(process.cwd(), 'db.json');
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        drivers = db.drivers || [];
      }
    } catch (err) {
      console.error('Error reading db.json in metaRoutes:', err);
    }

    const result = buses.map(bus => {
      const route = routes.find(r => r.routeId === bus.routeId);
      const driver = drivers.find(d => d.bus_id === bus.busId || d.bus_number === bus.busNumber || d.driver_id === bus.driverId);
      return {
        ...bus,
        routeName: route ? route.routeName : bus.routeId,
        assignedDriver: driver ? driver.name : (bus.driverId || 'Not Assigned')
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tracking/meta/routes/:routeId', async (req, res) => {
  const route = await Route.findOne({ routeId: req.params.routeId }).lean();
  if (!route) return res.status(404).json({ error: 'Route not found' });
  return res.json(route);
});

export default router;
