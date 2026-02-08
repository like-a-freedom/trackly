/**
 * Coordinate utilities for consistent handling of lat/lng conversions
 * GeoJSON uses [lng, lat], Leaflet uses [lat, lng]
 */

/**
 * Convert GeoJSON coordinate [lng, lat] to Leaflet format [lat, lng]
 * @param {[number, number]} coord - GeoJSON coordinate [lng, lat]
 * @returns {[number, number]} Leaflet coordinate [lat, lng]
 */
export function geoJsonToLeaflet([lng, lat]) {
  return [lat, lng];
}

/**
 * Convert Leaflet coordinate [lat, lng] to GeoJSON format [lng, lat]
 * @param {[number, number]} coord - Leaflet coordinate [lat, lng]
 * @returns {[number, number]} GeoJSON coordinate [lng, lat]
 */
export function leafletToGeoJson([lat, lng]) {
  return [lng, lat];
}

/**
 * Convert array of GeoJSON coordinates to Leaflet format
 * @param {Array<[number, number]>} coords - Array of GeoJSON coordinates
 * @returns {Array<[number, number]>} Array of Leaflet coordinates
 */
export function geoJsonLineToLeaflet(coords) {
  return coords.map(geoJsonToLeaflet);
}

/**
 * Convert array of Leaflet coordinates to GeoJSON format
 * @param {Array<[number, number]>} coords - Array of Leaflet coordinates
 * @returns {Array<[number, number]>} Array of GeoJSON coordinates
 */
export function leafletLineToGeoJson(coords) {
  return coords.map(leafletToGeoJson);
}

/**
 * Extract segments from GeoJSON geometry and convert to Leaflet format
 * @param {Object} geomGeojson - GeoJSON geometry object
 * @returns {Array<Array<[number, number]>>} Array of segments in Leaflet format
 */
export function extractSegments(geomGeojson) {
  if (!geomGeojson || !geomGeojson.coordinates) return [];

  if (geomGeojson.type === 'MultiLineString') {
    return geomGeojson.coordinates.map(line => geoJsonLineToLeaflet(line));
  }

  if (geomGeojson.type === 'LineString') {
    return [geoJsonLineToLeaflet(geomGeojson.coordinates)];
  }

  return [];
}

/**
 * Calculate bounds from array of coordinates
 * @param {Array<[number, number]>} latlngs - Array of coordinates [lat, lng]
 * @returns {{north: number, south: number, east: number, west: number}|null} Bounds object
 */
export function calculateBounds(latlngs) {
  if (!latlngs || latlngs.length === 0) return null;

  let north = -90, south = 90, east = -180, west = 180;

  latlngs.forEach(point => {
    const [lat, lng] = point;
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  });

  return { north, south, east, west };
}

/**
 * Calculate center from bounds
 * @param {{north: number, south: number, east: number, west: number}} bounds - Bounds object
 * @returns {[number, number]} Center coordinate [lat, lng]
 */
export function boundsToCenter(bounds) {
  return [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2
  ];
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {[number, number]} coord1 - First coordinate [lat, lng]
 * @param {[number, number]} coord2 - Second coordinate [lat, lng]
 * @returns {number} Distance in meters
 */
export function haversineDistance([lat1, lng1], [lat2, lng2]) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
