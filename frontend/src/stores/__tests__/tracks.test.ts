// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTracksStore } from '../tracks';

describe('useTracksStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('has correct initial state', () => {
        const store = useTracksStore();
        expect(store.polylines).toEqual([]);
        expect(store.tracksCollection).toEqual({ type: 'FeatureCollection', features: [] });
        expect(store.heatmapPoints).toEqual([]);
        expect(store.error).toBeNull();
    });

    it('updatePolylines processes FeatureCollection', () => {
        const store = useTracksStore();
        const data = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: { id: 'track-1' },
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [0, 0],
                            [1, 1]
                        ]
                    }
                }
            ]
        };

        store.updatePolylines(data);
        expect(store.polylines.length).toBe(1);
        expect(store.polylines[0].properties.id).toBe('track-1');
    });

    it('updateTrackInPolylines modifies matching track', () => {
        const store = useTracksStore();
        store.updatePolylines({
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: { id: 'track-1', name: 'Original' },
                    geometry: { type: 'LineString', coordinates: [[0, 0]] }
                }
            ]
        });

        store.updateTrackInPolylines('track-1', { name: 'Updated' });
        expect(store.polylines[0].properties.name).toBe('Updated');
        expect(store.tracksCollection.features[0].properties.name).toBe('Updated');
    });

    it('processTrackData validates speed fields', () => {
        const store = useTracksStore();
        const result = store.processTrackData({
            avg_speed: 'invalid',
            max_speed: -5,
            length_km: NaN
        });
        expect(result.avg_speed).toBeNull();
        expect(result.max_speed).toBeNull();
        expect(result.length_km).toBeNull();
    });

    it('processTrackData returns null for invalid input', () => {
        const store = useTracksStore();
        expect(store.processTrackData(null)).toBeNull();
        expect(store.processTrackData(undefined)).toBeNull();
        expect(store.processTrackData('string')).toBeNull();
    });
});
