export type LatLng = { latitude: number; longitude: number };

export function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * y;
}

export function formatEta(minutes?: number | null) {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '--';
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return `${h}h ${m}m`;
}
