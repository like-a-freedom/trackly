/**
 * Pure geometry utilities for track editing.
 * No shared state — all functions are pure and testable.
 */
import { haversineDistance } from '../../utils/haversine';

/**
 * Convert GeoJSON geometry to array of [lat, lng] point arrays.
 * @param {Object} geojson - GeoJSON geometry object
 * @returns {Array<Array<[number, number]>>} Array of point arrays
 */
export function geojsonToPoints(geojson) {
    if (!geojson || !geojson.type) return [];

    let coords = [];
    if (geojson.type === 'LineString') {
        coords = [geojson.coordinates];
    } else if (geojson.type === 'MultiLineString') {
        coords = geojson.coordinates;
    } else {
        return [];
    }
    // Convert from [lng, lat] to [lat, lng]
    return coords.map((line) => line.map(([lng, lat]) => [lat, lng]));
}

/**
 * Convert points array to GeoJSON LineString.
 * @param {Array<[number, number]>} points - Array of [lat, lng] points
 * @returns {Object} GeoJSON LineString geometry
 */
export function pointsToGeoJSON(points) {
    if (!points || points.length === 0) return null;
    return {
        type: 'LineString',
        coordinates: points.map(([lat, lng]) => [lng, lat]),
    };
}

/**
 * Calculate total distance for an array of [lat, lng] points.
 * @param {Array<[number, number]>} points - Array of [lat, lng] points
 * @returns {number} Total distance in meters
 */
export function calcSegmentDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversineDistance(
            { lat: points[i - 1][0], lng: points[i - 1][1] },
            { lat: points[i][0], lng: points[i][1] }
        );
    }
    return total;
}

/**
 * Validate lat/lng coordinate ranges.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} Whether the coordinate is valid
 */
export function isValidCoord(lat, lng) {
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
 * @param {number} index - Segment index
 * @returns {Object} Empty segment object
 */
export function createEmptySegment(index) {
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
export const SEGMENT_COLORS = [
    '#1976D2', '#D32F2F', '#388E3C', '#7B1FA2',
    '#F57C00', '#0097A7', '#C2185B', '#512DA8',
];

/**
 * Get default color for a segment index.
 * @param {number} index - Segment index
 * @returns {string} Hex color string
 */
export function getDefaultSegmentColor(index) {
    return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

/**
 * Convert local meters to coordinate offsets.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} [originLat] - Origin latitude for calculation
 * @returns {{x: number, y: number}} Coordinate offsets in meters
 */
export function toMeters(lat, lng, originLat = lat) {
    const rad = Math.PI / 180;
    const x = lng * Math.cos(originLat * rad) * 111320;
    const y = lat * 110540;
    return { x, y };
}

/**
 * Calculate distance from a point to a line segment.
 * @param {{lat: number, lng: number}} point - The point
 * @param {{lat: number, lng: number}} a - Start of segment
 * @param {{lat: number, lng: number}} b - End of segment
 * @returns {{distance: number, t: number}} Distance and parameter t
 */
export function distancePointToSegmentMeters(point, a, b) {
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
 * @param {Array<[number, number]>} points - Array of [lat, lng] points
 * @param {number} lat - Target latitude
 * @param {number} lng - Target longitude
 * @returns {number} Index of nearest point, or -1 if empty
 */
export function findNearestPointIndex(points, lat, lng) {
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const [ptLat, ptLng] = points[i];
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
 * @param {Array<{name: string}>} pois - Existing POIs
 * @returns {string} Next POI name (e.g., "POI 001")
 */
export function getNextPoiName(pois) {
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
