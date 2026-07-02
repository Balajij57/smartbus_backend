import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TrackingProgressVillage, TrackingSnapshot } from '../../lib/api';
import { computeBearing, fetchRoadRoute, isValidCoord } from '../../lib/routing';

const BUS_ICON_URL = '/icons/bus.svg';
const DEFAULT_CENTER: [number, number] = [17.0504, 82.1659];

function villageColor(v: TrackingProgressVillage, isDestination: boolean): string {
  if (isDestination) return '#2563EB';
  if (v.crossed) return '#10B981';
  if (v.status === 'current') return '#F59E0B';
  return '#94A3B8';
}

function createVillageIcon(color: string, label: string, isDestination: boolean) {
  const size = isDestination ? 22 : 16;
  return L.divIcon({
    className: '',
    html: `<div title="${label}" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.25);${isDestination ? 'box-shadow:0 0 0 4px rgba(37,99,235,.25);' : ''}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createBusIcon(heading: number) {
  return L.divIcon({
    className: '',
    html: `<img src="${BUS_ICON_URL}" alt="Bus" style="width:42px;height:42px;transform:rotate(${heading}deg);transform-origin:center center;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));" />`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function animateMarker(
  marker: L.Marker,
  from: L.LatLng,
  to: L.LatLng,
  durationMs: number,
  onHeading?: (heading: number) => void,
) {
  const start = performance.now();
  const bearing = computeBearing(
    { latitude: from.lat, longitude: from.lng },
    { latitude: to.lat, longitude: to.lng },
  );

  const tick = (now: number) => {
    const t = Math.min((now - start) / durationMs, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lat = from.lat + (to.lat - from.lat) * eased;
    const lng = from.lng + (to.lng - from.lng) * eased;
    marker.setLatLng([lat, lng]);
    if (onHeading) onHeading(bearing);
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

export default function FleetTrackingMap({
  snapshot,
  villages,
  collegeName = 'Aditya University',
}: {
  snapshot: TrackingSnapshot | null;
  villages: TrackingProgressVillage[];
  collegeName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const villageMarkersRef = useRef<L.Marker[]>([]);
  const busMarkerRef = useRef<L.Marker | null>(null);
  const busHeadingRef = useRef(0);
  const animatingRef = useRef(false);
  const [roadPath, setRoadPath] = useState<[number, number][]>([]);

  const ordered = useMemo(
    () =>
      [...villages]
        .filter((v) => isValidCoord(v.latitude, v.longitude))
        .sort((a, b) => a.sequence - b.sequence),
    [villages],
  );

  // Adjust ordered stops to end at the student's stop if there is only 1 student assigned
  const processedStops = useMemo(() => {
    console.count("processedStops recalculated");
    if (ordered.length === 0) return [];
    
    // Find active stops (stops with students)
    const activeStops = ordered.filter(v => v.villageName.toLowerCase() !== 'aditya university' && (v.studentCount || 0) > 0);
    
    let stopsToRender = [...ordered];
    let destType = 'College';

    if (activeStops.length === 1) {
      const activeStop = activeStops[0];
      const activeIndex = ordered.findIndex(v => v.villageId === activeStop.villageId);
      if (activeIndex !== -1) {
        stopsToRender = ordered.slice(0, activeIndex + 1);
        destType = 'Student';
      }
    } else if (activeStops.length > 1) {
      // Find the last active stop sequence index
      let lastActiveIndex = 0;
      activeStops.forEach(stop => {
        const idx = ordered.findIndex(v => v.villageId === stop.villageId);
        if (idx > lastActiveIndex) lastActiveIndex = idx;
      });
      stopsToRender = ordered.slice(0, lastActiveIndex + 1);
      destType = 'Stop';
    }

    const busCoords = snapshot?.currentLocation ? `${snapshot.currentLocation.latitude}, ${snapshot.currentLocation.longitude}` : 'None';
    const destStop = stopsToRender[stopsToRender.length - 1];
    const destCoords = destStop ? `${destStop.latitude}, ${destStop.longitude}` : 'None';

    console.log("[DEBUG LOG] Processed Stops:", stopsToRender);
    console.log("[DEBUG LOG] Processed Stops Count:", stopsToRender.length);
    console.log(`[DEBUG LOG] Bus coordinates: ${busCoords}`);
    console.log(`[DEBUG LOG] Destination coordinates: ${destCoords}`);
    console.log(`[DEBUG LOG] Selected destination type: ${destType}`);

    return stopsToRender;
  }, [ordered, snapshot?.currentLocation]);

  const routeKey = useMemo(
    () => processedStops.map((v) => `${v.villageId}:${v.crossed}:${v.status}`).join('|'),
    [processedStops],
  );

  const totalAssignedStudents = useMemo(() => {
    return processedStops.reduce((sum, v) => {
      if (v.villageName.toLowerCase() === 'aditya university') return sum;
      return sum + (v.studentCount || 0);
    }, 0);
  }, [processedStops]);

  const hasRoute = processedStops.length > 0 && totalAssignedStudents > 0;

  const current = snapshot?.currentLocation;
  const hasCurrent = current && isValidCoord(current.latitude, current.longitude) ? current : null;

  const renderedCurrent = useMemo(() => {
    if (!hasRoute) {
      return {
        latitude: 17.0912,
        longitude: 82.0665,
        speed: 0,
        heading: 0,
        timestamp: new Date().toISOString()
      };
    }
    return hasCurrent;
  }, [hasCurrent, hasRoute]);

  const initialCenter = useMemo<[number, number]>(() => {
    if (renderedCurrent) return [renderedCurrent.latitude, renderedCurrent.longitude];
    if (ordered[0]) return [ordered[0].latitude, ordered[0].longitude];
    return DEFAULT_CENTER;
  }, [renderedCurrent, ordered]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      villageMarkersRef.current = [];
      busMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (processedStops.length < 2) {
      setRoadPath(processedStops.map((v) => [v.latitude, v.longitude]));
      return;
    }

    let cancelled = false;
    const valid = processedStops.filter((w) => isValidCoord(w.latitude, w.longitude));
    const coords = valid.map((w) => `${w.longitude},${w.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    console.log("[DEBUG LOG] OSRM URL:", url);

    fetchRoadRoute(processedStops.map((v) => ({ latitude: v.latitude, longitude: v.longitude }))).then((path) => {
      if (!cancelled) {
        console.log("[DEBUG LOG] OSRM Geometry Points:", path.length);
        console.log("[DEBUG LOG] Road Path Length:", path.length);
        setRoadPath(path);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [routeKey, processedStops]);

  useEffect(() => {
    console.count("FleetTrackingMap Render");
    const map = mapRef.current;
    if (!map) return;

    villageMarkersRef.current.forEach((m) => m.remove());
    villageMarkersRef.current = [];

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const totalAssignedStudents = processedStops.reduce((sum, v) => {
      if (v.villageName.toLowerCase() === 'aditya university') return sum;
      return sum + (v.studentCount || 0);
    }, 0);

    const hasRoute = processedStops.length > 0 && totalAssignedStudents > 0;

    if (hasRoute && roadPath.length > 1) {
      console.log("[DEBUG LOG] Rendering Polyline:", roadPath.length);
      // Defect 22 Validation: polyline[last] === destinationMarker.coordinates
      const lastStop = processedStops[processedStops.length - 1];
      if (lastStop) {
        const lastPathPoint = roadPath[roadPath.length - 1];
        const distToDest = Math.sqrt(
          Math.pow(lastPathPoint[0] - lastStop.latitude, 2) + Math.pow(lastPathPoint[1] - lastStop.longitude, 2)
        );
        // Approximately 50 meters tolerance
        if (distToDest > 0.0005) {
          console.warn(`[MAP INTEGRITY WARNING] Route polyline endpoint does not match destination marker coordinates! Drift: ${distToDest.toFixed(6)}`);
          // Align them by forcing the last polyline point to match destination coordinates exactly
          roadPath[roadPath.length - 1] = [lastStop.latitude, lastStop.longitude];
        }
      }

      const group = L.layerGroup();
      group.addLayer(
        L.polyline(roadPath, {
          color: '#93C5FD',
          weight: 8,
          opacity: 0.55,
          lineJoin: 'round',
          lineCap: 'round',
        }),
      );
      group.addLayer(
        L.polyline(roadPath, {
          color: '#2563EB',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round',
        }),
      );
      group.addTo(map);
      routeLayerRef.current = group;
    }

    if (hasRoute) {
      processedStops.forEach((v, index) => {
        const isDestination = index === processedStops.length - 1 || v.kind === 'college';
        const color = villageColor(v, isDestination);
        const radius = v.allowedRadiusMeters || 200;
        
        const popupHtml = `
          <div style="font-family:sans-serif;font-size:13px;line-height:1.4;">
            <b style="font-size:14px;color:#0F172A;">${v.villageName}</b><br/>
            <b>Coordinates:</b> ${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}<br/>
            <b>${isDestination ? (v.kind === 'college' ? 'Aditya University Destination' : 'Active Student Stop') : `${v.studentCount || 0} Students`}</b><br/>
            <b>Radius:</b> ${radius}m<br/>
            ${v.landmark ? `<b>Landmark:</b> ${v.landmark}<br/>` : ''}
            <b>Bus:</b> ${snapshot?.busNumber || snapshot?.busId || '—'}
          </div>
        `;

        // Defect 3: Force Leaflet [latitude, longitude] ordering
        const marker = L.marker([v.latitude, v.longitude], {
          icon: createVillageIcon(color, v.villageName, isDestination),
        })
          .bindPopup(popupHtml)
          .addTo(map);
        villageMarkersRef.current.push(marker);

        // Draw geofence circle around stop using [latitude, longitude]
        const circle = L.circle([v.latitude, v.longitude], {
          color: color,
          fillColor: color,
          fillOpacity: 0.1,
          radius: radius,
          weight: 1.5,
          dashArray: '5, 5'
        }).addTo(map);
        villageMarkersRef.current.push(circle);
      });
    }

    const boundsPoints: [number, number][] =
      hasRoute ? (roadPath.length > 0 ? roadPath : processedStops.map((v) => [v.latitude, v.longitude])) : [];
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [40, 40], maxZoom: 14 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 13);
    } else if (renderedCurrent) {
      map.setView([renderedCurrent.latitude, renderedCurrent.longitude], 13);
    }
  }, [roadPath, routeKey, processedStops, collegeName, renderedCurrent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !renderedCurrent) return;

    const target = L.latLng(renderedCurrent.latitude, renderedCurrent.longitude);
    const heading =
      typeof renderedCurrent.heading === 'number' && renderedCurrent.heading > 0
        ? renderedCurrent.heading
        : busHeadingRef.current;

    const popupHtml = `
      <div style="font-family:sans-serif;font-size:13px">
        <b>Bus ${snapshot?.busId || ''}</b><br/>
        Speed: ${Math.round(snapshot?.speedKmph || renderedCurrent.speed || 0)} km/h<br/>
        Updated: ${new Date(renderedCurrent.timestamp).toLocaleTimeString()}
      </div>`;

    if (!busMarkerRef.current) {
      busMarkerRef.current = L.marker(target, { icon: createBusIcon(heading), zIndexOffset: 1000 })
        .bindPopup(popupHtml)
        .addTo(map);
      busHeadingRef.current = heading;
      map.setView(target, Math.max(map.getZoom(), 13), { animate: true });
      return;
    }

    const from = busMarkerRef.current.getLatLng();
    if (from.distanceTo(target) < 2) {
      busMarkerRef.current.setPopupContent(popupHtml);
      return;
    }

    if (animatingRef.current) return;
    animatingRef.current = true;

    animateMarker(busMarkerRef.current, from, target, 1200, (newHeading) => {
      busHeadingRef.current = newHeading;
      busMarkerRef.current?.setIcon(createBusIcon(newHeading));
    });

    busMarkerRef.current.setPopupContent(popupHtml);
    map.panTo(target, { animate: true, duration: 1.2 });

    window.setTimeout(() => {
      animatingRef.current = false;
    }, 1250);
  }, [renderedCurrent, snapshot?.busId, snapshot?.speedKmph]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div ref={containerRef} className="h-[min(420px,60vh)] w-full min-h-[280px] sm:h-[420px]" />
    </div>
  );
}
