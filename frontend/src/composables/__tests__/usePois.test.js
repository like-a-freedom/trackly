import { describe, it, expect } from 'vitest';
import { usePois } from '../usePois';

describe('usePois (client-side only)', () => {
    it('exposes the expected API', () => {
        const { pois, loading, error, fetchTrackPois, fetchPoisInBbox, clearPois } = usePois();
        expect(pois).toBeDefined();
        expect(typeof fetchTrackPois).toBe('function');
        expect(typeof fetchPoisInBbox).toBe('function');
        expect(typeof clearPois).toBe('function');
    });
});
