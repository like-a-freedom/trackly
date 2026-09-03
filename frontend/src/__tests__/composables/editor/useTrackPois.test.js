import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEditorStore } from '../../../stores/editor.js';
import {
    addPoiStandalone as addPoi,
    updatePoiStandalone as updatePoi,
    deletePoiStandalone as deletePoi,
    calculateNearestAlongTrackStandalone as calculateNearestAlongTrack,
    getNextPoiNameStandalone as getNextPoiName,
    updatePoiMetricsStandalone as updatePoiMetrics,
} from '../../../composables/editor/useTrackPois.js';

describe('useTrackPois (standalone functions)', () => {
    let store;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useEditorStore();
    });

    describe('addPoi', () => {
        it('adds a POI with name', () => {
            const result = addPoi(store, 50.0, 14.0, 'Test POI');
            expect(result.ok).toBe(true);
            expect(store.pois).toHaveLength(1);
            expect(store.pois[0].name).toBe('Test POI');
            expect(store.pois[0].lat).toBe(50.0);
            expect(store.pois[0].lng).toBe(14.0);
        });

        it('auto-generates name when empty', () => {
            const result = addPoi(store, 50.0, 14.0, '');
            expect(result.ok).toBe(true);
            expect(store.pois[0].name).toMatch(/^POI \d{3}$/);
        });

        it('rejects invalid coordinates', () => {
            const result = addPoi(store, 91, 14.0, 'Test');
            expect(result.ok).toBe(false);
        });

        it('adds description and category', () => {
            const result = addPoi(store, 50.0, 14.0, 'Test', {
                description: 'A test POI',
                category: 'viewpoint',
            });
            expect(result.ok).toBe(true);
            expect(store.pois[0].description).toBe('A test POI');
            expect(store.pois[0].category).toBe('viewpoint');
        });

        it('warns when POI is far from track', () => {
            // POI far from any track points
            const result = addPoi(store, 60.0, 20.0, 'Far POI');
            expect(result.ok).toBe(true);
            expect(result.warning).toContain('1 km');
        });
    });

    describe('updatePoi', () => {
        beforeEach(() => {
            addPoi(store, 50.0, 14.0, 'Original');
        });

        it('updates POI name', () => {
            const result = updatePoi(store, 0, { name: 'Updated' });
            expect(result.ok).toBe(true);
            expect(store.pois[0].name).toBe('Updated');
        });

        it('updates POI description', () => {
            const result = updatePoi(store, 0, { description: 'New desc' });
            expect(result.ok).toBe(true);
            expect(store.pois[0].description).toBe('New desc');
        });

        it('updates POI category', () => {
            const result = updatePoi(store, 0, { category: 'parking' });
            expect(result.ok).toBe(true);
            expect(store.pois[0].category).toBe('parking');
        });

        it('rejects empty name', () => {
            const result = updatePoi(store, 0, { name: '' });
            expect(result.ok).toBe(false);
        });

        it('returns error for invalid index', () => {
            const result = updatePoi(store, 5, { name: 'Test' });
            expect(result.ok).toBe(false);
        });
    });

    describe('deletePoi', () => {
        beforeEach(() => {
            addPoi(store, 50.0, 14.0, 'POI 1');
            addPoi(store, 50.01, 14.01, 'POI 2');
        });

        it('deletes a POI by index', () => {
            const result = deletePoi(store, 0);
            expect(result.ok).toBe(true);
            expect(store.pois).toHaveLength(1);
            expect(store.pois[0].name).toBe('POI 2');
        });

        it('returns error for invalid index', () => {
            const result = deletePoi(store, 5);
            expect(result.ok).toBe(false);
        });
    });

    describe('calculateNearestAlongTrack', () => {
        it('calculates distance along track', () => {
            store.segments = [{
                points: [[50.0, 14.0], [50.01, 14.01], [50.02, 14.02]],
                waypoints: [0, 2],
                surfaceTypes: ['unknown', 'unknown', 'unknown'],
            }];
            const result = calculateNearestAlongTrack(store, 50.01, 14.01);
            expect(result.distanceFromStart).toBeGreaterThan(0);
            expect(result.distanceToTrack).toBeLessThan(100);
        });

        it('returns zero for empty track', () => {
            const result = calculateNearestAlongTrack(store, 50.0, 14.0);
            expect(result.distanceFromStart).toBe(0);
        });
    });

    describe('getNextPoiName', () => {
        it('returns POI 001 for empty pois', () => {
            expect(getNextPoiName(store)).toBe('POI 001');
        });

        it('increments from existing POIs', () => {
            store.pois = [
                { name: 'POI 001' },
                { name: 'POI 003' },
            ];
            expect(getNextPoiName(store)).toBe('POI 004');
        });

        it('ignores non-standard names', () => {
            store.pois = [
                { name: 'Custom Name' },
                { name: 'POI 002' },
            ];
            expect(getNextPoiName(store)).toBe('POI 003');
        });
    });

    describe('updatePoiMetrics', () => {
        it('updates distance metrics for all POIs', () => {
            store.segments = [{
                points: [[50.0, 14.0], [50.01, 14.01]],
                waypoints: [0, 1],
                surfaceTypes: ['unknown', 'unknown'],
            }];
            store.pois = [{ lat: 50.005, lng: 14.005, name: 'Test' }];
            updatePoiMetrics(store);
            expect(store.pois[0].distFromStart).toBeDefined();
            expect(store.pois[0].distanceToTrack).toBeDefined();
            expect(store.pois[0].isFarFromTrack).toBeDefined();
        });
    });
});
