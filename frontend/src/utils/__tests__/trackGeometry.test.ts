// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import {
    computeCumulativeDistances,
    downsamplePoints,
    interpolatePoint,
    calculatePerpendicularOffset,
    computeDistanceMarkers,
    isLoopTrack,
    getMarkerInterval,
    getArrowRepeatInterval,
    formatDistanceMarker,
} from '../trackGeometry';
import type { LatLngTuple } from '@/types';

describe('trackGeometry.downsamplePoints', () => {
    it('returns original array when under limit', () => {
        const points = [[0, 0], [1, 1], [2, 2]];
        expect(downsamplePoints(points, 5)).toBe(points);
    });

    it('keeps first and last points', () => {
        const points = Array.from({ length: 10 }, (_, i) => [i, i]);
        const result = downsamplePoints(points, 5);
        expect(result[0]).toEqual([0, 0]);
        expect(result[result.length - 1]).toEqual([9, 9]);
    });

    it('returns expected length', () => {
        const points = Array.from({ length: 100 }, (_, i) => [i, i]);
        const result = downsamplePoints(points, 20);
        expect(result).toHaveLength(20);
    });

    it('handles invalid input', () => {
        expect(downsamplePoints(null, 10)).toEqual([]);
        expect(downsamplePoints([], 0)).toEqual([]);
    });
});

describe('trackGeometry.computeCumulativeDistances', () => {
    it('returns empty array for empty input', () => {
        expect(computeCumulativeDistances([])).toEqual([]);
    });

    it('returns empty array for null input', () => {
        expect(computeCumulativeDistances(null as unknown as LatLngTuple[])).toEqual([]);
    });

    it('returns [0] for single point', () => {
        expect(computeCumulativeDistances([[55.7558, 37.6176]])).toEqual([0]);
    });

    it('calculates cumulative distances for multiple points', () => {
        const points: LatLngTuple[] = [
            [55.7558, 37.6176],
            [55.7559, 37.6177],
            [55.7560, 37.6178],
        ];
        const distances = computeCumulativeDistances(points);
        expect(distances[0]).toBe(0);
        expect(distances[1]).toBeGreaterThan(0);
        expect(distances[2]).toBeGreaterThan(distances[1]);
    });
});

describe('trackGeometry.interpolatePoint', () => {
    it('returns start point at fraction 0', () => {
        const start: LatLngTuple = [55.0, 37.0];
        const end: LatLngTuple = [56.0, 38.0];
        expect(interpolatePoint(start, end, 0)).toEqual([55.0, 37.0]);
    });

    it('returns end point at fraction 1', () => {
        const start: LatLngTuple = [55.0, 37.0];
        const end: LatLngTuple = [56.0, 38.0];
        expect(interpolatePoint(start, end, 1)).toEqual([56.0, 38.0]);
    });

    it('returns midpoint at fraction 0.5', () => {
        const start: LatLngTuple = [55.0, 37.0];
        const end: LatLngTuple = [56.0, 38.0];
        expect(interpolatePoint(start, end, 0.5)).toEqual([55.5, 37.5]);
    });
});

describe('trackGeometry.calculatePerpendicularOffset', () => {
    it('returns original point when direction is zero', () => {
        const point: LatLngTuple = [55.0, 37.0];
        const result = calculatePerpendicularOffset(point, point, point, 3);
        expect(result).toEqual(point);
    });

    it('handles null prev/next', () => {
        const point: LatLngTuple = [55.0, 37.0];
        const result = calculatePerpendicularOffset(point, null, null, 3);
        expect(result).toEqual(point);
    });
});

describe('trackGeometry.computeDistanceMarkers', () => {
    it('returns empty array for insufficient points', () => {
        expect(computeDistanceMarkers([], 1)).toEqual([]);
        expect(computeDistanceMarkers([[55.0, 37.0]], 1)).toEqual([]);
    });

    it('returns empty array for invalid interval', () => {
        const points: LatLngTuple[] = [[55.0, 37.0], [55.1, 37.1]];
        expect(computeDistanceMarkers(points, 0)).toEqual([]);
    });

    it('returns empty array when track is shorter than interval', () => {
        const points: LatLngTuple[] = [[55.0, 37.0], [55.0001, 37.0001]];
        expect(computeDistanceMarkers(points, 100)).toEqual([]);
    });
});

describe('trackGeometry.isLoopTrack', () => {
    it('returns false for insufficient points', () => {
        expect(isLoopTrack([])).toBe(false);
        expect(isLoopTrack([[55.0, 37.0]])).toBe(false);
    });

    it('returns false for invalid coordinates', () => {
        expect(isLoopTrack([[NaN, 37.0], [55.0, 37.0]])).toBe(false);
    });

    it('returns true for loop track', () => {
        const points: LatLngTuple[] = [
            [55.7558, 37.6176],
            [55.7560, 37.6180],
            [55.7558, 37.6176],
        ];
        expect(isLoopTrack(points)).toBe(true);
    });

    it('returns false for non-loop track', () => {
        const points: LatLngTuple[] = [
            [55.7558, 37.6176],
            [55.7560, 37.6180],
            [55.7600, 37.6200],
        ];
        expect(isLoopTrack(points)).toBe(false);
    });
});

describe('trackGeometry.getMarkerInterval', () => {
    it('returns 0 for low zoom', () => {
        expect(getMarkerInterval(8, 100)).toBe(0);
        expect(getMarkerInterval(10, 100)).toBe(0);
    });

    it('returns 0.1 for zoom >= 17 with short track', () => {
        expect(getMarkerInterval(17, 1)).toBe(0.1);
    });

    it('returns 0.5 for zoom 15-16 with short track', () => {
        expect(getMarkerInterval(15, 1)).toBe(0.5);
    });

    it('returns 1 for zoom 13-14', () => {
        expect(getMarkerInterval(13, 1)).toBe(1);
    });

    it('returns 5 for zoom 11-12', () => {
        expect(getMarkerInterval(11, 10)).toBe(5);
    });

    it('returns 0 for short tracks at low zoom', () => {
        expect(getMarkerInterval(12, 0.5)).toBe(0);
    });

    it('increases interval for very long tracks', () => {
        const interval = getMarkerInterval(17, 10000);
        expect(interval).toBeGreaterThan(0.1);
    });
});

describe('trackGeometry.getArrowRepeatInterval', () => {
    it('returns 0 for low zoom', () => {
        expect(getArrowRepeatInterval(8)).toBe(0);
        expect(getArrowRepeatInterval(10)).toBe(0);
    });

    it('returns 150 for zoom 11-12', () => {
        expect(getArrowRepeatInterval(11)).toBe(150);
    });

    it('returns 100 for zoom 13-15', () => {
        expect(getArrowRepeatInterval(13)).toBe(100);
    });

    it('returns 70 for zoom > 15', () => {
        expect(getArrowRepeatInterval(16)).toBe(70);
    });
});

describe('trackGeometry.formatDistanceMarker', () => {
    it('removes leading zero for values < 1', () => {
        expect(formatDistanceMarker(0.5)).toBe('.5');
    });

    it('returns integer string for whole numbers', () => {
        expect(formatDistanceMarker(1)).toBe('1');
        expect(formatDistanceMarker(5)).toBe('5');
    });

    it('keeps one decimal for non-integer values >= 1', () => {
        expect(formatDistanceMarker(1.5)).toBe('1.5');
    });
});
