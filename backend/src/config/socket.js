let ioInstance = null;

export function setIO(io) {
  ioInstance = io;
}

export function getIO() {
  if (!ioInstance) throw new Error('Socket.IO not initialized');
  return ioInstance;
}

export function emitBusUpdate(payload) {
  if (!ioInstance) return;
  ioInstance.to(`bus:${payload.busId}`).emit('bus:location', payload);
  ioInstance.to(`bus:${payload.busId}`).emit('bus-update', payload);
}

import { verifyToken } from '../middleware/auth.js';
import { Bus } from '../models/Bus.js';
import { Student } from '../models/Student.js';

export function registerSocketHandlers(io) {
  // Connection auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }
    const user = verifyToken(token);
    if (!user) {
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('tracking:join-bus', async (busId) => {
      if (!busId) return;

      try {
        const user = socket.user;
        let isAuthorized = false;

        if (user.role === 'admin') {
          isAuthorized = true;
        } else if (user.role === 'driver') {
          const bus = await Bus.findOne({ busId });
          if (bus && (bus.driverId === user.id || bus.driverId === user.username)) {
            isAuthorized = true;
          }
        } else if (user.role === 'parent') {
          const buses = await Bus.find({ busId });
          const busNumbers = buses.map(b => b.busNumber);
          const student = await Student.findOne({
            parent_id: user.id,
            $or: [
              { 'bus_details.bus_id': busId },
              { 'bus_details.bus_number': { $in: busNumbers } },
              { busNumber: { $in: busNumbers } }
            ]
          });
          if (student) {
            isAuthorized = true;
          }
        } else if (user.role === 'student') {
          const buses = await Bus.find({ busId });
          const busNumbers = buses.map(b => b.busNumber);
          const student = await Student.findOne({
            _id: user.id,
            $or: [
              { 'bus_details.bus_id': busId },
              { 'bus_details.bus_number': { $in: busNumbers } },
              { busNumber: { $in: busNumbers } }
            ]
          });
          if (student) {
            isAuthorized = true;
          }
        }

        if (isAuthorized) {
          socket.join(`bus:${busId}`);
          socket.emit('tracking:join-success', { busId });
          console.log(`[SOCKET AUTH] User ${user.id} (${user.role}) joined bus:${busId}`);
        } else {
          socket.emit('tracking:join-error', { busId, error: 'Unauthorized room access' });
          console.warn(`[SOCKET UNAUTHORIZED] User ${user.id} (${user.role}) blocked from joining bus:${busId}`);
        }
      } catch (err) {
        console.error('Error in tracking:join-bus verification:', err);
        socket.emit('tracking:join-error', { busId, error: 'Internal validation error' });
      }
    });

    socket.on('tracking:leave-bus', (busId) => {
      if (!busId) return;
      socket.leave(`bus:${busId}`);
    });
  });
}
