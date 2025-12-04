import { describe, it, expect } from 'vitest';
import {
    haversineMeters,
    computeCumulativeDistances,
    computeDistanceMarkers,
    isLoopTrack,
    getMarkerInterval,
    getArrowRepeatInterval,
    formatDistanceMarker
} from '../../src/utils/trackGeometry.js';

describe('trackGeometry', () => {
    describe('haversineMeters', () => {
        it('returns 0 for same point', () => {
            const lat = 55.7558, lng = 37.6173; // Moscow
            expect(haversineMeters(lat, lng, lat, lng)).toBe(0);
        });

        it('calculates distance between two known points', () => {
            // Moscow to St. Petersburg ~634 km
            const moscowLat = 55.7558, moscowLng = 37.6173;
            const spbLat = 59.9311, spbLng = 30.3609;
            const distance = haversineMeters(moscowLat, moscowLng, spbLat, spbLng);
            // Allow 1% error margin
            expect(distance).toBeGreaterThan(630000);
            expect(distance).toBeLessThan(640000);
        });

        it('calculates short distance accurately', () => {
            // Two points ~1km apart
            const lat1 = 55.7558, lng1 = 37.6173;
            const lat2 = 55.7648, lng2 = 37.6173; // ~1km north
            const distance = haversineMeters(lat1, lng1, lat2, lng2);
            expect(distance).toBeGreaterThan(900);
            expect(distance).toBeLessThan(1100);
        });
    });

    describe('computeCumulativeDistances', () => {
        it('returns empty array for empty input', () => {
            expect(computeCumulativeDistances([])).toEqual([]);
        });

        it('returns [0] for single point', () => {
            expect(computeCumulativeDistances([[55.75, 37.61]])).toEqual([0]);
        });

        it('returns correct cumulative distances', () => {
            const latlngs = [
                [55.7558, 37.6173],
                [55.7568, 37.6173],
                [55.7578, 37.6173]
            ];
            const distances = computeCumulativeDistances(latlngs);

            expect(distances).toHaveLength(3);
            expect(distances[0]).toBe(0);
            expect(distances[1]).toBeGreaterThan(0);
            expect(distances[2]).toBeGreaterThan(distances[1]);
        });

        it('handles real track-like data', () => {
            // Simulate a small track
            const latlngs = [
                [55.7558, 37.6173],
                [55.7559, 37.6174],
                [55.7560, 37.6175],
                [55.7561, 37.6176],
                [55.7562, 37.6177]
            ];
            const distances = computeCumulativeDistances(latlngs);

            expect(distances).toHaveLength(5);
            // Each segment should add positive distance
            for (let i = 1; i < distances.length; i++) {
                expect(distances[i]).toBeGreaterThan(distances[i - 1]);
            }
        });
    });

    describe('computeDistanceMarkers', () => {
        it('returns empty array for empty input', () => {
            expect(computeDistanceMarkers([], 1, 10)).toEqual([]);
        });

        it('returns empty for track shorter than interval', () => {
            // Two points ~100m apart, with 1km interval
            const latlngs = [
                [55.7558, 37.6173],
                [55.7559, 37.6173]
            ];
            const markers = computeDistanceMarkers(latlngs, 1, 10);
            expect(markers).toEqual([]);
        });

        it('returns markers at correct intervals', () => {
            // Create a longer track (~5km)
            const latlngs = [];
            for (let i = 0; i <= 50; i++) {
                latlngs.push([55.7558 + i * 0.001, 37.6173]);
            }

            const markers = computeDistanceMarkers(latlngs, 1, 100);

            // Should have markers at 1km, 2km, 3km, etc.
            expect(markers.length).toBeGreaterThan(0);

            // Each marker should have required properties
            markers.forEach(marker => {
                expect(marker).toHaveProperty('id');
                expect(marker).toHaveProperty('position');
                expect(marker).toHaveProperty('distanceKm');
                expect(marker.position).toHaveLength(2);
            });
        });

        it('respects max markers limit', () => {
            // Create a long track
            const latlngs = [];
            for (let i = 0; i <= 200; i++) {
                latlngs.push([55.7558 + i * 0.001, 37.6173]);
            }

            const markers = computeDistanceMarkers(latlngs, 0.5, 5);
            expect(markers.length).toBeLessThanOrEqual(5);
        });
    });

    describe('isLoopTrack', () => {
        it('returns true for track with same start and end point', () => {
            const point = [55.7558, 37.6173];
            const latlngs = [point, [55.7560, 37.6175], point];
            expect(isLoopTrack(latlngs)).toBe(true);
        });

        it('returns true for track with start and end within 15m (default threshold)', () => {
            const latlngs = [
                [55.7558, 37.6173],
                [55.7560, 37.6175],
                [55.75581, 37.61731] // ~1m from start
            ];
            expect(isLoopTrack(latlngs)).toBe(true);
        });

        it('returns false for track with start and end more than 15m apart', () => {
            const latlngs = [
                [55.7558, 37.6173],
                [55.7560, 37.6175],
                [55.7561, 37.6176] // ~50m from start
            ];
            expect(isLoopTrack(latlngs)).toBe(false);
        });

        it('returns false for distant start and end', () => {
            const latlngs = [
                [55.7558, 37.6173], // Moscow
                [55.7600, 37.6200],
                [59.9311, 30.3609]  // St. Petersburg
            ];
            expect(isLoopTrack(latlngs)).toBe(false);
        });

        it('handles custom threshold', () => {
            const latlngs = [
                [55.7558, 37.6173],
                [55.7560, 37.6175],
                [55.7559, 37.6174] // ~15m from start
            ];

            // Default threshold is 15m
            expect(isLoopTrack(latlngs, 10)).toBe(false); // tighter threshold
            expect(isLoopTrack(latlngs, 100)).toBe(true); // looser threshold
        });

        it('returns false for empty or single-point track', () => {
            expect(isLoopTrack([])).toBe(false);
            expect(isLoopTrack([[55.7558, 37.6173]])).toBe(false);
            expect(isLoopTrack(null)).toBe(false);
            expect(isLoopTrack(undefined)).toBe(false);
        });
    });

    describe('getMarkerInterval', () => {
        it('returns 0.1 for very high zoom', () => {
            expect(getMarkerInterval(18, 5)).toBe(0.1);
            expect(getMarkerInterval(17, 5)).toBe(0.1);
        });

        it('returns 0.5 for high zoom', () => {
            expect(getMarkerInterval(16, 5)).toBe(0.5);
            expect(getMarkerInterval(15, 5)).toBe(0.5);
        });

        it('returns 1 for medium zoom', () => {
            expect(getMarkerInterval(14, 5)).toBe(1);
            expect(getMarkerInterval(13, 5)).toBe(1);
        });

        it('returns 5 for low-medium zoom', () => {
            expect(getMarkerInterval(12, 50)).toBe(5);
        });

        it('returns 0 for very low zoom', () => {
            expect(getMarkerInterval(10, 5)).toBe(0);
            expect(getMarkerInterval(8, 5)).toBe(0);
        });

        it('returns 0 for short tracks at low zoom', () => {
            expect(getMarkerInterval(12, 0.5)).toBe(0);
        });
    });

    describe('getArrowRepeatInterval', () => {
        it('returns 0 for low zoom (no arrows)', () => {
            expect(getArrowRepeatInterval(10)).toBe(0);
            expect(getArrowRepeatInterval(8)).toBe(0);
        });

        it('returns larger interval for medium zoom', () => {
            const interval = getArrowRepeatInterval(12);
            expect(interval).toBeGreaterThan(100);
        });

        it('returns smaller interval for high zoom', () => {
            const highZoom = getArrowRepeatInterval(16);
            const medZoom = getArrowRepeatInterval(13);
            expect(highZoom).toBeLessThan(medZoom);
        });

        it('returns consistent intervals for same zoom', () => {
            const interval1 = getArrowRepeatInterval(14);
            const interval2 = getArrowRepeatInterval(14);
            expect(interval1).toBe(interval2);
        });
    });

    describe('formatDistanceMarker', () => {
        it('formats whole kilometers', () => {
            expect(formatDistanceMarker(1)).toBe('1');
            expect(formatDistanceMarker(5)).toBe('5');
            expect(formatDistanceMarker(10)).toBe('10');
        });

        it('formats half kilometers', () => {
            expect(formatDistanceMarker(0.5)).toBe('.5');
            expect(formatDistanceMarker(1.5)).toBe('1.5');
            expect(formatDistanceMarker(2.5)).toBe('2.5');
        });

        it('formats sub-kilometer distances', () => {
            expect(formatDistanceMarker(0.1)).toBe('.1');
            expect(formatDistanceMarker(0.2)).toBe('.2');
        });
    });
});
