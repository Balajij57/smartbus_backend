import { io, type Socket } from 'socket.io-client';
import { useState, useEffect } from 'react';

const SOCKET_URL = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl.replace(/\/api\/?$/, '');
  }
  // Fallback to localhost:5000 when running on localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5001';
  }
  return window.location.origin;
})();

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      autoConnect: true,
      auth: (cb) => {
        try {
          const raw = localStorage.getItem('sb-auth');
          if (raw) {
            const parsed = JSON.parse(raw);
            cb({ token: parsed.token || '' });
            return;
          }
        } catch {}
        cb({ token: '' });
      }
    });
  }
  return socket;
}

export function useSocketStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    setConnected(s.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}

