import { describe, it, expect } from 'vitest';
import {
    geojsonToPoints,
    pointsToGeoJSON,
    calcSegmentDistance,
    isValidCoord,
    createEmptySegment,
    getDefaultSegmentColor,
    toMeters,
    distancePointToSegmentMeters,
    findNearestPointIndex,
    getNextPoiName,
} from '../trackGeometryUtils';

describe('trackGeometryUtils', () => {
    describe('geojsonToPoints', () => {
        it('converts LineString to points', () => {
            const geojson = {
                type: 'LineString',
                coordinates: [
                    [14.0, 50.0],
                    [14.1, 50.1],
                ],
            };
            const result = geojsonToPoints(geojson);
            expect(result).toEqual([
                [
                    [50.0, 14.0],
                    [50.1, 14.1],
                ],
            ]);
        });

        it('converts MultiLineString to points', () => {
            const geojson = {
                type: 'MultiLineString',
                coordinates: [
                    [
                        [14.0, 50.0],
                        [14.1, 50.1],
                    ],
                    [
                        [15.0, 51.0],
                        [15.1, 51.1],
                    ],
                ],
            };
            const result = geojsonToPoints(geojson);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual([
                [50.0, 14.0],
                [50.1, 14.1],
            ]);
        });

        it('returns empty array for unknown type', () => {
            expect(geojsonToPoints({ type: 'Point', coordinates: [14, 50] })).toEqual([]);
        });

        it('returns empty array for null input', () => {
            expect(geojsonToPoints(null)).toEqual([]);
        });
    });

    describe('pointsToGeoJSON', () => {
        it('converts points to GeoJSON LineString', () => {
            const points = [
                [50.0, 14.0],
                [50.1, 14.1],
            ];
            const result = pointsToGeoJSON(points);
            expect(result).toEqual({
                type: 'LineString',
                coordinates: [
                    [14.0, 50.0],
                    [14.1, 50.1],
                ],
            });
        });

        it('returns null for empty points', () => {
            expect(pointsToGeoJSON([])).toBeNull();
        });
    });

    describe('calcSegmentDistance', () => {
        it('returns 0 for single point', () => {
            expect(calcSegmentDistance([[50, 14]])).toBe(0);
        });

        it('returns 0 for empty array', () => {
            expect(calcSegmentDistance([])).toBe(0);
        });

        it('calculates distance between two points', () => {
            const points = [
                [50.0, 14.0],
                [50.001, 14.0],
            ];
            const dist = calcSegmentDistance(points);
            expect(dist).toBeGreaterThan(0);
            expect(dist).toBeLessThan(200); // ~111m
        });
    });

    describe('isValidCoord', () => {
        it('returns true for valid coordinates', () => {
            expect(isValidCoord(50, 14)).toBe(true);
            expect(isValidCoord(-90, -180)).toBe(true);
            expect(isValidCoord(90, 180)).toBe(true);
        });

        it('returns false for out-of-range coordinates', () => {
            expect(isValidCoord(91, 14)).toBe(false);
            expect(isValidCoord(50, 181)).toBe(false);
            expect(isValidCoord(-91, 14)).toBe(false);
            expect(isValidCoord(50, -181)).toBe(false);
        });

        it('returns false for non-numeric values', () => {
            expect(isValidCoord('50', 14)).toBe(false);
            expect(isValidCoord(50, null)).toBe(false);
            expect(isValidCoord(NaN, 14)).toBe(false);
            expect(isValidCoord(Infinity, 14)).toBe(false);
        });
    });

    describe('createEmptySegment', () => {
        it('creates segment with correct structure', () => {
            const seg = createEmptySegment(0);
            expect(seg).toEqual({
                index: 0,
                points: [],
                waypoints: [],
                name: '',
                color: '#1976D2',
            });
        });

        it('uses different colors for different indices', () => {
            const seg0 = createEmptySegment(0);
            const seg1 = createEmptySegment(1);
            expect(seg0.color).not.toBe(seg1.color);
        });
    });

    describe('getDefaultSegmentColor', () => {
        it('returns color from palette', () => {
            expect(getDefaultSegmentColor(0)).toBe('#1976D2');
            expect(getDefaultSegmentColor(1)).toBe('#D32F2F');
        });

        it('wraps around palette', () => {
            expect(getDefaultSegmentColor(8)).toBe('#1976D2');
        });
    });

    describe('toMeters', () => {
        it('converts coordinates to meters', () => {
            const result = toMeters(50, 14);
            expect(result).toHaveProperty('x');
            expect(result).toHaveProperty('y');
            expect(typeof result.x).toBe('number');
            expect(typeof result.y).toBe('number');
        });
    });

    describe('distancePointToSegmentMeters', () => {
        it('calculates distance from point to segment', () => {
            const point = { lat: 50.001, lng: 14.0 };
            const a = { lat: 50.0, lng: 14.0 };
            const b = { lat: 50.002, lng: 14.0 };
            const result = distancePointToSegmentMeters(point, a, b);
            expect(result).toHaveProperty('distance');
            expect(result).toHaveProperty('t');
            expect(result.distance).toBeGreaterThanOrEqual(0);
            expect(result.t).toBeGreaterThanOrEqual(0);
            expect(result.t).toBeLessThanOrEqual(1);
        });

        it('handles zero-length segment', () => {
            const point = { lat: 50.001, lng: 14.0 };
            const a = { lat: 50.0, lng: 14.0 };
            const b = { lat: 50.0, lng: 14.0 };
            const result = distancePointToSegmentMeters(point, a, b);
            expect(result.t).toBe(0);
            expect(result.distance).toBeGreaterThan(0);
        });
    });

    describe('findNearestPointIndex', () => {
        it('finds nearest point', () => {
            const points = [
                [50.0, 14.0],
                [50.1, 14.1],
                [50.2, 14.2],
            ];
            const idx = findNearestPointIndex(points, 50.09, 14.09);
            expect(idx).toBe(1);
        });

        it('returns -1 for empty array', () => {
            expect(findNearestPointIndex([], 50, 14)).toBe(-1);
        });
    });

    describe('getNextPoiName', () => {
        it('returns POI 001 for empty array', () => {
            expect(getNextPoiName([])).toBe('POI 001');
        });

        it('increments from existing POIs', () => {
            const pois = [{ name: 'POI 001' }, { name: 'POI 003' }];
            expect(getNextPoiName(pois)).toBe('POI 004');
        });

        it('ignores non-standard names', () => {
            const pois = [{ name: 'Custom Name' }, { name: 'POI 002' }];
            expect(getNextPoiName(pois)).toBe('POI 003');
        });
    });
});
