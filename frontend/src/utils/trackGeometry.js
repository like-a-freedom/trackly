/**
 * Track Geometry Utilities
 * 
 * Utilities for calculating distances, positions, and track properties
 * for the track direction visualization feature.
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Compute cumulative distances along a track
 * @param {Array<[number, number]>} latlngs - Array of [lat, lng] coordinates
 * @returns {number[]} Array of cumulative distances in meters from start
 */
export function computeCumulativeDistances(latlngs) {
    if (!latlngs || latlngs.length === 0) {
        return [0];
    }

    const distances = [0];
    let cumulative = 0;

    for (let i = 1; i < latlngs.length; i++) {
        const [lat1, lng1] = latlngs[i - 1];
        const [lat2, lng2] = latlngs[i];

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
 * Interpolate a point along a line segment
 * @param {[number, number]} start - Start point [lat, lng]
 * @param {[number, number]} end - End point [lat, lng]
 * @param {number} fraction - Fraction along segment (0-1)
 * @returns {[number, number]} Interpolated point [lat, lng]
 */
export function interpolatePoint(start, end, fraction) {
    const [lat1, lng1] = start;
    const [lat2, lng2] = end;

    return [
        lat1 + (lat2 - lat1) * fraction,
        lng1 + (lng2 - lng1) * fraction
    ];
}

/**
 * Calculate perpendicular offset point
 * @param {[number, number]} point - Original point [lat, lng]
 * @param {[number, number]} prev - Previous point [lat, lng]
 * @param {[number, number]} next - Next point [lat, lng]
 * @param {number} offsetMeters - Offset distance in meters (positive = right side)
 * @returns {[number, number]} Offset point [lat, lng]
 */
export function calculatePerpendicularOffset(point, prev, next, offsetMeters) {
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

/**
 * Generate distance markers along a track
 * @param {Array<[number, number]>} latlngs - Array of [lat, lng] coordinates
 * @param {number} intervalKm - Interval between markers in kilometers
 * @param {number} [maxMarkers=100] - Maximum number of markers
 * @returns {Array<{id: string, position: [number, number], distanceKm: number}>}
 */
export function computeDistanceMarkers(latlngs, intervalKm, maxMarkers = 100) {
    if (!latlngs || latlngs.length < 2 || intervalKm <= 0) {
        return [];
    }

    const cumulativeDistances = computeCumulativeDistances(latlngs);
    const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
    const intervalMeters = intervalKm * 1000;

    // Skip if track is too short
    if (totalDistance < intervalMeters) {
        return [];
    }

    const markers = [];
    let nextMarkerDistance = intervalMeters;

    for (let i = 1; i < latlngs.length && markers.length < maxMarkers; i++) {
        const prevDistance = cumulativeDistances[i - 1];
        const currDistance = cumulativeDistances[i];

        // Check if marker falls within this segment
        while (nextMarkerDistance <= currDistance && markers.length < maxMarkers) {
            // Calculate position along segment
            const segmentLength = currDistance - prevDistance;
            if (segmentLength > 0) {
                const fraction = (nextMarkerDistance - prevDistance) / segmentLength;
                const position = interpolatePoint(latlngs[i - 1], latlngs[i], fraction);

                // Calculate offset position (8px ≈ 2-3 meters at typical zoom)
                const offsetPosition = calculatePerpendicularOffset(
                    position,
                    latlngs[i - 1],
                    latlngs[i],
                    3 // 3 meters offset to the right
                );

                const distanceKm = nextMarkerDistance / 1000;
                markers.push({
                    id: `km-${distanceKm}`,
                    position,
                    offsetPosition,
                    distanceKm
                });
            }

            nextMarkerDistance += intervalMeters;
        }
    }

    return markers;
}

/**
 * Detect if a track is a loop (start and end points close together)
 * @param {Array<[number, number]>} latlngs - Array of [lat, lng] coordinates
 * @param {number} [thresholdMeters=15] - Maximum distance to consider as loop
 * @returns {boolean}
 */
export function isLoopTrack(latlngs, thresholdMeters = 15) {
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
 * @param {number} zoom - Current map zoom level
 * @param {number} trackLengthKm - Track length in kilometers
 * @returns {number} Interval in kilometers, or 0 if markers should be hidden
 */
export function getMarkerInterval(zoom, trackLengthKm) {
    // Hide markers at low zoom
    if (zoom <= 10) {
        return 0;
    }

    // Base interval based on zoom
    let interval;
    if (zoom >= 15) {
        interval = 0.5; // 500m
    } else if (zoom >= 13) {
        interval = 1; // 1km
    } else {
        interval = 5; // 5km
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

    return interval;
}

/**
 * Get arrow repeat interval based on zoom level
 * @param {number} zoom - Current map zoom level
 * @returns {number} Repeat interval in pixels, or 0 if arrows should be hidden
 */
export function getArrowRepeatInterval(zoom) {
    if (zoom <= 10) {
        return 0; // Hidden
    } else if (zoom <= 12) {
        return 150; // Sparse
    } else {
        return 70; // Dense
    }
}

/**
 * Format distance for tooltip display
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted string
 */
export function formatDistanceMarker(distanceKm) {
    if (distanceKm < 1) {
        return distanceKm.toString();
    }
    return Math.round(distanceKm).toString();
}
