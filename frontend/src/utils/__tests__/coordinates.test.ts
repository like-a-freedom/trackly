import { describe, it, expect } from 'vitest';
import {
    geoJsonToLeaflet,
    leafletToGeoJson,
    geoJsonLineToLeaflet,
    leafletLineToGeoJson,
    extractSegments,
    calculateBounds,
    boundsToCenter,
} from '../coordinates';

describe('coordinates', () => {
    describe('geoJsonToLeaflet', () => {
        it('converts [lng, lat] to [lat, lng]', () => {
            expect(geoJsonToLeaflet([30, 50])).toEqual([50, 30]);
        });
    });

    describe('leafletToGeoJson', () => {
        it('converts [lat, lng] to [lng, lat]', () => {
            expect(leafletToGeoJson([50, 30])).toEqual([30, 50]);
        });
    });

    describe('geoJsonLineToLeaflet', () => {
        it('converts array of [lng, lat] to [lat, lng]', () => {
            const result = geoJsonLineToLeaflet([[30, 50], [31, 51]]);
            expect(result).toEqual([[50, 30], [51, 31]]);
        });
    });

    describe('leafletLineToGeoJson', () => {
        it('converts array of [lat, lng] to [lng, lat]', () => {
            const result = leafletLineToGeoJson([[50, 30], [51, 31]]);
            expect(result).toEqual([[30, 50], [31, 51]]);
        });
    });

    describe('extractSegments', () => {
        it('extracts segments from MultiLineString', () => {
            const geojson = {
                type: 'MultiLineString',
                coordinates: [[[30, 50], [31, 51]], [[32, 52], [33, 53]]],
            };

            const segments = extractSegments(geojson as any);
            expect(segments).toHaveLength(2);
            expect(segments[0]).toEqual([[50, 30], [51, 31]]);
        });

        it('extracts segment from LineString', () => {
            const geojson = {
                type: 'LineString',
                coordinates: [[30, 50], [31, 51]],
            };

            const segments = extractSegments(geojson as any);
            expect(segments).toHaveLength(1);
            expect(segments[0]).toEqual([[50, 30], [51, 31]]);
        });

        it('returns empty array for unsupported type', () => {
            const geojson = { type: 'Point', coordinates: [30, 50] };
            const segments = extractSegments(geojson as any);
            expect(segments).toEqual([]);
        });
    });

    describe('calculateBounds', () => {
        it('returns null for empty array', () => {
            expect(calculateBounds([])).toBeNull();
        });

        it('calculates bounds for points', () => {
            const bounds = calculateBounds([[50, 30], [51, 31], [52, 32]]);
            expect(bounds).not.toBeNull();
            expect(bounds!.north).toBe(52);
            expect(bounds!.south).toBe(50);
            expect(bounds!.east).toBe(32);
            expect(bounds!.west).toBe(30);
        });

        it('handles single point', () => {
            const bounds = calculateBounds([[50, 30]]);
            expect(bounds).not.toBeNull();
            expect(bounds!.north).toBe(50);
            expect(bounds!.south).toBe(50);
        });
    });

    describe('boundsToCenter', () => {
        it('calculates center of bounds', () => {
            const bounds = { north: 52, south: 50, east: 32, west: 30 };
            const center = boundsToCenter(bounds as any);
            expect(center).toEqual([51, 31]);
        });
    });
});
