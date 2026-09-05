/**
 * Pure geometry utilities for track editing.
 * No shared state — all functions are pure and testable.
 */
import { haversineDistance } from '../../utils/haversine';
import type { Coordinates, LatLngTuple } from '@/types';

/**
 * Convert GeoJSON geometry to array of [lat, lng] point arrays.
 * @param geojson - GeoJSON geometry object
 * @returns Array of point arrays
 */
export function geojsonToPoints(geojson: GeoJSON.Geometry): LatLngTuple[][] {
    if (!geojson || !geojson.type) return [];

    let coords: GeoJSON.Position[][];
    if (geojson.type === 'LineString') {
        coords = [geojson.coordinates];
    } else if (geojson.type === 'MultiLineString') {
        coords = geojson.coordinates;
    } else {
        return [];
    }
    // Convert from [lng, lat] to [lat, lng]
    return coords.map((line) => line.map(([lng, lat]) => [lat, lng] as LatLngTuple));
}

/**
 * Convert points array to GeoJSON LineString.
 * @param points - Array of [lat, lng] points
 * @returns GeoJSON LineString geometry
 */
export function pointsToGeoJSON(points: LatLngTuple[]): GeoJSON.LineString | null {
    if (!points || points.length === 0) return null;
    return {
        type: 'LineString',
        coordinates: points.map(([lat, lng]) => [lng, lat]),
    };
}

/**
 * Calculate total distance for an array of [lat, lng] points.
 * @param points - Array of [lat, lng] points
 * @returns Total distance in meters
 */
export function calcSegmentDistance(points: LatLngTuple[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        if (!prev || !curr) continue;
        total += haversineDistance(
            { lat: prev[0], lng: prev[1] },
            { lat: curr[0], lng: curr[1] }
        );
    }
    return total;
}

/**
 * Validate lat/lng coordinate ranges.
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Whether the coordinate is valid
 */
export function isValidCoord(lat: number, lng: number): boolean {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
    );
}

/**
 * Create an empty segment object.
 * @param index - Segment index
 * @returns Empty segment object
 */
export function createEmptySegment(index: number): {
    index: number;
    points: LatLngTuple[];
    waypoints: number[];
    name: string;
    color: string;
} {
    return {
        index,
        points: [],
        waypoints: [],
        name: '',
        color: getDefaultSegmentColor(index),
    };
}

/**
 * Segment color palette for differentiating segments visually.
 */
export const SEGMENT_COLORS: string[] = [
    '#1976D2', '#D32F2F', '#388E3C', '#7B1FA2',
    '#F57C00', '#0097A7', '#C2185B', '#512DA8',
];

/**
 * Get default color for a segment index.
 * @param index - Segment index
 * @returns Hex color string
 */
export function getDefaultSegmentColor(index: number): string {
    return SEGMENT_COLORS[index % SEGMENT_COLORS.length] ?? '#1976D2';
}

/**
 * Convert local meters to coordinate offsets.
 * @param lat - Latitude
 * @param lng - Longitude
 * @param originLat - Origin latitude for calculation
 * @returns Coordinate offsets in meters
 */
export function toMeters(lat: number, lng: number, originLat: number = lat): { x: number; y: number } {
    const rad = Math.PI / 180;
    const x = lng * Math.cos(originLat * rad) * 111320;
    const y = lat * 110540;
    return { x, y };
}

/**
 * Calculate distance from a point to a line segment.
 * @param point - The point
 * @param a - Start of segment
 * @param b - End of segment
 * @returns Distance and parameter t
 */
export function distancePointToSegmentMeters(
    point: Coordinates,
    a: Coordinates,
    b: Coordinates
): { distance: number; t: number } {
    const originLat = (a.lat + b.lat) / 2;
    const p = toMeters(point.lat, point.lng, originLat);
    const p1 = toMeters(a.lat, a.lng, originLat);
    const p2 = toMeters(b.lat, b.lng, originLat);

    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const wx = p.x - p1.x;
    const wy = p.y - p1.y;

    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) {
        const dx = p.x - p1.x;
        const dy = p.y - p1.y;
        return { distance: Math.hypot(dx, dy), t: 0 };
    }

    let t = (wx * vx + wy * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = p1.x + t * vx;
    const projY = p1.y + t * vy;
    const dx = p.x - projX;
    const dy = p.y - projY;

    return { distance: Math.hypot(dx, dy), t };
}

/**
 * Find nearest point index in a points array.
 * @param points - Array of [lat, lng] points
 * @param lat - Target latitude
 * @param lng - Target longitude
 * @returns Index of nearest point, or -1 if empty
 */
export function findNearestPointIndex(points: LatLngTuple[], lat: number, lng: number): number {
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (!point) continue;
        const [ptLat, ptLng] = point;
        const dist = haversineDistance(
            { lat: ptLat, lng: ptLng },
            { lat, lng }
        );
        if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
        }
    }
    return bestIndex;
}

/**
 * Generate next POI name based on existing POIs.
 * @param pois - Existing POIs
 * @returns Next POI name (e.g., "POI 001")
 */
export function getNextPoiName(pois: Array<{ name: string }>): string {
    let maxNumber = 0;
    for (const poi of pois) {
        const match = /^POI\s*(\d{3})$/.exec(poi.name || '');
        if (match) {
            const num = Number(match[1]);
            if (!Number.isNaN(num)) {
                maxNumber = Math.max(maxNumber, num);
            }
        }
    }
    const next = String(maxNumber + 1).padStart(3, '0');
    return `POI ${next}`;
}
