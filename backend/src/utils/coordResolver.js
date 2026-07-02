import { haversineDistanceKm } from './geo.js';

// Priority Order: 1. BusStop Master, 2. Route Coordinates, 3. Student Coordinates
// Defect 22 & 23 Constant
export const ADITYA_UNIVERSITY_COORDS = { latitude: 17.0912, longitude: 82.0665 };

/**
 * Normalizes coordinate inputs and detects potential latitude/longitude swaps.
 * standard range: Latitude [-90, 90], Longitude [-180, 180].
 * Specifically, in the region of interest (Andhra Pradesh, India),
 * latitude is around 16.5 - 17.5, and longitude is around 81.5 - 82.5.
 * If longitude is ~17 and latitude is ~82, it's a swap!
 */
export function normalizeLatLng(lat, lng) {
  let finalLat = Number(lat);
  let finalLng = Number(lng);

  if (isNaN(finalLat) || isNaN(finalLng)) {
    throw new Error(`Invalid coordinate numeric types: lat=${lat}, lng=${lng}`);
  }

  // Detect swap if Latitude is in longitude range and Longitude is in latitude range
  // e.g. for Tirupati/Aditya university area: Lat ~17, Lng ~82.
  if (Math.abs(finalLat) > 40 && Math.abs(finalLng) < 40) {
    console.warn(`[COORD WARN] Swapped Latitude and Longitude coordinates detected automatically. Correcting. Original lat=${lat}, lng=${lng}`);
    const temp = finalLat;
    finalLat = finalLng;
    finalLng = temp;
  }

  return { latitude: finalLat, longitude: finalLng };
}

/**
 * Normalizes GeoJSON coordinate arrays ([longitude, latitude])
 */
export function normalizeGeoJSON(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error('Invalid GeoJSON coordinates array');
  }
  const { latitude, longitude } = normalizeLatLng(coords[1], coords[0]);
  return [longitude, latitude]; // Returns GeoJSON ordered [lng, lat]
}

/**
 * Validates coordinate drift between different sources.
 * If drift > 500m (0.5km), logs warning, saves a conflict audit, and returns preferred coords.
 */
export function detectDrift(sourceName, preferredCoords, targetCoords) {
  const distance = haversineDistanceKm(preferredCoords, targetCoords);
  if (distance > 0.5) {
    console.warn(`[COORD DRIFT WARN] Coordinate source conflict detected between preferred and ${sourceName}. Drift: ${(distance * 1000).toFixed(1)}m. Preferred: ${JSON.stringify(preferredCoords)}, Target: ${JSON.stringify(targetCoords)}`);
    // Returns preferred to prevent drift corruption
    return true;
  }
  return false;
}

/**
 * Normalizes stop names: trim, toLowerCase, unified whitespaces, and maps Ramesampeta variants consistently.
 */
export function normalizeStopName(name) {
  if (!name) return '';
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (cleaned === 'ramesampeta' || cleaned === 'rameswarampeta' || cleaned === 'rameshwarampeta') {
    return 'ramesampeta';
  }
  if (cleaned === 'rajamundry' || cleaned === 'rajahmundry') {
    return 'rajahmundry';
  }
  return cleaned;
}

/**
 * Gets proper display name for normalized stop keys.
 */
export function getDisplayStopName(name) {
  const norm = normalizeStopName(name);
  if (norm === 'ramesampeta') return 'Ramesampeta';
  if (norm === 'rajahmundry') return 'Rajahmundry';
  return name.trim().replace(/\s+/g, ' ');
}
