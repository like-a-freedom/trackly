// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { haversineDistance, haversineMeters } from '../haversine';

describe('haversine', () => {
    it('returns 0 for identical points', () => {
        expect(haversineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    });

    it('calculates distance between known points', () => {
        const d = haversineDistance({ lat: 51.5, lng: -0.1 }, { lat: 40.7, lng: -74 });
        expect(d).toBeGreaterThan(5_000_000); // ~5570 km
        expect(d).toBeLessThan(6_000_000);
    });

    it('haversineMeters wraps haversineDistance', () => {
        const a = { lat: 51.5, lng: -0.1 };
        const b = { lat: 40.7, lng: -74 };
        expect(haversineMeters(a.lat, a.lng, b.lat, b.lng)).toBe(haversineDistance(a, b));
    });

    it('is symmetric', () => {
        const a = { lat: 10, lng: 20 };
        const b = { lat: 30, lng: 40 };
        expect(haversineDistance(a, b)).toBe(haversineDistance(b, a));
    });
});
