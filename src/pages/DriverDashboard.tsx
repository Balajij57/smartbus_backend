// @ts-nocheck
import { useCallback, useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, type ScanLog, type Student, type TrackingBus, type TrackingTrip } from '../lib/api';
import { getSocket } from '../lib/socket';
import DashboardLayout from '../components/DashboardLayout';
import { Button, Card, Empty, Modal, Section, Badge } from '../components/ui';
import { cn } from '../utils/cn';
import StartTrip from '../components/tracking/StartTrip';
import StopTrip from '../components/tracking/StopTrip';
import LiveLocationSender from '../components/tracking/LiveLocationSender';
import TrackBus from '../components/tracking/TrackBus';
import DriverCameraScanner from '../components/tracking/DriverCameraScanner';

const NAV = [
  { id: 'tracking', label: 'Live Tracking', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 12h18M12 3l9 9-9 9" /></svg> },
  { id: 'scanner', label: 'QR Scanner', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M12 4v1m0 14v1m8-8h-1m-14 0H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg> },
  { id: 'today', label: 'Today\'s Students', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { id: 'profile', label: 'My Profile', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><circle cx="12" cy="7" r="4" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" /></svg> },
];

const DELAY_OPTIONS = [
  { id: 'fuel', label: 'Run out of fuel', icon: '⛽' },
  { id: 'breakdown', label: 'Bus breakdown', icon: '🔧' },
  { id: 'puncture', label: 'Tyre puncture', icon: '🛞' },
  { id: 'traffic', label: 'Heavy traffic', icon: '🚦' },
];

const EMERGENCY_OPTIONS = [
  { id: 'fire', label: 'Fire caught', icon: '🔥' },
  { id: 'accident', label: 'Accident', icon: '🚨' },
  { id: 'medical', label: 'Medical emergency', icon: '🏥' },
  { id: 'other', label: 'Other emergency', icon: '⚠️' },
];

export default function DriverDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('tracking');
  const [scans, setScans] = useState<ScanLog[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [alertModal, setAlertModal] = useState<null | 'Delay' | 'Emergency'>(null);
  const [trackingBus, setTrackingBus] = useState<TrackingBus | null>(null);
  const [activeTrip, setActiveTrip] = useState<TrackingTrip | null>(null);
  const [trackingState, setTrackingState] = useState<any>(null);
  const [lastSuccessfulGpsTime, setLastSuccessfulGpsTime] = useState<number>(Date.now());

  useEffect(() => {
    if (!user?.driver?.bus_number) return;
    const socket = getSocket();
    
    // Clear stale tracking state on mount
    setTrackingState(null);
    
    // Fetch fresh state on mount
    api.getTrackingState(user.driver.bus_number).then((res) => {
      setTrackingState(res);
      if (res && res.lastGpsUpdateAt && res.serverTime) {
        const age = new Date(res.serverTime).getTime() - new Date(res.lastGpsUpdateAt).getTime();
        setLastSuccessfulGpsTime(Date.now() - age);
      }
    }).catch(console.error);

    const handler = (payload: any) => {
      if (payload && payload.busNumber === user.driver?.bus_number) {
        // Replace entire trackingState object on every update
        setTrackingState(payload);
        if (payload.lastGpsUpdateAt && payload.serverTime) {
          const age = new Date(payload.serverTime).getTime() - new Date(payload.lastGpsUpdateAt).getTime();
          setLastSuccessfulGpsTime(Date.now() - age);
        }
      }
    };

    socket.off('bus:location', handler);
    socket.off('bus-update', handler);
    socket.on('bus:location', handler);
    socket.on('bus-update', handler);

    return () => {
      socket.off('bus:location', handler);
      socket.off('bus-update', handler);
    };
  }, [user]);

  useEffect(() => {
    if (!trackingBus?.busId) return;
    const socket = getSocket();
    socket.emit('tracking:join-bus', trackingBus.busId);
    return () => {
      socket.emit('tracking:leave-bus', trackingBus.busId);
    };
  }, [trackingBus?.busId]);


  const [busCapacity, setBusCapacity] = useState(40);
  const [tripHistory, setTripHistory] = useState<TrackingTrip[]>([]);
  const [trackingError, setTrackingError] = useState('');
  const [trackingMessage, setTrackingMessage] = useState('');
  const [routeVillages, setRouteVillages] = useState([]);
  const [startVillageId, setStartVillageId] = useState('');

  // Scanner States
  const [scannerOn, setScannerOn] = useState(false);
  const [scanMode, setScanMode] = useState<'Morning Boarding' | 'College Arrival' | 'College Boarding' | 'Home Drop-Off'>('Morning Boarding');
  const [selectedDirection, setSelectedDirection] = useState<'to_college' | 'from_college' | ''>('');
  const [activeCamera, setActiveCamera] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [lastScannedStudent, setLastScannedStudent] = useState<Student | null>(null);
  const [lastScannedLog, setLastScannedLog] = useState<ScanLog | null>(null);
  const [scannerSuccess, setScannerSuccess] = useState('');
  const [tripCompletedState, setTripCompletedState] = useState(false);
  const [successCardData, setSuccessCardData] = useState<{
    studentName: string;
    registerNo: string;
    scanMode: string;
    tripType: string;
    time: string;
    smsStatus: string;
  } | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [scanStatusMessage, setScanStatusMessage] = useState('');
  const [scanInProgress, setScanInProgress] = useState(false);
  const scanCooldownsRef = useRef<Record<string, number>>({});
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scanAttemptsRef = useRef<number[]>([]);
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const isGpsHealthy = !activeTrip || (
    !!trackingState?.lastGpsUpdateAt && 
    (Date.now() - lastSuccessfulGpsTime <= 30000)
  );

  // Auto scanner mode updater
  useEffect(() => {
    if (activeTrip) {
      if (activeTrip.direction === 'to_college') {
        if (scanMode !== 'Morning Boarding' && scanMode !== 'College Arrival') {
          setScanMode('Morning Boarding');
        }
      } else if (activeTrip.direction === 'from_college') {
        if (scanMode !== 'College Boarding' && scanMode !== 'Home Drop-Off') {
          setScanMode('College Boarding');
        }
      }
    }
  }, [activeTrip, scanMode]);



  // Handle Scan logic
  const handleScan = async (qrValue: string) => {
    if (scanInProgress) {
      console.warn('[SCAN IN PROGRESS] Ignored concurrent scan for:', qrValue);
      return;
    }

    // Client-side rate limiter: throttle scan attempts to 10/second
    const nowTimestamp = Date.now();
    scanAttemptsRef.current = scanAttemptsRef.current.filter(t => nowTimestamp - t < 1000);
    if (scanAttemptsRef.current.length >= 10) {
      console.warn('[RATE LIMIT] Scan attempts exceeded 10 per second');
      setScannerError("Rate limit exceeded. Too many scan attempts.");
      return;
    }
    scanAttemptsRef.current.push(nowTimestamp);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (!activeTrip) {
      setScannerError("Start a trip before scanning students.");
      setScanStatus('error');
      setScanStatusMessage("No active trip");
      playAudioFeedback(false, "No active trip");
      scanTimeoutRef.current = setTimeout(() => {
        setScanStatus('idle');
        setScanStatusMessage('');
      }, 3000);
      return;
    }

    // Cooldown check (reduced from 5s to 3s)
    const lastScanTime = scanCooldownsRef.current[qrValue] || 0;
    const targetStudent = students.find(s => s.qr_student_id === qrValue || s._id === qrValue);
    const studentId = targetStudent?._id || qrValue;
    const lastScanTimeById = scanCooldownsRef.current[studentId] || 0;
    
    if (nowTimestamp - lastScanTime < 3000 || nowTimestamp - lastScanTimeById < 3000) {
      console.log('[COOLDOWN ACTIVE] Ignored duplicate scan for:', qrValue);
      setScanStatus('error');
      setScanStatusMessage('Already Scanned');
      playAudioFeedback(false, 'Already Scanned');
      scanTimeoutRef.current = setTimeout(() => {
        setScanStatus('idle');
        setScanStatusMessage('');
      }, 3000);
      return;
    }

    let actionVal: 'board' | 'dropoff' = 'board';
    let directionVal: 'to_college' | 'from_college' = 'to_college';
    
    if (scanMode === 'Morning Boarding') {
      actionVal = 'board';
      directionVal = 'to_college';
    } else if (scanMode === 'College Arrival') {
      actionVal = 'dropoff';
      directionVal = 'to_college';
    } else if (scanMode === 'College Boarding') {
      actionVal = 'board';
      directionVal = 'from_college';
    } else if (scanMode === 'Home Drop-Off') {
      actionVal = 'dropoff';
      directionVal = 'from_college';
    }

    const scanId = `SCAN-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const studentName = targetStudent ? targetStudent.name : 'Unknown Student';
    const registerNo = targetStudent?.register_no || qrValue;
    const tripType = directionVal === 'to_college' ? 'Morning Trip' : 'Evening Trip';

    let latitude = 0;
    let longitude = 0;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 });
      });
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {}

    setScannerSuccess('');
    setScannerError('');

    let voiceMsg = '';
    if (scanMode === 'Morning Boarding') {
      voiceMsg = `${studentName} Boarded Successfully`;
    } else if (scanMode === 'College Arrival') {
      voiceMsg = `${studentName} Reached College Successfully`;
    } else if (scanMode === 'College Boarding') {
      voiceMsg = `${studentName} Boarded From College Successfully`;
    } else if (scanMode === 'Home Drop-Off') {
      const stopName = targetStudent?.bus_details?.boarding_point || targetStudent?.boardingPoint || 'Home';
      voiceMsg = `${studentName} Reached ${stopName} Successfully`;
    }

    setScanInProgress(true);
    try {
      const res = await api.scan(
        studentId,
        actionVal,
        trackingBus?.busNumber || driver?.bus_number,
        scanId,
        scanMode,
        latitude,
        longitude,
        directionVal,
        driver.driver_id,
        activeTrip?.tripId || undefined
      );

      console.log('[SCAN SUCCESS]', scanId);
      scanCooldownsRef.current[qrValue] = nowTimestamp;
      scanCooldownsRef.current[studentId] = nowTimestamp;

      // Print verification log for the client
      const timeStr = new Date().toTimeString().split(' ')[0];
      console.log(`[SCAN SUCCESS LOG] Student ${studentName} (${registerNo}) scanned successfully - ${timeStr}`);

      const smsStat = res?.sms?.status || res?.log?.smsStatus || res?.attendance?.smsStatus || 'sent';
      playAudioFeedback(true, voiceMsg);
      setScanStatus('success');
      setScanStatusMessage(smsStat === 'delivered' ? 'SMS Delivered' : smsStat === 'failed' ? 'SMS Failed' : 'SMS Sent');
      scanTimeoutRef.current = setTimeout(() => {
        setScanStatus('idle');
        setScanStatusMessage('');
      }, 3000);

      setLastScannedStudent(targetStudent || null);
      
      const timeStrFormatted = new Date(nowTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      setLastScannedLog({
        id: scanId,
        student_id: studentId,
        student_name: studentName,
        register_no: registerNo,
        action: actionVal,
        scanMode,
        tripType,
        latitude,
        longitude,
        bus_number: trackingBus?.busNumber || driver?.bus_number,
        time: timeStrFormatted,
        date: new Date(nowTimestamp).toISOString().split('T')[0],
        created_at: new Date(nowTimestamp).toISOString(),
        smsStatus: res?.log?.smsStatus || res?.attendance?.smsStatus || 'sent'
      });

      setScannerSuccess(`Successfully scanned ${studentName} for ${scanMode}`);
      setSuccessCardData({
        studentName,
        registerNo,
        scanMode,
        tripType,
        time: timeStrFormatted,
        smsStatus: res?.log?.smsStatus === 'sent' ? 'Sent' : res?.log?.smsStatus || res?.attendance?.smsStatus || 'Sent'
      });

      setTimeout(() => {
        setScannerSuccess('');
        setSuccessCardData(null);
      }, 3000);

    } catch (err: any) {
      const displayError = err?.response?.message ?? err?.message ?? "Unexpected error occurred.";

      setScannerError(displayError);
      playAudioFeedback(false, displayError);
      setScanStatus('error');
      setScanStatusMessage(displayError);
      scanTimeoutRef.current = setTimeout(() => {
        setScanStatus('idle');
        setScanStatusMessage('');
      }, 3000);
    } finally {
      setScanInProgress(false);
    }
  };

  // Active Trip State Recovery and Sockets synchronization
  useEffect(() => {
    let gpsInterval: NodeJS.Timeout | null = null;

    const restoreActiveTrip = async () => {
      try {
        const trip = await api.getActiveTrip();
        if (trip && trip.status === 'active') {
          setActiveTrip(trip);
          setScanMode(trip.direction === 'to_college' ? 'Morning Boarding' : 'College Boarding');
          setScannerOn(trip.scannerEnabled || false);
          setTripCompletedState(false);
          console.log('📡 [Dashboard] Successfully restored active trip state:', trip.tripId);
        } else {
          setActiveTrip(null);
        }
      } catch (err) {
        console.error('[Dashboard Error] Failed to restore active trip state:', err);
      }
    };

    restoreActiveTrip();

    return () => {
      if (gpsInterval) clearInterval(gpsInterval);
    };
  }, []);

  useEffect(() => {
    if (!user?.driver) return;
    const load = () => {
      const today = new Date().toISOString().split('T')[0];
      api.listScans({ date: today }).then((all) => {
        const onBus = all.filter((s) => s.bus_number === user!.driver!.bus_number);
        setScans(onBus);
      }).catch(() => {});
      api.listStudents().then(setStudents).catch(() => {});
      api.listBuses().then((allBuses) => {
        const matchingBus = allBuses.find(b => b.bus_number === user!.driver!.bus_number);
        if (matchingBus) {
          setBusCapacity(matchingBus.capacity || 40);
        }
      }).catch(() => {});
      api.listTrackingBuses().then((buses) => {
        const bus = buses.find((b) => b.driverId === user!.driver!.driver_id) || buses.find((b) => b.busNumber === user!.driver!.bus_number);
        setTrackingBus(bus || null);
        if (bus?.busId) {
          api.getTripHistory(bus.busId).then(setTripHistory).catch(() => {});
          if (bus.busNumber || user?.driver?.bus_number) {
            const bNum = bus.busNumber || user.driver.bus_number;
            api.getBusRoute(bNum).then((res) => {
              if (res.routeExists && res.stops && res.stops.length > 0) {
                const totalStudents = res.stops.reduce((sum, stop) => {
                  if (stop.stopName.toLowerCase() === 'aditya university') return sum;
                  return sum + (stop.studentCount || 0);
                }, 0);
                if (totalStudents > 0) {
                  const mapped = res.stops.map(stop => ({
                    villageId: stop.stopName,
                    villageName: stop.stopName,
                    latitude: stop.latitude,
                    longitude: stop.longitude,
                    sequence: stop.sequence,
                    studentCount: stop.studentCount,
                    allowedRadiusMeters: stop.allowedRadiusMeters || 200,
                    landmark: stop.landmark || '',
                  }));
                  const ordered = [...mapped].sort((a, b) => a.sequence - b.sequence);
                  setRouteVillages(ordered);
                  setStartVillageId((prev) => prev || ordered[0]?.villageId || '');
                  return;
                }
              }
              setRouteVillages([]);
              setStartVillageId('');
            }).catch(() => {
              setRouteVillages([]);
              setStartVillageId('');
            });
          }
          if (bus.currentTripId) {
            api.getTripHistory(bus.busId).then((history) => {
              const active = history.find((t) => t.tripId === bus.currentTripId) || history.find((t) => t.status === 'active') || null;
              if (active && active.status === 'active') {
                setActiveTrip((prev) => {
                  if (!prev || prev.tripId !== active.tripId) {
                    setScannerOn(active.scannerEnabled || false);
                  }
                  return active;
                });
              } else {
                setActiveTrip(null);
                setScannerOn(false);
              }
            }).catch(() => {
              setActiveTrip(null);
              setScannerOn(false);
            });
          } else {
            setActiveTrip(null);
            setScannerOn(false);
          }
        }
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [user]);

  const driver = user?.driver;
  if (!user || user.role !== 'driver' || !driver) return <Navigate to="/" replace />;

  const today = new Date().toISOString().split('T')[0];
  const todayScans = scans.filter((s) => s.date === today);
  const boarded = todayScans.filter((s) => s.action === 'board');
  const dropped = todayScans.filter((s) => s.action === 'dropoff');

  // Compute live occupancy for the active trip only
  const activeTripScans = scans.filter((s) => activeTrip && s.trip_id === activeTrip.tripId);
  const activeTripBoarded = activeTripScans.filter((s) => s.action === 'board').length;
  const activeTripDropped = activeTripScans.filter((s) => s.action === 'dropoff').length;
  const currentOccupancy = Math.max(0, activeTripBoarded - activeTripDropped);

  const occupancyRatio = currentOccupancy / busCapacity;
  let occupancyColor = 'text-emerald-600';
  if (occupancyRatio >= 0.95) {
    occupancyColor = 'text-rose-600 font-black animate-pulse';
  } else if (occupancyRatio >= 0.8) {
    occupancyColor = 'text-amber-600 font-bold';
  }
  const studentMap = new Map(students.map((s) => [s._id, s]));

  const handleStartTrip = useCallback(async () => {
    try {
      setTrackingError('');
      if (!trackingBus?.busId) throw new Error('No bus is assigned to this driver yet');
      if (!selectedDirection) throw new Error('Please select a trip type first');
      const trip = await api.startTrip(trackingBus.busId, driver.driver_id, startVillageId || undefined, selectedDirection);
      setActiveTrip(trip);
      setTrackingMessage(`Trip started for ${trackingBus.busNumber}`);
      setTripCompletedState(false);
    } catch (e) {
      setTrackingError(e instanceof Error ? e.message : 'Unable to start trip');
    }
  }, [trackingBus, driver.driver_id, startVillageId, selectedDirection]);

  const handleStopTrip = useCallback(async () => {
    try {
      setTrackingError('');
      if (!trackingBus?.busId || !activeTrip?.tripId) throw new Error('No active trip to stop');
      
      try {
        await api.stopTrip(activeTrip.tripId, trackingBus.busId);
      } catch (err: any) {
        if (err.message && (err.message.includes('boarded student(s)') || err.message.includes('not arrived') || err.message.includes('not reached'))) {
          if (confirm(`${err.message}\n\nDo you want to stop the trip anyway? This will automatically mark all remaining boarded students as arrived.`)) {
            await api.stopTrip(activeTrip.tripId, trackingBus.busId, true);
          } else {
            return;
          }
        } else {
          throw err;
        }
      }

      setTrackingMessage(`Trip stopped for ${trackingBus.busNumber}`);
      setActiveTrip(null);
      setScannerOn(false);
      setLastScannedStudent(null);
      setLastScannedLog(null);
      setScannerSuccess('');
      setScannerError('');
      setScanStatus('idle');
      setScanStatusMessage('');
      setTripCompletedState(true);
      api.getTripHistory(trackingBus.busId).then(setTripHistory).catch(() => {});
    } catch (e) {
      setTrackingError(e instanceof Error ? e.message : 'Unable to stop trip');
    }
  }, [trackingBus, activeTrip]);

  const handleLocation = useCallback(async (payload: { latitude: number; longitude: number; speed: number; heading: number; timestamp: string }) => {
    if (!trackingBus?.busId || !activeTrip?.tripId) return;
    try {
      await api.updateTripLocation(activeTrip.tripId, { busId: trackingBus.busId, ...payload });
      setLastSuccessfulGpsTime(Date.now());
      setTrackingState((prev: any) => prev ? { 
        ...prev, 
        lastGpsUpdateAt: new Date().toISOString(), 
        serverTime: new Date().toISOString(),
        currentGps: { latitude: payload.latitude, longitude: payload.longitude },
        lastGpsAccuracy: payload.accuracy || 10
      } : prev);
    } catch (e) {
      setTrackingError(e instanceof Error ? e.message : 'Failed to send location');
    }
  }, [trackingBus, activeTrip]);

  const hasBusAssigned = !!trackingBus?.busId;

  return (
    <DashboardLayout title={`Welcome, ${driver.name}`} subtitle="Driver Dashboard" nav={NAV} active={tab} onChangeTab={setTab}>
      {/* Persistent GPS location sender running in the background across all tabs to prevent GPS server lost errors during QR scanning */}
      <div className={(tab === 'tracking' || tab === 'scanner') ? 'mb-6' : 'hidden'}>
        <LiveLocationSender active={!!activeTrip && activeTrip.status === 'active'} tripId={activeTrip?.tripId} busId={trackingBus?.busId} intervalMs={4000} onLocation={handleLocation} />
      </div>

      {tab === 'tracking' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned Bus</p>
              <p className="mt-2 text-3xl font-black text-blue-600">{trackingBus?.busNumber || driver.bus_number || 'Not Assigned'}</p>
              <p className="text-sm text-slate-500">{trackingBus?.routeId || driver.routeName || driver.route_name || '—'}</p>
            </Card>
            <Card>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trip Status</p>
              <p className="mt-2 text-3xl font-black text-emerald-600">{activeTrip ? 'ACTIVE' : 'INACTIVE'}</p>
              <p className="text-sm text-slate-500">{activeTrip ? new Date(activeTrip.startTime).toLocaleTimeString() : 'Ready to start'}</p>
            </Card>
            <Card>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Boarded Today</p>
              <p className="mt-2 text-3xl font-black text-cyan-600">{boarded.length}</p>
              <p className="text-sm text-slate-500">Students</p>
            </Card>
            <Card>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dropped Today</p>
              <p className="mt-2 text-3xl font-black text-violet-600">{dropped.length}</p>
              <p className="text-sm text-slate-500">Students</p>
            </Card>
          </div>

          {!hasBusAssigned ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <span className="text-4xl">🚌</span>
              <h3 className="mt-4 text-xl font-black text-slate-700">No bus assigned</h3>
              <p className="mt-2 text-sm text-slate-500">Please contact Admin.</p>
            </div>
          ) : (
            <>
              <Card>
                <Section title="Driver Tracking Module" action={
                  <div className="flex gap-2">
                    <StartTrip onStart={handleStartTrip} disabled={!!activeTrip || !trackingBus?.busId || !selectedDirection} />
                    <StopTrip onStop={handleStopTrip} disabled={!activeTrip} />
                  </div>
                }>
                  <p className="mb-4 text-sm text-slate-600">Select your starting village, then start the trip. GPS updates every 10–15 seconds while active. Parents and students see the bus move live on the map.</p>

                  {routeVillages.length === 0 && !activeTrip && (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      No active route assigned
                    </div>
                  )}

                  {routeVillages.length > 0 && !activeTrip && (
                    <div className="mb-4 space-y-4">
                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-blue-700">Trip Type Selection</label>
                        <select
                          value={selectedDirection}
                          onChange={(e) => setSelectedDirection(e.target.value as any)}
                          className="w-full rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                        >
                          <option value="">-- Select Trip Type --</option>
                          <option value="to_college">Trip 1 - Home → College</option>
                          <option value="from_college">Trip 2 - College → Home</option>
                        </select>
                      </div>

                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-blue-700">Starting Village</label>
                        <select
                          value={startVillageId}
                          onChange={(e) => setStartVillageId(e.target.value)}
                          className="w-full rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                        >
                          {routeVillages.map((v) => (
                            <option key={v.villageId} value={v.villageId}>
                              {v.villageName}{v.kind === 'college' ? ' (Destination)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-blue-700">
                          Route includes all stops from the selected village through Aditya University.
                        </p>
                      </div>
                    </div>
                  )}

                  {(trackingError || trackingMessage) && (
                    <div className={cn('mb-4 rounded-xl border px-4 py-3 text-sm font-medium', trackingError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                      {trackingError || trackingMessage}
                    </div>
                  )}
                </Section>
              </Card>

              {trackingBus?.busId ? <TrackBus busId={trackingBus.busId} busNumber={trackingBus.busNumber} /> : <Empty message="Assign a bus to this driver from the Admin dashboard to enable live tracking." />}
            </>
          )}

          <Card>
            <Section title="Trip Completion Summary / History">
              {tripHistory.length === 0 ? <Empty message="No trip history yet." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="py-3">Trip</th><th>Started</th><th>Ended</th><th>Status</th><th>Villages Crossed</th><th>Avg Speed</th></tr>
                    </thead>
                    <tbody>
                      {tripHistory.map((trip) => (
                        <tr key={trip.tripId} className="border-b border-slate-100">
                          <td className="py-3 font-mono text-xs">{trip.tripId}</td>
                          <td>{new Date(trip.startTime).toLocaleString()}</td>
                          <td>{trip.endTime ? new Date(trip.endTime).toLocaleString() : '—'}</td>
                          <td><Badge tone={trip.status === 'active' ? 'green' : 'slate'}>{trip.status}</Badge></td>
                          <td>{trip.routeProgress?.filter((v) => v.crossed).length || 0}</td>
                          <td>{trip.summary?.averageSpeedKmph != null ? `${trip.summary.averageSpeedKmph} km/h` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </Card>
        </div>
      )}

      {tab === 'scanner' && (
        <div className="space-y-6">
          {(!trackingBus?.busId || !activeTrip) ? (
            <div className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50 p-8 text-center">
              <span className="text-4xl">⚠️</span>
              <h3 className="mt-4 text-xl font-black text-rose-700">Scanner unavailable</h3>
              <p className="mt-2 text-sm text-rose-600">Complete bus assignment and start a trip.</p>
            </div>
          ) : trackingBus?.status === 'maintenance' ? (
            <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 p-8 text-center">
              <span className="text-4xl">🔧</span>
              <h3 className="mt-4 text-xl font-black text-amber-700">Bus is under maintenance</h3>
              <p className="mt-2 text-sm text-amber-600">Operations and scanning are disabled.</p>
            </div>
          ) : trackingBus?.status === 'inactive' ? (
            <div className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50 p-8 text-center">
              <span className="text-4xl">🚫</span>
              <h3 className="mt-4 text-xl font-black text-rose-700">Bus is inactive</h3>
              <p className="mt-2 text-sm text-rose-600">Activate the bus before starting operations.</p>
            </div>
          ) : (
            <>
              {scannerError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 flex justify-between items-center">
                  <span>⚠️ {scannerError}</span>
                  <button onClick={() => setScannerError('')} className="text-rose-500 hover:text-rose-700">✕</button>
                </div>
              )}
            </>
          )}

          {scannerSuccess && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 flex justify-between items-center">
              <span>✅ {scannerSuccess}</span>
              <button onClick={() => setScannerSuccess('')} className="text-emerald-500 hover:text-emerald-700">✕</button>
            </div>
          )}

          {/* QR Scanner Dashboard Details */}
          <Card>
            <Section title="QR Scanner Dashboard">
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Driver Name</p>
                  <p className="mt-1 text-lg font-black text-slate-800">{driver.name}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active Bus Number</p>
                  <p className="mt-1 text-lg font-black text-blue-600">{trackingBus?.busNumber || driver.bus_number || 'None'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active Trip Status</p>
                  <p className="mt-1 text-lg font-black text-emerald-600">{activeTrip ? 'ACTIVE' : 'INACTIVE'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trip Type</p>
                  <p className="mt-1 text-sm font-black text-violet-600">
                    {activeTrip 
                      ? (activeTrip.direction === 'to_college' ? 'Trip 1 - Home → College' : 'Trip 2 - College → Home') 
                      : 'None'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Route Direction Badge</p>
                  <div className="mt-1.5">
                    {activeTrip ? (
                      <Badge tone={activeTrip.direction === 'to_college' ? 'green' : 'violet'}>
                        {activeTrip.direction === 'to_college' ? 'Home → College' : 'College → Home'}
                      </Badge>
                    ) : (
                      <span className="text-sm font-bold text-slate-500">No Active Trip</span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Scanner Status</p>
                  <p className={cn(
                    "mt-1 text-lg font-black",
                    !activeTrip ? (tripCompletedState ? "text-slate-500" : "text-rose-500") : scannerOn ? "text-emerald-600 animate-pulse" : "text-amber-500"
                  )}>
                    {!activeTrip ? (tripCompletedState ? "Trip Completed" : "Disabled") : scannerOn ? "Scanning" : "Ready"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Live Occupancy</p>
                  <p className={cn("mt-1 text-lg font-black", occupancyColor)}>
                    {currentOccupancy} / {busCapacity}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Scans Today</p>
                  <p className="mt-1 text-lg font-black text-cyan-600">{scans.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last Scanned Student</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {lastScannedStudent ? `${lastScannedStudent.name} (${lastScannedStudent.register_no})` : 'None'}
                  </p>
                </div>
              </div>
            </Section>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <Section title="Scanner Controls">
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Scanner Status</p>
                      <p className={cn(
                        "mt-1 text-2xl font-black",
                        !activeTrip ? (tripCompletedState ? "text-slate-500" : "text-rose-500") : scannerOn ? "text-emerald-600 animate-pulse" : "text-amber-500"
                      )}>
                        {!activeTrip ? (tripCompletedState ? "Trip Completed" : "Disabled") : scannerOn ? "Scanning" : "Ready"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={scannerOn ? "outline" : "success"}
                        disabled={!activeTrip}
                        onClick={() => {
                          setScannerOn(true);
                          setScannerError('');
                        }}
                      >
                        Enable Scanner
                      </Button>
                      <Button
                        variant={scannerOn ? "danger" : "outline"}
                        disabled={!activeTrip}
                        onClick={() => {
                          setScannerOn(false);
                        }}
                      >
                        Disable Scanner
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Scanner Mode</label>
                    <select
                      value={scanMode}
                      disabled={!activeTrip}
                      onChange={(e) => {
                        setScanMode(e.target.value as any);
                        setScannerError('');
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                    >
                      {(!activeTrip || activeTrip.direction === 'to_college') && (
                        <>
                          <option value="Morning Boarding">Morning Boarding</option>
                          <option value="College Arrival">College Arrival</option>
                        </>
                      )}
                      {(!activeTrip || activeTrip.direction === 'from_college') && (
                        <>
                          <option value="College Boarding">College Boarding</option>
                          <option value="Home Drop-Off">Home Drop-Off</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Trip details validation alert */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trip Details Indicator</p>
                    <div className="space-y-1.5 text-xs text-slate-700">
                      <p><b>Current Trip:</b> {activeTrip ? (activeTrip.direction === 'to_college' ? 'Morning Trip' : 'Evening Trip') : 'None'}</p>
                      <p><b>Scanner Mode:</b> {scanMode}</p>
                      <p><b>Trip Direction:</b> {activeTrip ? activeTrip.direction : 'None'}</p>
                      <p><b>Current Stop:</b> {trackingState?.currentStop || activeTrip?.routeProgress?.find(v => !v.crossed)?.villageName || 'Destination reached'}</p>
                      <p><b>Current GPS Location:</b> {!isGpsHealthy ? <span className="text-rose-600 font-extrabold animate-pulse">⚠️ SIGNAL LOST (OFFLINE)</span> : activeTrip?.currentLocation ? `${activeTrip.currentLocation.latitude.toFixed(4)}, ${activeTrip.currentLocation.longitude.toFixed(4)}` : 'No GPS coordinate fixed'}</p>
                      <hr className="my-1 border-slate-200" />
                      <p><b>GPS Last Update:</b> {trackingState?.lastGpsUpdateAt ? new Date(trackingState.lastGpsUpdateAt).toLocaleTimeString() : 'Never'}</p>
                      <p><b>GPS Accuracy:</b> {trackingState?.lastGpsAccuracy ? `${trackingState.lastGpsAccuracy}m` : 'N/A'}</p>
                      <p><b>GPS Packets Sent:</b> {trackingState?.gpsPacketsReceived || 0} / Rejected: {trackingState?.gpsPacketsRejected || 0}</p>
                      {!isGpsHealthy && (
                        <p className="text-rose-600 font-extrabold animate-pulse mt-1 bg-rose-50 p-1.5 rounded border border-rose-200">
                          ⚠️ GPS telemetry not reaching server.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Section>
            </Card>

            <Card>
              <Section title="QR Live Capture">
                <div className="mb-3 space-y-1 rounded-xl border p-4 bg-slate-50 border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active Trip Info</p>
                  {activeTrip ? (
                    <div className="text-sm font-semibold text-slate-800">
                      <p><b>Trip Type:</b> {activeTrip.direction === 'to_college' ? 'Trip 1 - Home → College' : 'Trip 2 - College → Home'}</p>
                      <p><b>Direction:</b> {activeTrip.direction === 'to_college' ? 'to_college (Home → College)' : 'from_college (College → Home)'}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-black text-rose-600 animate-pulse">
                      Start a trip before scanning students.
                    </p>
                  )}
                </div>

                <DriverCameraScanner
                  active={activeTrip ? scannerOn : false}
                  onScan={activeTrip ? handleScan : () => {}}
                  onCameraDetected={setActiveCamera}
                  onError={(err) => {
                    setScannerError(err);
                    setScannerOn(false);
                  }}
                  onStop={() => setScannerOn(false)}
                  scanStatus={scanStatus}
                  scanStatusMessage={scanStatusMessage}
                  hasActiveTrip={!!activeTrip}
                  cooldownMs={3000}
                  busNumber={driver?.bus_number || activeTrip?.busNumber || trackingBus?.busNumber}
                />
                <div className="mt-3 text-xs text-slate-500">
                  <p>Current Scanner Device: <span className="font-bold text-slate-800">{activeCamera || 'None'}</span></p>
                </div>

                {successCardData && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2 text-slate-800 transition-all">
                    <div className="flex items-center gap-2 font-extrabold">
                      <span className="text-lg text-emerald-700">
                        ✓ Scan Successful
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <p><b>Student:</b> {successCardData.studentName}</p>
                      <p><b>Register No:</b> {successCardData.registerNo}</p>
                      <p><b>Action:</b> {successCardData.scanMode}</p>
                      <p><b>Trip:</b> {successCardData.tripType}</p>
                      <p><b>Time:</b> {successCardData.time}</p>
                      <p><b>SMS Status:</b> <span className="capitalize">{successCardData.smsStatus}</span></p>
                    </div>
                  </div>
                )}
              </Section>
            </Card>
          </div>

          {/* Quick simulation helper */}
          <Card>
            <details className="cursor-pointer">
              <summary className="text-sm font-bold text-slate-700">Simulate Scan (Without physical camera)</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {students.filter(s => s.bus_details?.bus_number === (trackingBus?.busNumber || driver.bus_number)).map(s => (
                  <button
                    key={s._id}
                    disabled={!activeTrip}
                    onClick={() => handleScan(s.qr_student_id)}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.register_no} (Status: {s.trackingStatus || 'REACHED_HOME'})</p>
                    </div>
                  </button>
                ))}
              </div>
            </details>
          </Card>

          <Card>
            <Section title="Scan History">
              {lastScannedLog ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last Scan</p>
                      <p className="text-lg font-black text-slate-800">{lastScannedLog.student_name}</p>
                      <p className="text-sm text-slate-500">{lastScannedLog.register_no}</p>
                    </div>
                    <Badge tone={lastScannedLog.smsStatus === 'sent' ? 'green' : 'violet'}>
                      {lastScannedLog.scanMode}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">GPS Coordinates:</span>
                      <span className="ml-1 font-mono text-slate-800">[{lastScannedLog.latitude?.toFixed(4) || 0}, {lastScannedLog.longitude?.toFixed(4) || 0}]</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Scan Time:</span>
                      <span className="ml-1 text-slate-800">{lastScannedLog.time}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Trip Type:</span>
                      <span className="ml-1 text-slate-800">{lastScannedLog.tripType}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">SMS Status:</span>
                      <span className="ml-1 text-slate-800">{lastScannedLog.smsStatus}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <Empty message="No scans performed during this dashboard session." />
              )}
            </Section>
          </Card>
        </div>
      )}

      {tab === 'today' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <Section title={`Boarded Students (${boarded.length})`}>
                {boarded.length === 0 ? <Empty message="No boardings yet today." /> : (
                  <div className="space-y-3">
                    {boarded.map((s) => {
                      const stu = studentMap.get(s.student_id);
                      return (
                        <div key={s.id} className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 font-black text-white">{s.student_name[0]}</span>
                            <div>
                              <p className="font-bold">{s.student_name}</p>
                              <p className="text-xs text-slate-600">{s.register_no} {stu && `· ${stu.year} - ${stu.section}`}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-emerald-700">{s.time}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </Card>

            <Card>
              <Section title={`Dropped Off (${dropped.length})`}>
                {dropped.length === 0 ? <Empty message="No drop-offs yet today." /> : (
                  <div className="space-y-3">
                    {dropped.map((s) => {
                      const stu = studentMap.get(s.student_id);
                      return (
                        <div key={s.id} className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 font-black text-white">{s.student_name[0]}</span>
                            <div>
                              <p className="font-bold">{s.student_name}</p>
                              <p className="text-xs text-slate-600">{s.register_no} {stu && `· ${stu.year} - ${stu.section}`}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-violet-700">{s.time}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </Card>
          </div>

          <Card>
            <Section title="Quick Actions — Notify Parents & Admin">
              <div className="grid gap-4 md:grid-cols-2">
                <button onClick={() => setAlertModal('Delay')} className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-8 text-left hover:bg-amber-100 transition">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white text-xl">⏱️</div>
                  <h3 className="text-xl font-black text-amber-700">Send Delay Alert</h3>
                  <p className="mt-1 text-sm text-amber-700/80">Fuel, breakdown, puncture, traffic and other bus-related issues.</p>
                </button>
                <button onClick={() => setAlertModal('Emergency')} className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-8 text-left hover:bg-rose-100 transition">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white text-xl">🚨</div>
                  <h3 className="text-xl font-black text-rose-700">Emergency SOS</h3>
                  <p className="mt-1 text-sm text-rose-700/80">Fire, accident, medical emergency and other unexpected problems.</p>
                </button>
              </div>
            </Section>
          </Card>
        </div>
      )}

      {tab === 'profile' && (
        <Card>
          <Section title="Driver Profile">
            <div className="grid gap-4 md:grid-cols-2">
              <Detail label="Name" value={driver.name} />
              <Detail label="Driver ID" value={driver.driver_id} />
              <Detail label="Phone" value={driver.phone} />
              <Detail label="License" value={driver.license} />
              <Detail label="Assigned Bus" value={trackingBus?.busNumber || driver.bus_number || 'Not assigned'} />
              <Detail label="Route" value={trackingBus?.routeId || driver.routeName || driver.route_name || '—'} />
            </div>
          </Section>
        </Card>
      )}

      <AlertModal type={alertModal} onClose={() => setAlertModal(null)} driverName={driver.name} driverId={driver.driver_id} bus={trackingBus?.busNumber || driver.bus_number} />
    </DashboardLayout>
  );
}

function AlertModal({ type, onClose, driverName, driverId, bus }: { type: 'Delay' | 'Emergency' | null; onClose: () => void; driverName: string; driverId: string; bus: string }) {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const options = type === 'Delay' ? DELAY_OPTIONS : EMERGENCY_OPTIONS;

  async function send() {
    if (!category) {
      alert('Please select a category first');
      return;
    }
    setLoading(true);
    try {
      await api.createAlert({
        type: type!,
        category,
        message: message.trim() || `${type} reported by driver ${driverName}: ${category}`,
        bus,
        driver_id: driverId,
        driver_name: driverName,
      });
      setSuccess(`✓ ${type} alert sent to parents and admin successfully!`);
      setTimeout(() => {
        setSuccess('');
        setCategory('');
        setMessage('');
        onClose();
      }, 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={!!type} onClose={onClose} title={type === 'Delay' ? 'Send Delay Alert' : 'Emergency SOS'} maxWidth="max-w-xl">
      {success ? (
        <div className="rounded-xl bg-emerald-50 p-6 text-center text-emerald-700 font-bold">{success}</div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">Select the {type === 'Delay' ? 'issue' : 'emergency'} type. A message will be sent to all parents on this bus and to the admin.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setCategory(opt.label)}
                className={cn('rounded-xl border-2 p-4 text-left transition', category === opt.label ? type === 'Delay' ? 'border-amber-500 bg-amber-50' : 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:bg-slate-50')}
              >
                <div className="text-2xl">{opt.icon}</div>
                <p className="mt-2 font-bold">{opt.label}</p>
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Additional Message (optional)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Add any details..." className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant={type === 'Delay' ? 'primary' : 'danger'} className="flex-1" onClick={send} disabled={loading || !category}>{loading ? 'Sending...' : `Send ${type} Alert`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-900">{value || '—'}</p>
    </div>
  );
}

function playAudioFeedback(ok: boolean, voiceMsg?: string) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ok) {
      // Double beep
      // First beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0.001, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);

      // Second beep after 150ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.value = 880;
      gain2.gain.setValueAtTime(0.001, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.27);
      
      setTimeout(() => ctx.close(), 500);
    } else {
      // Error buzz: low sawtooth or square wave
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.42);

      setTimeout(() => ctx.close(), 600);
    }
  } catch (e) {
    console.error('AudioContext error:', e);
  }

  if (voiceMsg && window.speechSynthesis) {
    // Cancel current speech to prevent queuing lag
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voiceMsg);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}
