import { useEffect, useMemo, useState } from 'react';
import type { TrackingProgressVillage, TrackingSnapshot } from '../../lib/api';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import BusStatusCard from './BusStatusCard';
import ETAWidget from './ETAWidget';
import LiveRouteMap from './LiveRouteMap';
import VillageTracker from './VillageTracker';

function toPlannedVillages(villages: Array<{ villageId: string; villageName: string; latitude: number; longitude: number; sequence: number; kind?: string; radiusMeters?: number }>): TrackingProgressVillage[] {
  return [...villages]
    .sort((a, b) => a.sequence - b.sequence)
    .map((v, index) => ({
      ...v,
      radiusMeters: v.radiusMeters || 250,
      kind: (v.kind as TrackingProgressVillage['kind']) || 'village',
      crossed: false,
      crossedAt: null,
      status: index === 0 ? 'current' : 'pending',
    }));
}

export default function TrackBus({ busId, busNumber }: { busId: string; busNumber: string }) {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [plannedVillages, setPlannedVillages] = useState<TrackingProgressVillage[]>([]);
  const [hasActiveRoute, setHasActiveRoute] = useState<boolean | null>(null);
  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    let mounted = true;
    const checkRoute = () => {
      api.getBusRoute(busNumber).then((res) => {
        if (!mounted) return;
        if (res.routeExists && res.stops && res.stops.length > 0) {
          const totalStudents = res.stops.reduce((sum, stop) => {
            if (stop.stopName.toLowerCase() === 'aditya university') return sum;
            return sum + (stop.studentCount || 0);
          }, 0);
          
          if (totalStudents > 0) {
            setHasActiveRoute(true);
            const mapped = res.stops.map(stop => ({
              villageId: stop.stopName,
              villageName: stop.stopName,
              latitude: stop.latitude,
              longitude: stop.longitude,
              sequence: stop.sequence,
              studentCount: stop.studentCount,
              allowedRadiusMeters: stop.allowedRadiusMeters || 200,
              landmark: stop.landmark || '',
              kind: (stop.stopName.toLowerCase() === 'aditya university') ? 'college' : 'village',
              crossed: false,
              crossedAt: null,
              status: stop.sequence === 1 ? 'current' : 'pending'
            }));
            setPlannedVillages(mapped);
            return;
          }
        }
        setHasActiveRoute(false);
        setPlannedVillages([]);
      }).catch(() => {
        if (mounted) {
          setHasActiveRoute(false);
          setPlannedVillages([]);
        }
      });
    };

    checkRoute();
    const interval = setInterval(checkRoute, 7000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [busNumber]);

  useEffect(() => {
    let mounted = true;
    api.getTrackingSnapshot(busId).then((data) => mounted && setSnapshot(data)).catch(() => {});
    socket.emit('tracking:join-bus', busId);
    const handler = (payload: TrackingSnapshot & { busId: string }) => {
      if (payload.busId === busId) {
        setSnapshot((prev) => ({ ...(prev || {}), ...payload } as TrackingSnapshot));
      }
    };
    socket.off('bus:location', handler);
    socket.off('bus-update', handler);
    socket.on('bus:location', handler);
    socket.on('bus-update', handler);
    const t = setInterval(() => {
      api.getTrackingSnapshot(busId).then((data) => mounted && setSnapshot(data)).catch(() => {});
    }, 10000);
    return () => {
      mounted = false;
      clearInterval(t);
      socket.emit('tracking:leave-bus', busId);
      socket.off('bus:location', handler);
      socket.off('bus-update', handler);
    };
  }, [busId, socket]);

  useEffect(() => {
    if (snapshot?.routeProgress?.length) {
      setPlannedVillages([]);
      return;
    }

    let mounted = true;
    api
      .listTrackingBuses()
      .then((buses) => {
        const bus = buses.find((b) => b.busId === busId);
        if (!bus?.routeId) return null;
        return api.getTrackingRoute(bus.routeId);
      })
      .then((route) => {
        if (!mounted || !route) return;
        setPlannedVillages(toPlannedVillages(route.villages));
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [busId, snapshot?.routeProgress?.length]);

  const displayVillages = snapshot?.routeProgress?.length ? snapshot.routeProgress : plannedVillages;

  return (
    <div className="space-y-6">
      <BusStatusCard
        busNumber={busNumber}
        tripStatus={snapshot?.status || 'inactive'}
        speedKmph={snapshot?.speedKmph}
        lastUpdatedAt={snapshot?.lastUpdatedAt || snapshot?.currentLocation?.timestamp}
        currentLocationLabel={hasActiveRoute === false ? "No active route assigned" : (snapshot?.nextVillage ? `Next: ${snapshot.nextVillage.villageName}` : 'Waiting for trip')}
      />
      {hasActiveRoute !== false ? (
        <>
          <ETAWidget
            distanceRemainingKm={snapshot?.eta?.distanceRemainingKm ?? snapshot?.remainingDistanceKm}
            etaToNextVillageMinutes={snapshot?.eta?.etaToNextVillageMinutes}
            etaToCollegeMinutes={snapshot?.eta?.etaToCollegeMinutes}
            nextVillageName={snapshot?.nextVillage?.villageName || null}
            direction={snapshot?.direction}
          />
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <LiveRouteMap snapshot={snapshot} villages={displayVillages} />
            <VillageTracker villages={displayVillages} />
          </div>
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <LiveRouteMap snapshot={snapshot} villages={[]} />
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 font-bold">
            No active route assigned
          </div>
        </div>
      )}
    </div>
  );
}
