// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackPois } from '../useTrackPois';

describe('useTrackPois', () => {
    let pois: ReturnType<typeof useTrackPois>;

    beforeEach(() => {
        const result = useTrackPois();
        pois = result;
    });

    it('initializes with empty pois', () => {
        expect(pois.pois.value).toEqual([]);
    });

    it('initializes with provided pois', () => {
        const initialPois = [{ id: 1, name: 'POI 001', lat: 50, lng: 14 }];
        const result = useTrackPois({ initialPois });
        expect(result.pois.value).toEqual(initialPois);
    });

    it('adds a new POI', () => {
        const newPoi = pois.addPoi({ lat: 50, lng: 14 });
        expect(pois.pois.value).toHaveLength(1);
        expect(newPoi.name).toBe('POI 001');
        expect(newPoi.lat).toBe(50);
    });

    it('adds POI with custom name', () => {
        const newPoi = pois.addPoi({ lat: 50, lng: 14, name: 'Custom' });
        expect(newPoi.name).toBe('Custom');
    });

    it('gets next POI name', () => {
        expect(pois.getNextPoiName()).toBe('POI 001');
        pois.addPoi({ lat: 50, lng: 14 });
        expect(pois.getNextPoiName()).toBe('POI 002');
    });

    it('updates an existing POI', () => {
        const poi = pois.addPoi({ lat: 50, lng: 14 });
        const result = pois.updatePoi(poi.id, { name: 'Updated' });
        expect(result).toBe(true);
        expect(pois.getPoi(poi.id).name).toBe('Updated');
    });

    it('returns false when updating non-existent POI', () => {
        const result = pois.updatePoi(999, { name: 'Updated' });
        expect(result).toBe(false);
    });

    it('deletes a POI', () => {
        const poi = pois.addPoi({ lat: 50, lng: 14 });
        const result = pois.deletePoi(poi.id);
        expect(result).toBe(true);
        expect(pois.pois.value).toHaveLength(0);
    });

    it('returns false when deleting non-existent POI', () => {
        const result = pois.deletePoi(999);
        expect(result).toBe(false);
    });

    it('gets POI by ID', () => {
        const poi = pois.addPoi({ lat: 50, lng: 14 });
        expect(pois.getPoi(poi.id)).toEqual(poi);
    });

    it('returns undefined for non-existent POI', () => {
        expect(pois.getPoi(999)).toBeUndefined();
    });

    it('clears all POIs', () => {
        pois.addPoi({ lat: 50, lng: 14 });
        pois.addPoi({ lat: 51, lng: 15 });
        pois.clearPois();
        expect(pois.pois.value).toHaveLength(0);
    });

    it('updates POI metrics', () => {
        pois.addPoi({ lat: 50.001, lng: 14.001, name: 'Test POI' });
        const segments = [
            { index: 0, points: [[50, 14], [50.01, 14.01]] },
        ];
        pois.updatePoiMetrics(segments);
        expect(pois.pois.value[0]).toHaveProperty('distFromStart');
        expect(pois.pois.value[0]).toHaveProperty('distanceToTrack');
        expect(pois.pois.value[0]).toHaveProperty('isFarFromTrack');
    });
});
