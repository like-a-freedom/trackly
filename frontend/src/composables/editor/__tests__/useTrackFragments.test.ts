import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackFragments } from '../useTrackFragments';
import type { Segment, LatLngTuple } from '@/types';

interface FragmentStore {
    segments: Segment[];
    fragmentSelection: {
        segIndex: number | null;
        startIdx: number | null;
        endIdx: number | null;
    };
}

function createTestStore(overrides: Partial<FragmentStore> = {}): FragmentStore {
    return {
        segments: [],
        fragmentSelection: { segIndex: null, startIdx: null, endIdx: null },
        ...overrides,
    };
}

describe('useTrackFragments', () => {
    let fragments: ReturnType<typeof useTrackFragments>;

    beforeEach(() => {
        fragments = useTrackFragments();
    });

    describe('initial state', () => {
        it('starts with null selection', () => {
            expect(fragments.fragmentSelection.value).toEqual({
                segIndex: null,
                startIdx: null,
                endIdx: null,
            });
        });
    });

    describe('getFragmentRange', () => {
        it('returns null when selection is incomplete', () => {
            expect(fragments.getFragmentRange()).toBeNull();
        });

        it('returns range when selection is complete', () => {
            fragments.fragmentSelection.value = { segIndex: 0, startIdx: 1, endIdx: 5 };
            const range = fragments.getFragmentRange();
            expect(range).toEqual({ segIndex: 0, startIdx: 1, endIdx: 5 });
        });

        it('normalizes reversed range', () => {
            fragments.fragmentSelection.value = { segIndex: 0, startIdx: 5, endIdx: 1 };
            const range = fragments.getFragmentRange();
            expect(range).toEqual({ segIndex: 0, startIdx: 1, endIdx: 5 });
        });
    });

    describe('setFragmentPoint', () => {
        it('sets start point on first click', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32]] as LatLngTuple[],
                    waypoints: [0, 1, 2],
                    surfaceTypes: ['unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.setFragmentPoint(store, 0, 1);
            expect(result).toBe(true);
            expect(store.fragmentSelection).toEqual({ segIndex: 0, startIdx: 1, endIdx: null });
        });

        it('sets end point on second click', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32], [53, 33], [54, 34]] as LatLngTuple[],
                    waypoints: [0, 1, 2, 3, 4],
                    surfaceTypes: ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
                fragmentSelection: { segIndex: 0, startIdx: 1, endIdx: null },
            });

            const result = fragments.setFragmentPoint(store, 0, 3);
            expect(result).toBe(true);
            expect(store.fragmentSelection).toEqual({ segIndex: 0, startIdx: 1, endIdx: 3 });
        });

        it('resets selection on third click', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32]] as LatLngTuple[],
                    waypoints: [0, 1, 2],
                    surfaceTypes: ['unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
                fragmentSelection: { segIndex: 0, startIdx: 1, endIdx: 3 },
            });

            const result = fragments.setFragmentPoint(store, 0, 2);
            expect(result).toBe(true);
            expect(store.fragmentSelection).toEqual({ segIndex: 0, startIdx: 2, endIdx: null });
        });

        it('rejects invalid segment index', () => {
            const store = createTestStore();
            const result = fragments.setFragmentPoint(store, 99, 0);
            expect(result).toBe(false);
        });

        it('rejects invalid point index', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30]] as LatLngTuple[],
                    waypoints: [0],
                    surfaceTypes: ['unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.setFragmentPoint(store, 0, 99);
            expect(result).toBe(false);
        });
    });

    describe('clearFragmentSelection', () => {
        it('resets selection', () => {
            fragments.fragmentSelection.value = { segIndex: 0, startIdx: 1, endIdx: 3 };
            fragments.clearFragmentSelection();
            expect(fragments.fragmentSelection.value).toEqual({
                segIndex: null,
                startIdx: null,
                endIdx: null,
            });
        });
    });

    describe('replaceRangeWithPoints', () => {
        it('replaces points in range', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32], [53, 33]] as LatLngTuple[],
                    waypoints: [0, 1, 2, 3],
                    surfaceTypes: ['unknown', 'unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const newPoints: LatLngTuple[] = [[60, 40], [61, 41]];
            const result = fragments.replaceRangeWithPoints(store, 0, 1, 2, newPoints);

            expect(result).toBe(true);
            expect(store.segments[0].points).toEqual([[50, 30], [60, 40], [61, 41], [53, 33]]);
        });

        it('returns false for invalid segment', () => {
            const store = createTestStore();
            const result = fragments.replaceRangeWithPoints(store, 99, 0, 1, []);
            expect(result).toBe(false);
        });
    });

    describe('reverseFragment', () => {
        it('reverses points in range', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32], [53, 33]] as LatLngTuple[],
                    waypoints: [0, 1, 2, 3],
                    surfaceTypes: ['unknown', 'unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.reverseFragment(store, 0, 1, 2);
            expect(result).toBe(true);
            expect(store.segments[0].points[1]).toEqual([52, 32]);
            expect(store.segments[0].points[2]).toEqual([51, 31]);
        });

        it('returns false for invalid range', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.reverseFragment(store, 0, 0, 0);
            expect(result).toBe(false);
        });
    });

    describe('deleteFragmentConnect', () => {
        it('removes interior points and connects endpoints', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32], [53, 33], [54, 34]] as LatLngTuple[],
                    waypoints: [0, 1, 2, 3, 4],
                    surfaceTypes: ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.deleteFragmentConnect(store, 0, 0, 4);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(2);
        });

        it('returns false for invalid range', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.deleteFragmentConnect(store, 0, 0, 1);
            expect(result).toBe(false);
        });
    });

    describe('deleteFragmentSplit', () => {
        it('splits segment into two', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32], [53, 33], [54, 34]] as LatLngTuple[],
                    waypoints: [0, 1, 2, 3, 4],
                    surfaceTypes: ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.deleteFragmentSplit(store, 0, 1, 3);
            expect(result).toBe(true);
            expect(store.segments).toHaveLength(2);
            expect(store.segments[0].points).toHaveLength(2);
            expect(store.segments[1].points).toHaveLength(2);
        });

        it('returns false for invalid range', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.deleteFragmentSplit(store, 0, 0, 1);
            expect(result).toBe(false);
        });
    });

    describe('shortcutBetweenPoints', () => {
        it('removes points between indices', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31], [52, 32], [53, 33], [54, 34]] as LatLngTuple[],
                    waypoints: [0, 1, 2, 3, 4],
                    surfaceTypes: ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.shortcutBetweenPoints(store, 0, 0, 4);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(2);
        });

        it('returns false for adjacent points', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.shortcutBetweenPoints(store, 0, 0, 1);
            expect(result).toBe(false);
        });

        it('returns false for invalid indices', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = fragments.shortcutBetweenPoints(store, 0, -1, 5);
            expect(result).toBe(false);
        });
    });
});
