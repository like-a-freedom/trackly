import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEditorStore } from '../../stores/editor.js';

describe('editorStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    describe('initial state', () => {
        it('initializes with empty segments', () => {
            const store = useEditorStore();
            expect(store.segments).toHaveLength(1);
            expect(store.segments[0].points).toHaveLength(0);
        });

        it('initializes with default values', () => {
            const store = useEditorStore();
            expect(store.activeSegmentIndex).toBe(0);
            expect(store.trackName).toBe('');
            expect(store.trackDescription).toBe('');
            expect(store.trackCategories).toEqual([]);
            expect(store.pois).toEqual([]);
            expect(store.editorMode).toBe('edit');
            expect(store.snapToRoadMode).toBe('auto');
        });

        it('initializes with null savedTrackId', () => {
            const store = useEditorStore();
            expect(store.savedTrackId).toBeNull();
        });

        it('initializes with empty elevation state', () => {
            const store = useEditorStore();
            expect(store.elevationProfile).toEqual([]);
            expect(store.elevationStats).toEqual({});
            expect(store.elevationLoading).toBe(false);
            expect(store.elevationError).toBeNull();
        });

        it('initializes with empty optimizer state', () => {
            const store = useEditorStore();
            expect(store.optimizerTargetRatio).toBeCloseTo(0.1);
            expect(store.optimizerPreview).toBeNull();
            expect(store.optimizerStats).toBeNull();
            expect(store.optimizerLoading).toBe(false);
            expect(store.optimizerError).toBeNull();
        });
    });

    describe('getters', () => {
        it('activeSegment returns the active segment', () => {
            const store = useEditorStore();
            expect(store.activeSegment).toBe(store.segments[0]);
        });

        it('totalPoints sums points across segments', () => {
            const store = useEditorStore();
            store.segments = [
                { points: [[1, 2], [3, 4]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'] },
                { points: [[5, 6]], waypoints: [0], surfaceTypes: ['unknown'] },
            ];
            expect(store.totalPoints).toBe(3);
        });

        it('totalDistanceKm calculates distance in km', () => {
            const store = useEditorStore();
            // Two points ~1.57km apart
            store.segments = [
                { points: [[50.0, 14.0], [50.01, 14.01]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'] },
            ];
            expect(store.totalDistanceKm).toBeGreaterThan(0);
        });

        it('coordinateData flattens all segment points', () => {
            const store = useEditorStore();
            store.segments = [
                { points: [[1, 2], [3, 4]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'] },
            ];
            expect(store.coordinateData).toEqual([[1, 2], [3, 4]]);
        });

        it('canSave requires name and at least 2 points', () => {
            const store = useEditorStore();
            expect(store.canSave).toBe(false);

            store.trackName = 'Test';
            expect(store.canSave).toBe(false);

            store.segments = [
                { points: [[1, 2], [3, 4]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'] },
            ];
            expect(store.canSave).toBe(true);
        });

        it('isNewTrack returns true when savedTrackId is null', () => {
            const store = useEditorStore();
            expect(store.isNewTrack).toBe(true);

            store.savedTrackId = 123;
            expect(store.isNewTrack).toBe(false);
        });
    });

    describe('actions', () => {
        it('setSegmentName updates segment name', () => {
            const store = useEditorStore();
            store.setSegmentName(0, 'Day 1');
            expect(store.segments[0].name).toBe('Day 1');
        });

        it('setSegmentColor updates segment color', () => {
            const store = useEditorStore();
            store.setSegmentColor(0, '#FF0000');
            expect(store.segments[0].color).toBe('#FF0000');
        });

        it('setMode updates editor mode', () => {
            const store = useEditorStore();
            store.setMode('fragment');
            expect(store.editorMode).toBe('fragment');
        });

        it('setSnapToRoadMode updates snap mode', () => {
            const store = useEditorStore();
            store.setSnapToRoadMode('off');
            expect(store.snapToRoadMode).toBe('off');
        });

        it('setActiveSegment changes active segment index', () => {
            const store = useEditorStore();
            store.segments = [
                { points: [], waypoints: [], surfaceTypes: [] },
                { points: [], waypoints: [], surfaceTypes: [] },
            ];
            store.setActiveSegment(1);
            expect(store.activeSegmentIndex).toBe(1);
        });

        it('setActiveSegment ignores out-of-bounds index', () => {
            const store = useEditorStore();
            store.setActiveSegment(5);
            expect(store.activeSegmentIndex).toBe(0);
        });

        it('clear resets store to initial state', () => {
            const store = useEditorStore();
            store.trackName = 'Test';
            store.savedTrackId = 123;
            store.segments = [
                { points: [[1, 2], [3, 4]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'] },
            ];

            store.clear();

            expect(store.trackName).toBe('');
            expect(store.savedTrackId).toBe(123); // preserved
            expect(store.segments).toHaveLength(1);
            expect(store.segments[0].points).toHaveLength(0);
        });
    });

    describe('fragment selection', () => {
        let store;

        beforeEach(() => {
            store = useEditorStore();
            // Add points to enable fragment selection
            store.segments = [{
                points: Array.from({ length: 15 }, (_, i) => [50 + i * 0.01, 14 + i * 0.01]),
                waypoints: [0, 14],
                surfaceTypes: Array.from({ length: 15 }, () => 'unknown'),
            }];
        });

        it('setFragmentPoint sets first point', () => {
            store.setFragmentPoint(0, 5);
            expect(store.fragmentSelection).toEqual({ segIndex: 0, startIdx: 5, endIdx: null });
        });

        it('setFragmentPoint sets second point', () => {
            store.setFragmentPoint(0, 5);
            store.setFragmentPoint(0, 10);
            expect(store.fragmentSelection).toEqual({ segIndex: 0, startIdx: 5, endIdx: 10 });
        });

        it('clearFragmentSelection resets selection', () => {
            store.setFragmentPoint(0, 5);
            store.clearFragmentSelection();
            expect(store.fragmentSelection).toEqual({ segIndex: null, startIdx: null, endIdx: null });
        });

        it('getFragmentRange returns ordered range', () => {
            store.fragmentSelection = { segIndex: 0, startIdx: 10, endIdx: 5 };
            expect(store.getFragmentRange()).toEqual({ segIndex: 0, startIdx: 5, endIdx: 10 });
        });

        it('getFragmentRange returns null for incomplete selection', () => {
            expect(store.getFragmentRange()).toBeNull();
        });
    });
});
