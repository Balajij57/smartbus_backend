import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, type TrackingSnapshot } from '../../lib/api';
import { isValidCoord } from '../../lib/routing';

function createBusIconLeaflet(heading: number) {
  return L.divIcon({
    className: '',
    html: `<img src="/icons/bus.svg" alt="Bus" style="width:36px;height:36px;transform:rotate(${heading}deg);transform-origin:center center;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));" />`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function LiveFleetMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [activeBuses, setActiveBuses] = useState<TrackingSnapshot[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      api
        .getActiveBuses()
        .then((buses) => {
          setActiveBuses(buses);
          setError('');
        })
        .catch((err) => {
          console.error(err);
          setError('Failed to fetch active fleet data');
        });
    };

    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [17.0504, 82.1659],
      zoom: 10,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    mapRef.current = map;
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentBusIds = new Set(activeBuses.map((b) => b.busId));

    markersRef.current.forEach((marker, busId) => {
      if (!currentBusIds.has(busId)) {
        marker.remove();
        markersRef.current.delete(busId);
      }
    });

    const bounds: L.LatLng[] = [];

    activeBuses.forEach((bus) => {
      const loc = bus.currentLocation;
      if (!loc || !isValidCoord(loc.latitude, loc.longitude)) return;

      const latLng = L.latLng(loc.latitude, loc.longitude);
      bounds.push(latLng);
      const heading = loc.heading || 0;

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:13px">
          <b style="color:#2563eb;">Bus ${bus.busId}</b><br/>
          Speed: ${Math.round(bus.speedKmph || loc.speed || 0)} km/h<br/>
          Status: ${bus.status}<br/>
          Next: ${bus.nextVillage?.villageName || '—'}
        </div>`;

      let marker = markersRef.current.get(bus.busId);
      if (!marker) {
        marker = L.marker(latLng, { icon: createBusIconLeaflet(heading), zIndexOffset: 500 })
          .bindPopup(popupHtml)
          .addTo(map);
        markersRef.current.set(bus.busId, marker);
      } else {
        marker.setLatLng(latLng);
        marker.setIcon(createBusIconLeaflet(heading));
        marker.setPopupContent(popupHtml);
      }
    });

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 });
    }
  }, [activeBuses]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black">Live Fleet Tracking</h2>
        <p className="text-sm text-slate-500">
          Showing all {activeBuses.length} active buses on OpenStreetMap.
        </p>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={mapContainerRef} className="h-[min(500px,65vh)] w-full min-h-[300px] sm:h-[500px]" />
      </div>
    </div>
  );
}
