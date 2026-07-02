import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../ui';
import { api } from '../../lib/api';

type Props = {
  active: boolean;
  tripId?: string | null;
  busId?: string | null;
  intervalMs?: number;
  onLocation: (payload: { latitude: number; longitude: number; speed: number; heading: number; accuracy: number; timestamp: string }) => Promise<void> | void;
};

// Haversine formula to compute distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Development-only logger
function devLog(...args: any[]) {
  if (import.meta.env.DEV) {
    console.log('[GPS_DEV]', ...args);
  }
}

export default function LiveLocationSender({ active, tripId, busId, onLocation }: Props) {
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const queueTimerRef = useRef<number | null>(null);

  // States for GPS metadata
  const [permission, setPermission] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [networkOnline, setNetworkOnline] = useState<boolean>(navigator.onLine);
  const [simulate, setSimulate] = useState<boolean>(true);
  const simulationIndexRef = useRef<number>(0);
  const simulationIntervalRef = useRef<any>(null);
  
  // Real-time metrics
  const [latestPoint, setLatestPoint] = useState<{ latitude: number; longitude: number; speed: number; heading: number; accuracy: number; timestamp: string } | null>(null);
  const latestPointRef = useRef<{ latitude: number; longitude: number; speed: number; heading: number; accuracy: number; timestamp: string } | null>(null);
  const [packetsSent, setPacketsSent] = useState<number>(0);
  const [packetsFailed, setPacketsFailed] = useState<number>(0);
  const [queueSize, setQueueSize] = useState<number>(0);
  const [lastSyncText, setLastSyncText] = useState<string>('Never');

  // Tracking references for optimization & state preservation
  const lastUploadedPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastUploadedTimeRef = useRef<number>(0);
  const lastPointsRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const backoffTimeRef = useRef<number>(2000); // starts at 2 seconds
  const isSyncingQueueRef = useRef<boolean>(false);

  // Refs for current props to avoid unneeded watcher restarts
  const onLocationRef = useRef(onLocation);
  const tripIdRef = useRef(tripId);
  const busIdRef = useRef(busId);

  useEffect(() => { onLocationRef.current = onLocation; }, [onLocation]);
  useEffect(() => { tripIdRef.current = tripId; }, [tripId]);
  useEffect(() => { busIdRef.current = busId; }, [busId]);

  // Sync state with local storage queue size
  const updateQueueSizeUI = () => {
    if (!tripIdRef.current) {
      setQueueSize(0);
      return;
    }
    const storedKey = `offline_gps_${tripIdRef.current}`;
    const stored = localStorage.getItem(storedKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setQueueSize(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setQueueSize(0);
      }
    } else {
      setQueueSize(0);
    }
  };

  // Sync text updater
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastUploadedTimeRef.current === 0) {
        setLastSyncText('Never');
      } else {
        const secs = Math.max(0, Math.floor((Date.now() - lastUploadedTimeRef.current) / 1000));
        setLastSyncText(`${secs}s ago`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Network State Listeners
  useEffect(() => {
    const handleOnline = () => {
      setNetworkOnline(true);
      devLog('Connection recovered. Online.');
    };
    const handleOffline = () => {
      setNetworkOnline(false);
      devLog('Connection lost. Offline.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Screen Wake Lock API integration
  useEffect(() => {
    async function requestWakeLock() {
      if ('wakeLock' in navigator && active) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          devLog('Wake lock acquired');
        } catch (err) {
          console.warn('Wake lock request failed:', err);
        }
      }
    }
    requestWakeLock();
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
          devLog('Wake lock released');
        });
      }
    };
  }, [active]);

  // Bulk offline telemetry sync logic
  const syncOfflineQueue = async () => {
    if (isSyncingQueueRef.current || !networkOnline || !tripIdRef.current || !busIdRef.current) return;
    const storedKey = `offline_gps_${tripIdRef.current}`;
    const stored = localStorage.getItem(storedKey);
    if (!stored) return;

    try {
      const buffer = JSON.parse(stored);
      if (!Array.isArray(buffer) || buffer.length === 0) return;

      isSyncingQueueRef.current = true;
      devLog(`Syncing offline queue. Packets count: ${buffer.length}`);

      // Deduplicate coordinates in queue
      const uniqueBuffer: typeof buffer = [];
      buffer.forEach((pt) => {
        if (uniqueBuffer.length === 0) {
          uniqueBuffer.push(pt);
        } else {
          const last = uniqueBuffer[uniqueBuffer.length - 1];
          const dist = getDistanceMeters(last.latitude, last.longitude, pt.latitude, pt.longitude);
          if (dist > 2) { // Only keep if moved > 2m in historical queue
            uniqueBuffer.push(pt);
          }
        }
      });

      await api.syncTripLocations(tripIdRef.current, busIdRef.current, uniqueBuffer);
      localStorage.removeItem(storedKey);
      setPacketsSent((prev) => prev + uniqueBuffer.length);
      lastUploadedTimeRef.current = Date.now();
      updateQueueSizeUI();
      devLog('Offline telemetry queue synced successfully.');
    } catch (err) {
      devLog('Offline sync failed, will retry later:', err);
    } finally {
      isSyncingQueueRef.current = false;
    }
  };

  // Run bulk offline sync on connect
  useEffect(() => {
    if (networkOnline && active) {
      syncOfflineQueue();
    }
  }, [networkOnline, active]);

  // Periodic retry loop for queue (every 5 seconds)
  useEffect(() => {
    if (active) {
      queueTimerRef.current = window.setInterval(() => {
        if (networkOnline) {
          syncOfflineQueue();
        }
      }, 5000);
    }
    return () => {
      if (queueTimerRef.current) {
        clearInterval(queueTimerRef.current);
        queueTimerRef.current = null;
      }
    };
  }, [active, networkOnline]);

  // GPS WatchPosition tracker loop (Acquisition only, continuous in background)
  useEffect(() => {
    if (!active) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        devLog('watchPosition cleared');
      }
      return;
    }

    if (!navigator.geolocation) {
      devLog('Geolocation not supported');
      return;
    }

    devLog('Initializing watchPosition continuous tracker');
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        setPermission('granted');

        const rawLat = position.coords.latitude;
        const rawLng = position.coords.longitude;
        const speedKmph = Math.max(0, (position.coords.speed || 0) * 3.6);
        const heading = position.coords.heading || 0;
        const accuracy = position.coords.accuracy || 10;
        const timestamp = new Date(position.timestamp).toISOString();

        // 1. Accuracy Filter (Rule: reject accuracy > 30m)
        if (accuracy > 30) {
          devLog(`Packet rejected. Poor accuracy: ${accuracy.toFixed(1)}m`);
          return;
        }

        // 2. Prevent Jitter & Apply Smoothing (Running average of last 3 valid points)
        lastPointsRef.current.push({ latitude: rawLat, longitude: rawLng });
        if (lastPointsRef.current.length > 3) {
          lastPointsRef.current.shift();
        }
        const smoothedLat = lastPointsRef.current.reduce((sum, p) => sum + p.latitude, 0) / lastPointsRef.current.length;
        const smoothedLng = lastPointsRef.current.reduce((sum, p) => sum + p.longitude, 0) / lastPointsRef.current.length;

        const point = {
          latitude: smoothedLat,
          longitude: smoothedLng,
          speed: speedKmph,
          heading,
          accuracy,
          timestamp
        };

        setLatestPoint(point);
        latestPointRef.current = point;
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setPermission('denied');
        }
        devLog(`watchPosition callback error: ${error.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        devLog('watchPosition cleared on effect cleanup');
      }
    };
  }, [active]);

  // Decoupled periodic 3-second transmission loop (Fixed interval, no adaptive delays or distance checks)
  useEffect(() => {
    if (!active) {
      if (simulationIntervalRef.current != null) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
        devLog('Simulation interval cleared');
      }
      return;
    }

    devLog('Initializing periodic 3-second transmission loop');

    const PATH = [
      { latitude: 17.0453, longitude: 82.1692, speed: 25 }, // Pakala
      { latitude: 17.0480, longitude: 82.1695, speed: 35 },
      { latitude: 17.0500, longitude: 82.1700, speed: 40 }, // Village A
      { latitude: 17.0515, longitude: 82.1720, speed: 45 },
      { latitude: 17.0530, longitude: 82.1740, speed: 30 }, // Village B
      { latitude: 17.0545, longitude: 82.1750, speed: 20 },
      { latitude: 17.0560, longitude: 82.1760, speed: 35 }, // Village C
      { latitude: 17.0575, longitude: 82.1710, speed: 15 },
      { latitude: 17.0585, longitude: 82.1665, speed: 0 },  // Aditya University
    ];

    const timer = setInterval(() => {
      if (simulate) {
        const point = PATH[simulationIndexRef.current];
        const timestamp = new Date().toISOString();
        const payload = {
          latitude: point.latitude,
          longitude: point.longitude,
          speed: point.speed,
          heading: 0,
          accuracy: 5,
          timestamp
        };
        setLatestPoint(payload);
        transmitLocation(payload);

        // Advance to next point on the route
        if (simulationIndexRef.current < PATH.length - 1) {
          simulationIndexRef.current += 1;
        } else {
          // Loop back to start once we reach college
          simulationIndexRef.current = 0;
        }
      } else {
        if (latestPointRef.current) {
          // Keep timestamp fresh for each transmission
          const payload = {
            ...latestPointRef.current,
            timestamp: new Date().toISOString()
          };
          transmitLocation(payload);
        } else {
          devLog('Waiting for initial GPS lock before transmitting...');
        }
      }
    }, 3000);

    return () => {
      clearInterval(timer);
    };
  }, [active, simulate]);

  // Single packet uploader with Exponential Backoff retry
  const transmitLocation = async (payload: { latitude: number; longitude: number; speed: number; heading: number; accuracy: number; timestamp: string }) => {
    if (!tripIdRef.current || !busIdRef.current) return;
    
    try {
      devLog(`Uploading GPS coordinate: ${payload.latitude.toFixed(5)}, ${payload.longitude.toFixed(5)}`);
      await onLocationRef.current(payload);
      
      // Success triggers reset of backoff and updates tracking refs
      lastUploadedPosRef.current = { latitude: payload.latitude, longitude: payload.longitude };
      lastUploadedTimeRef.current = Date.now();
      backoffTimeRef.current = 2000; // reset backoff
      setPacketsSent((prev) => prev + 1);
      devLog('GPS packet uploaded successfully.');
      
      // Print the requested verification log
      const timeStr = new Date().toTimeString().split(' ')[0];
      console.log(`[GPS] Upload successful - ${timeStr}`);
    } catch (err) {
      setPacketsFailed((prev) => prev + 1);
      devLog(`GPS upload failed. Error details: ${err}`);
      
      // Save failed packet to queue and scale up backoff
      bufferLocationLocally(payload);
      
      // Exponential backoff adjustment: 2s -> 4s -> 8s -> 16s -> max 30s
      backoffTimeRef.current = Math.min(30000, backoffTimeRef.current * 2);
      devLog(`Increasing backoff delay to: ${backoffTimeRef.current}ms`);
    }
  };

  // Offline queue helper
  const bufferLocationLocally = (payload: any) => {
    if (!tripIdRef.current) return;
    const storedKey = `offline_gps_${tripIdRef.current}`;
    const stored = localStorage.getItem(storedKey);
    let buffer = [];
    try {
      buffer = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(buffer)) buffer = [];
    } catch {
      buffer = [];
    }

    // Ignore duplicate entries
    if (buffer.length > 0) {
      const last = buffer[buffer.length - 1];
      const dist = getDistanceMeters(last.latitude, last.longitude, payload.latitude, payload.longitude);
      if (dist < 2) {
        devLog('Skipping local buffering for duplicate coordinate.');
        return;
      }
    }

    buffer.push(payload);
    localStorage.setItem(storedKey, JSON.stringify(buffer));
    updateQueueSizeUI();
    devLog(`Buffered telemetry coordinate locally. Queue size: ${buffer.length}`);
  };

  // Clean local queue indicator on mount/unmount
  useEffect(() => {
    updateQueueSizeUI();
  }, [tripId]);

  // Accuracy level categorizer
  const getAccuracyCategory = (acc: number) => {
    if (acc <= 10) return { text: 'Excellent', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (acc <= 20) return { text: 'Good', color: 'bg-teal-100 text-teal-700 border-teal-200' };
    if (acc <= 30) return { text: 'Fair', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { text: 'Poor (Filtered)', color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };

  const accuracyMeta = latestPoint ? getAccuracyCategory(latestPoint.accuracy) : null;

  return (
    <Card className="border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${active && networkOnline ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
          GPS Transceiver Diagnostics
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer bg-slate-100 px-2 py-1 rounded border border-slate-200 hover:bg-slate-200 select-none">
            <input
              type="checkbox"
              checked={simulate}
              onChange={(e) => {
                setSimulate(e.target.checked);
                simulationIndexRef.current = 0;
              }}
              className="accent-blue-600 rounded"
            />
            🤖 Simulate GPS
          </label>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${networkOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            {networkOnline ? '● Connected' : '○ Offline'}
          </span>
        </div>
      </div>

      <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
        <DiagnosticCell label="Status" value={active ? (networkOnline ? 'Live' : 'Buffered') : 'Stopped'} color={active ? 'text-slate-800' : 'text-slate-400'} />
        <DiagnosticCell label="Last Sync" value={lastSyncText} color="text-slate-700" />
        <DiagnosticCell label="Packets Sent" value={String(packetsSent)} color="text-emerald-600" />
        <DiagnosticCell label="Packets Failed" value={String(packetsFailed)} color={packetsFailed > 0 ? 'text-rose-600' : 'text-slate-500'} />
        <DiagnosticCell label="Queued Packets" value={String(queueSize)} color={queueSize > 0 ? 'text-amber-600 font-bold' : 'text-slate-500'} />
        <DiagnosticCell label="Current Speed" value={latestPoint ? `${Math.round(latestPoint.speed)} km/h` : '—'} color="text-blue-600" />
      </div>

      {latestPoint && (
        <div className="mt-4 pt-3.5 border-t border-slate-100 grid gap-3 sm:grid-cols-2 items-center">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Coordinate:</span>
            <span>{latestPoint.latitude.toFixed(5)}, {latestPoint.longitude.toFixed(5)}</span>
          </div>
          <div className="flex sm:justify-end items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700">Accuracy:</span>
            <span className="text-slate-600">{latestPoint.accuracy.toFixed(1)}m</span>
            {accuracyMeta && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${accuracyMeta.color}`}>
                {accuracyMeta.text}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function DiagnosticCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-slate-50/50 p-2.5 border border-slate-100/50">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-black tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
