/**
 * Track Geometry Utilities
 *
 * Utilities for calculating distances, positions, and track properties
 * for the track direction visualization feature.
 */

import { haversineDistance, haversineMeters } from './haversine';
import type { LatLngTuple } from '@/types';

export { haversineDistance, haversineMeters };

/**
 * Compute cumulative distances along a track
 * @param latlngs - Array of [lat, lng] coordinates
 * @returns Array of cumulative distances in meters from start
 */
export function computeCumulativeDistances(latlngs: LatLngTuple[]): number[] {
    if (!latlngs || latlngs.length === 0) {
        return [];
    }

    const distances: number[] = [0];
    let cumulative = 0;

    for (let i = 1; i < latlngs.length; i++) {
        const prev = latlngs[i - 1];
        const curr = latlngs[i];
        if (!prev || !curr) {
            distances.push(cumulative);
            continue;
        }
        const [lat1, lng1] = prev;
        const [lat2, lng2] = curr;

        // Skip invalid coordinates
        if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
            distances.push(cumulative);
            continue;
        }

        const segmentDistance = haversineMeters(lat1, lng1, lat2, lng2);
        cumulative += segmentDistance;
        distances.push(cumulative);
    }

    return distances;
}

/**
 * Downsample an array of points to a maximum size while keeping endpoints.
 * @param points - Array of [lat, lng] coordinates
 * @param maxPoints - Maximum number of points to keep
 * @returns Downsampled points
 */
export function downsamplePoints(points: LatLngTuple[], maxPoints: number): LatLngTuple[] {
    if (!Array.isArray(points) || maxPoints <= 0) return [];
    if (points.length <= maxPoints) return points;

    const ratio = (points.length - 1) / (maxPoints - 1);
    const sampled: LatLngTuple[] = [];
    for (let i = 0; i < maxPoints; i++) {
        const idx = Math.round(i * ratio);
        const point = points[idx];
        if (point) sampled.push(point);
    }
    return sampled;
}

/**
 * Interpolate a point along a line segment
 * @param start - Start point [lat, lng]
 * @param end - End point [lat, lng]
 * @param fraction - Fraction along segment (0-1)
 * @returns Interpolated point [lat, lng]
 */
export function interpolatePoint(start: LatLngTuple, end: LatLngTuple, fraction: number): LatLngTuple {
    const [lat1, lng1] = start;
    const [lat2, lng2] = end;

    return [
        lat1 + (lat2 - lat1) * fraction,
        lng1 + (lng2 - lng1) * fraction
    ];
}

/**
 * Calculate perpendicular offset point
 * @param point - Original point [lat, lng]
 * @param prev - Previous point [lat, lng]
 * @param next - Next point [lat, lng]
 * @param offsetMeters - Offset distance in meters (positive = right side)
 * @returns Offset point [lat, lng]
 */
export function calculatePerpendicularOffset(
    point: LatLngTuple,
    prev: LatLngTuple | null,
    next: LatLngTuple | null,
    offsetMeters: number
): LatLngTuple {
    // Calculate direction vector
    const [lat, lng] = point;
    const [prevLat, prevLng] = prev || point;
    const [nextLat, nextLng] = next || point;

    // Direction from prev to next
    const dirLat = nextLat - prevLat;
    const dirLng = nextLng - prevLng;

    // Perpendicular (rotate 90° clockwise for right side)
    const perpLat = -dirLng;
    const perpLng = dirLat;

    // Normalize
    const length = Math.sqrt(perpLat * perpLat + perpLng * perpLng);
    if (length === 0) return point;

    // Convert offset from meters to approximate degrees
    // 1 degree ≈ 111,320 meters at equator
    const offsetDegrees = offsetMeters / 111320;

    return [
        lat + (perpLat / length) * offsetDegrees,
        lng + (perpLng / length) * offsetDegrees
    ];
}

interface DistanceMarker {
    id: string;
    position: LatLngTuple;
    offsetPosition: LatLngTuple;
    distanceKm: number;
}

/**
 * Generate distance markers along a track
 * @param latlngs - Array of [lat, lng] coordinates
 * @param intervalKm - Interval between markers in kilometers
 * @param maxMarkers - Maximum number of markers
 * @returns Array of distance markers
 */
export function computeDistanceMarkers(
    latlngs: LatLngTuple[],
    intervalKm: number,
    maxMarkers = 100
): DistanceMarker[] {
    return computeSegmentDistanceMarkers([latlngs], intervalKm, maxMarkers);
}

/** Place markers along all recorded segments, excluding gaps from distance. */
export function computeSegmentDistanceMarkers(
    segments: LatLngTuple[][],
    intervalKm: number,
    maxMarkers = 100
): DistanceMarker[] {
    if (!Number.isFinite(intervalKm) || intervalKm <= 0 || maxMarkers <= 0) return [];
    const markers: DistanceMarker[] = [];
    const intervalMeters = intervalKm * 1000;
    let travelled = 0;
    let nextMarkerDistance = intervalMeters;

    for (const segment of segments) {
        for (let i = 1; i < segment.length; i++) {
            const prev = segment[i - 1];
            const curr = segment[i];
            if (!prev || !curr || ![...prev, ...curr].every(Number.isFinite)) continue;
            const length = haversineMeters(prev[0], prev[1], curr[0], curr[1]);
            const endDistance = travelled + length;
            while (length > 0 && nextMarkerDistance <= endDistance) {
                const position = interpolatePoint(prev, curr, (nextMarkerDistance - travelled) / length);
                const distanceKm = nextMarkerDistance / 1000;
                markers.push({
                    id: `km-${distanceKm}`,
                    position,
                    offsetPosition: calculatePerpendicularOffset(position, prev, curr, 3),
                    distanceKm,
                });
                if (markers.length >= maxMarkers) return markers;
                nextMarkerDistance += intervalMeters;
            }
            travelled = endDistance;
        }
    }
    return markers;
}

/**
 * Detect if a track is a loop (start and end points close together)
 * @param latlngs - Array of [lat, lng] coordinates
 * @param thresholdMeters - Maximum distance to consider as loop
 * @returns Whether the track is a loop
 */
export function isLoopTrack(latlngs: LatLngTuple[], thresholdMeters = 15): boolean {
    if (!latlngs || latlngs.length < 2) {
        return false;
    }

    const start = latlngs[0];
    const end = latlngs[latlngs.length - 1];

    // Skip if invalid coordinates
    if (!start || !end ||
        isNaN(start[0]) || isNaN(start[1]) ||
        isNaN(end[0]) || isNaN(end[1])) {
        return false;
    }

    const distance = haversineMeters(start[0], start[1], end[0], end[1]);
    return distance <= thresholdMeters;
}

/**
 * Get appropriate marker interval based on zoom level and track length
 * @param zoom - Current map zoom level
 * @param trackLengthKm - Track length in kilometers
 * @returns Interval in kilometers, or 0 if markers should be hidden
 */
export function getMarkerInterval(zoom: number, trackLengthKm: number): number {
    // Base interval based on zoom
    let interval: number;
    if (zoom >= 17) {
        interval = 0.1; // 100m
    } else if (zoom >= 15) {
        interval = 0.5; // 500m
    } else if (zoom >= 13) {
        interval = 1; // 1km
    } else if (zoom >= 11) {
        interval = 5;
    } else if (zoom >= 9) {
        interval = 10;
    } else {
        interval = 20 * Math.pow(2, Math.max(0, 8 - zoom));
    }

    // For very long tracks, increase interval to limit marker count
    const maxMarkers = 100;
    const estimatedMarkers = trackLengthKm / interval;

    if (estimatedMarkers > maxMarkers) {
        // Increase interval to keep under limit
        interval = Math.ceil(trackLengthKm / maxMarkers);
        // Round to nice values
        if (interval > 5) {
            interval = Math.ceil(interval / 5) * 5; // Round to 5km
        }
    }

    // Keep at least one useful interval on short routes instead of hiding the layer.
    if (trackLengthKm > 0 && trackLengthKm < interval) {
        const target = trackLengthKm / 2;
        const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
        const fraction = target / magnitude;
        interval = Math.max(0.1, (fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1) * magnitude);
    }

    return interval;
}

/**
 * Get arrow repeat interval based on zoom level
 * @param zoom - Current map zoom level
 * @returns Repeat interval in pixels, or 0 if arrows should be hidden
 */
export function getArrowRepeatInterval(zoom: number): number {
    if (zoom <= 10) {
        return 0; // Hidden
    } else if (zoom <= 12) {
        return 150; // Sparse
    } else if (zoom <= 15) {
        return 100; // Medium density
    } else {
        return 70; // Dense
    }
}

/**
 * Format distance for tooltip display
 * @param distanceKm - Distance in kilometers
 * @returns Formatted string
 */
export function formatDistanceMarker(distanceKm: number): string {
    if (distanceKm < 1) {
        // Remove leading zero for values like 0.5 -> '.5'
        return distanceKm.toString().replace(/^0(?=\.)/, '');
    }
    // Keep one decimal place for non-integer kilometer values (e.g., 1.5)
    const rounded = Math.round(distanceKm * 10) / 10;
    if (Number.isInteger(rounded)) {
        return rounded.toString();
    }
    return rounded.toString();
}
