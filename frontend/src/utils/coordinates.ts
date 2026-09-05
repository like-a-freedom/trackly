/**
 * Coordinate utilities for consistent handling of lat/lng conversions
 * GeoJSON uses [lng, lat], Leaflet uses [lat, lng]
 */

import type { LatLngTuple, LngLatTuple } from '@/types';

/**
 * Convert GeoJSON coordinate [lng, lat] to Leaflet format [lat, lng]
 * @param coord - GeoJSON coordinate [lng, lat]
 * @returns Leaflet coordinate [lat, lng]
 */
export function geoJsonToLeaflet([lng, lat]: LngLatTuple): LatLngTuple {
  return [lat, lng];
}

/**
 * Convert Leaflet coordinate [lat, lng] to GeoJSON format [lng, lat]
 * @param coord - Leaflet coordinate [lat, lng]
 * @returns GeoJSON coordinate [lng, lat]
 */
export function leafletToGeoJson([lat, lng]: LatLngTuple): LngLatTuple {
  return [lng, lat];
}

/**
 * Convert array of GeoJSON coordinates to Leaflet format
 * @param coords - Array of GeoJSON coordinates
 * @returns Array of Leaflet coordinates
 */
export function geoJsonLineToLeaflet(coords: LngLatTuple[]): LatLngTuple[] {
  return coords.map(geoJsonToLeaflet);
}

/**
 * Convert array of Leaflet coordinates to GeoJSON format
 * @param coords - Array of Leaflet coordinates
 * @returns Array of GeoJSON coordinates
 */
export function leafletLineToGeoJson(coords: LatLngTuple[]): LngLatTuple[] {
  return coords.map(leafletToGeoJson);
}

/**
 * Extract segments from GeoJSON geometry and convert to Leaflet format
 * @param geomGeojson - GeoJSON geometry object
 * @returns Array of segments in Leaflet format
 */
export function extractSegments(geomGeojson: GeoJSON.Geometry): LatLngTuple[][] {
  if (!geomGeojson || !('coordinates' in geomGeojson)) return [];

  if (geomGeojson.type === 'MultiLineString') {
    return geomGeojson.coordinates.map(line => geoJsonLineToLeaflet(line as LngLatTuple[]));
  }

  if (geomGeojson.type === 'LineString') {
    return [geoJsonLineToLeaflet(geomGeojson.coordinates as LngLatTuple[])];
  }

  return [];
}

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Calculate bounds from array of coordinates
 * @param latlngs - Array of coordinates [lat, lng]
 * @returns Bounds object
 */
export function calculateBounds(latlngs: LatLngTuple[]): Bounds | null {
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
 * @param bounds - Bounds object
 * @returns Center coordinate [lat, lng]
 */
export function boundsToCenter(bounds: Bounds): LatLngTuple {
  return [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2
  ];
}

export { haversineDistance } from './haversine';
