import { describe, it, expect } from 'vitest';
import { downsamplePoints } from '../trackGeometry.js';

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
