import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, type Ref } from 'vue';
import { useTrackWaypoints, type WaypointEditorContext } from '../useTrackWaypoints';
import type { Segment, LatLngTuple, EditorMode } from '@/types';

function createTestSegment(overrides: Partial<Segment> = {}): Segment {
    return {
        points: [[50, 30], [50.001, 30.001], [50.002, 30.002]] as LatLngTuple[],
        waypoints: [0, 2],
        surfaceTypes: ['unknown', 'unknown', 'unknown'],
        name: null,
        color: '#2196F3',
        ...overrides,
    };
}

function createMockContext(overrides: Partial<WaypointEditorContext> = {}): WaypointEditorContext {
    const segments = ref<Segment[]>([createTestSegment()]);
    const activeSegmentIndex = ref(0);
    const editorMode = ref<EditorMode>('edit');
    const routingMode = ref('manual');

    return {
        editorMode,
        geometry: {
            segments,
            activeSegmentIndex,
            totalPoints: ref(3),
        },
        routing: {
            mode: routingMode,
            graphReady: ref(false),
            graphLoading: ref(false),
            ensureGraphLoaded: vi.fn(),
            findRouteDetailed: vi.fn().mockReturnValue(null),
        },
        saveUndoState: vi.fn(),
        autosave: vi.fn(),
        scheduleGeometryUpdates: vi.fn(),
        ...overrides,
    };
}

describe('useTrackWaypoints', () => {
    describe('addWaypoint', () => {
        it('adds a waypoint in manual mode', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            const result = ops.addWaypoint(50.003, 30.003);

            expect(result).toBe(true);
            expect(ctx.geometry.segments.value[0].points.length).toBe(4);
            expect(ctx.geometry.segments.value[0].waypoints).toContain(3);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.autosave).toHaveBeenCalled();
            expect(ctx.scheduleGeometryUpdates).toHaveBeenCalled();
        });

        it('rejects when in view mode', () => {
            const ctx = createMockContext({ editorMode: ref<EditorMode>('view') });
            const ops = useTrackWaypoints(ctx);

            const result = ops.addWaypoint(50.003, 30.003);

            expect(result).toBe(false);
            expect(ctx.saveUndoState).not.toHaveBeenCalled();
        });

        it('rejects invalid coordinates', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.addWaypoint(91, 30)).toBe(false);
            expect(ops.addWaypoint(50, 181)).toBe(false);
            expect(ops.addWaypoint(NaN, 30)).toBe(false);
        });

        it('rejects points too close together', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            // Try to add a point very close to the last point
            const result = ops.addWaypoint(50.0020001, 30.0020001);

            expect(result).toBe(false);
        });

        it('rejects when exceeding max points', () => {
            const ctx = createMockContext();
            ctx.geometry.totalPoints = ref(100_000);
            const ops = useTrackWaypoints(ctx);

            const result = ops.addWaypoint(50.003, 30.003);

            expect(result).toBe(false);
        });
    });

    describe('moveWaypoint', () => {
        it('moves a waypoint in manual mode', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            const result = ops.moveWaypoint(0, 1, 50.005, 30.005);

            expect(result).toBe(true);
            expect(ctx.geometry.segments.value[0].points[1]).toEqual([50.005, 30.005]);
            expect(ctx.saveUndoState).toHaveBeenCalled();
        });

        it('rejects invalid coordinates', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.moveWaypoint(0, 1, 91, 30)).toBe(false);
        });

        it('rejects invalid segment index', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.moveWaypoint(5, 1, 50, 30)).toBe(false);
        });

        it('rejects invalid point index', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.moveWaypoint(0, 10, 50, 30)).toBe(false);
        });

        it('normalizes waypoints after move', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            ops.moveWaypoint(0, 1, 50.005, 30.005);

            const seg = ctx.geometry.segments.value[0];
            // First and last should always be waypoints
            expect(seg.waypoints).toContain(0);
            expect(seg.waypoints).toContain(seg.points.length - 1);
        });
    });

    describe('deleteWaypoint', () => {
        it('deletes a waypoint', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            const result = ops.deleteWaypoint(0, 1);

            expect(result).toBe(true);
            expect(ctx.geometry.segments.value[0].points.length).toBe(2);
            expect(ctx.saveUndoState).toHaveBeenCalled();
        });

        it('returns false for invalid segment', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.deleteWaypoint(5, 1)).toBe(false);
        });

        it('adjusts waypoint indices after deletion', () => {
            const seg = createTestSegment({
                points: [[50, 30], [50.001, 30.001], [50.002, 30.002], [50.003, 30.003]] as LatLngTuple[],
                waypoints: [0, 1, 2, 3],
            });
            const ctx = createMockContext();
            ctx.geometry.segments = ref([seg]);
            const ops = useTrackWaypoints(ctx);

            ops.deleteWaypoint(0, 1);

            const resultSeg = ctx.geometry.segments.value[0];
            // Waypoint indices should be adjusted
            expect(resultSeg.waypoints.every((idx) => idx < resultSeg.points.length)).toBe(true);
        });
    });

    describe('insertWaypoint', () => {
        it('inserts a waypoint after specified index', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            const result = ops.insertWaypoint(0, 0, 50.0005, 30.0005);

            expect(result).toBe(true);
            expect(ctx.geometry.segments.value[0].points.length).toBe(4);
            expect(ctx.geometry.segments.value[0].points[1]).toEqual([50.0005, 30.0005]);
        });

        it('rejects invalid coordinates', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.insertWaypoint(0, 0, 91, 30)).toBe(false);
        });

        it('rejects invalid afterIndex', () => {
            const ctx = createMockContext();
            const ops = useTrackWaypoints(ctx);

            expect(ops.insertWaypoint(0, 10, 50, 30)).toBe(false);
        });

        it('rejects when exceeding max points', () => {
            const ctx = createMockContext();
            ctx.geometry.totalPoints = ref(100_000);
            const ops = useTrackWaypoints(ctx);

            expect(ops.insertWaypoint(0, 0, 50.0005, 30.0005)).toBe(false);
        });
    });
});
