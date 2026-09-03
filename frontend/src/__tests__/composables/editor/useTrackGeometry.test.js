import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEditorStore } from '../../../stores/editor.js';
import {
    addWaypoint,
    moveWaypoint,
    deleteWaypoint,
    insertWaypoint,
    addSegment,
    deleteSegment,
    splitSegment,
    reverseSegment,
    reverseTrack,
    joinSegments,
    closeLoop,
    toGeoJSON,
    fromGeoJSON,
} from '../../../composables/editor/useTrackGeometry.js';

describe('useTrackGeometry', () => {
    let store;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useEditorStore();
    });

    describe('addWaypoint', () => {
        it('adds a point to empty segment', () => {
            const result = addWaypoint(store, 50.0, 14.0);
            expect(result).toBe(true);
            expect(store.segments[0].points).toEqual([[50.0, 14.0]]);
            expect(store.segments[0].waypoints).toEqual([0]);
        });

        it('rejects invalid coordinates', () => {
            expect(addWaypoint(store, 91, 14.0)).toBe(false);
            expect(addWaypoint(store, 50.0, 181)).toBe(false);
        });

        it('rejects points too close together', () => {
            addWaypoint(store, 50.0, 14.0);
            // Second point is < 5m away
            const result = addWaypoint(store, 50.00001, 14.00001);
            expect(result).toBe(false);
        });

        it('adds valid second point', () => {
            addWaypoint(store, 50.0, 14.0);
            const result = addWaypoint(store, 50.01, 14.01);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(2);
        });

        it('respects max track points', () => {
            // Fill to max
            for (let i = 0; i < 100_001; i++) {
                store.segments[0].points.push([50 + i * 0.001, 14 + i * 0.001]);
            }
            const result = addWaypoint(store, 60.0, 20.0);
            expect(result).toBe(false);
        });
    });

    describe('moveWaypoint', () => {
        it('moves a waypoint to new position', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            const result = moveWaypoint(store, 0, 0, 51.0, 15.0);
            expect(result).toBe(true);
            expect(store.segments[0].points[0]).toEqual([51.0, 15.0]);
        });

        it('rejects invalid coordinates', () => {
            addWaypoint(store, 50.0, 14.0);
            expect(moveWaypoint(store, 0, 0, 91, 14.0)).toBe(false);
        });

        it('rejects out-of-bounds point index', () => {
            addWaypoint(store, 50.0, 14.0);
            expect(moveWaypoint(store, 0, 5, 51.0, 15.0)).toBe(false);
        });
    });

    describe('deleteWaypoint', () => {
        it('deletes a waypoint', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            addWaypoint(store, 50.02, 14.02);
            const result = deleteWaypoint(store, 0, 1);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(2);
        });

        it('removes segment when deleting last point', () => {
            addWaypoint(store, 50.0, 14.0);
            const result = deleteWaypoint(store, 0, 0);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(0);
        });
    });

    describe('insertWaypoint', () => {
        it('inserts a waypoint after given index', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.02, 14.02);
            const result = insertWaypoint(store, 0, 0, 50.01, 14.01);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(3);
            expect(store.segments[0].points[1]).toEqual([50.01, 14.01]);
        });

        it('rejects invalid coordinates', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.02, 14.02);
            expect(insertWaypoint(store, 0, 0, 91, 14.01)).toBe(false);
        });
    });

    describe('addSegment', () => {
        it('adds a new empty segment', () => {
            const result = addSegment(store);
            expect(result).toBe(1);
            expect(store.segments).toHaveLength(2);
            expect(store.activeSegmentIndex).toBe(1);
        });

        it('respects max segments limit', () => {
            for (let i = 0; i < 100; i++) {
                addSegment(store);
            }
            const result = addSegment(store);
            expect(result).toBe(-1);
        });
    });

    describe('deleteSegment', () => {
        it('removes a segment', () => {
            addSegment(store);
            const result = deleteSegment(store, 1);
            expect(result).toBe(true);
            expect(store.segments).toHaveLength(1);
        });

        it('resets last segment to empty', () => {
            addWaypoint(store, 50.0, 14.0);
            const result = deleteSegment(store, 0);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(0);
        });
    });

    describe('splitSegment', () => {
        it('splits at given point', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            addWaypoint(store, 50.02, 14.02);
            addWaypoint(store, 50.03, 14.03);
            const result = splitSegment(store, 1);
            expect(result).toBe(true);
            expect(store.segments).toHaveLength(2);
        });

        it('rejects split at first or last point', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            expect(splitSegment(store, 0)).toBe(false);
        });
    });

    describe('reverseSegment', () => {
        it('reverses point order', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            addWaypoint(store, 50.02, 14.02);
            reverseSegment(store, 0);
            expect(store.segments[0].points[0]).toEqual([50.02, 14.02]);
            expect(store.segments[0].points[2]).toEqual([50.0, 14.0]);
        });
    });

    describe('reverseTrack', () => {
        it('reverses all segments and their order', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            addSegment(store);
            addWaypoint(store, 60.0, 20.0);
            addWaypoint(store, 60.01, 20.01);
            reverseTrack(store);
            // First segment now has the second segment's points reversed
            expect(store.segments[0].points[0]).toEqual([60.01, 20.01]);
        });
    });

    describe('joinSegments', () => {
        it('joins two adjacent segments', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            addSegment(store);
            addWaypoint(store, 60.0, 20.0);
            const result = joinSegments(store, 0, 1);
            expect(result).toBe(true);
            expect(store.segments).toHaveLength(1);
            expect(store.segments[0].points).toHaveLength(3);
        });

        it('rejects non-adjacent segments', () => {
            addSegment(store);
            addSegment(store);
            expect(joinSegments(store, 0, 2)).toBe(false);
        });
    });

    describe('closeLoop', () => {
        it('closes loop by adding first point at end', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            addWaypoint(store, 50.02, 14.02);
            // Move last point far from first
            store.segments[0].points[2] = [50.03, 14.03];
            const result = closeLoop(store);
            expect(result).toBe(true);
            expect(store.segments[0].points).toHaveLength(4);
            expect(store.segments[0].points[3]).toEqual([50.0, 14.0]);
        });

        it('rejects when already closed', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.00001, 14.00001); // Very close
            const result = closeLoop(store);
            expect(result).toBe(false);
        });
    });

    describe('toGeoJSON', () => {
        it('converts segments to MultiLineString', () => {
            addWaypoint(store, 50.0, 14.0);
            addWaypoint(store, 50.01, 14.01);
            const geojson = toGeoJSON(store);
            expect(geojson.type).toBe('MultiLineString');
            expect(geojson.coordinates[0]).toEqual([[14.0, 50.0], [14.01, 50.01]]);
        });

        it('returns null for empty track', () => {
            expect(toGeoJSON(store)).toBeNull();
        });
    });

    describe('fromGeoJSON', () => {
        it('loads MultiLineString geometry', () => {
            const geojson = {
                type: 'MultiLineString',
                coordinates: [
                    [[14.0, 50.0], [14.01, 50.01]],
                    [[15.0, 51.0], [15.01, 51.01]],
                ],
            };
            fromGeoJSON(store, geojson);
            expect(store.segments).toHaveLength(2);
            expect(store.segments[0].points[0]).toEqual([50.0, 14.0]);
        });

        it('loads LineString geometry', () => {
            const geojson = {
                type: 'LineString',
                coordinates: [[14.0, 50.0], [14.01, 50.01]],
            };
            fromGeoJSON(store, geojson);
            expect(store.segments).toHaveLength(1);
        });

        it('handles empty geometry', () => {
            fromGeoJSON(store, { type: 'Point', coordinates: [14.0, 50.0] });
            expect(store.segments).toHaveLength(1);
            expect(store.segments[0].points).toHaveLength(0);
        });
    });
});
