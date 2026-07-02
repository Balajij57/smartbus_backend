export type LatLng = { latitude: number; longitude: number };

export function isValidCoord(latitude: unknown, longitude: unknown): latitude is number {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.error(`[COORD ERROR] Non-numeric coordinates rejected: lat=${latitude}, lng=${longitude}`);
    return false;
  }
  if (latitude < -90 || latitude > 90) {
    console.error(`[COORD ERROR] Latitude out of range [-90, 90]: ${latitude}`);
    return false;
  }
  if (longitude < -180 || longitude > 180) {
    console.error(`[COORD ERROR] Longitude out of range [-180, 180]: ${longitude}`);
    return false;
  }
  return true;
}

export function computeBearing(from: LatLng, to: LatLng): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export async function fetchRoadRoute(waypoints: LatLng[]): Promise<[number, number][]> {
  const valid = waypoints.filter((w) => isValidCoord(w.latitude, w.longitude));
  if (valid.length < 2) {
    return valid.map((w) => [w.latitude, w.longitude]);
  }

  const coords = valid.map((w) => `${w.longitude},${w.latitude}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      console.warn('[Routing] OSRM fallback to straight line:', data.code || res.status);
      return valid.map((w) => [w.latitude, w.longitude]);
    }
    return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
  } catch (error) {
    console.warn('[Routing] OSRM request failed, using straight line', error);
    return valid.map((w) => [w.latitude, w.longitude]);
  }
}
