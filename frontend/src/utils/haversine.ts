import type { Coordinates } from '@/types';

/**
 * Haversine distance between two geographic points.
 * Pure function; no side effects.
 * @param a - First point
 * @param b - Second point
 * @returns Distance in meters
 */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const aVal =
        sinLat * sinLat +
        Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

/**
 * Haversine distance with explicit coordinate parameters.
 * @returns Distance in meters
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    return haversineDistance({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
}
