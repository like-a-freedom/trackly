import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, type Ref } from 'vue';
import { useTrackSegments, type SegmentEditorContext } from '../useTrackSegments';
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

function createMockContext(overrides: Partial<SegmentEditorContext> = {}): SegmentEditorContext {
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
            addSegment: vi.fn().mockImplementation(() => {
                segments.value.push(createTestSegment({ color: '#4CAF50' }));
                return segments.value.length - 1;
            }),
            deleteSegment: vi.fn().mockImplementation((idx: number) => {
                if (idx >= 0 && idx < segments.value.length) {
                    segments.value.splice(idx, 1);
                    return true;
                }
                return false;
            }),
            splitSegment: vi.fn().mockReturnValue(true),
            reverseSegment: vi.fn().mockImplementation((idx: number) => {
                const seg = segments.value[idx];
                if (seg) seg.points.reverse();
            }),
            reverseTrack: vi.fn().mockReturnValue(true),
            joinSegments: vi.fn().mockReturnValue(true),
            closeLoop: vi.fn().mockReturnValue(true),
            promoteToWaypoint: vi.fn().mockReturnValue(true),
            setActiveSegment: vi.fn().mockImplementation((idx: number) => {
                activeSegmentIndex.value = idx;
            }),
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

describe('useTrackSegments', () => {
    describe('addSegment', () => {
        it('adds a segment and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const idx = ops.addSegment();

            expect(idx).toBe(1);
            expect(ctx.geometry.addSegment).toHaveBeenCalled();
            expect(ctx.autosave).toHaveBeenCalled();
            expect(ctx.scheduleGeometryUpdates).toHaveBeenCalled();
        });
    });

    describe('deleteSegment', () => {
        it('deletes a segment and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.deleteSegment(0);

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.geometry.deleteSegment).toHaveBeenCalledWith(0);
            expect(ctx.autosave).toHaveBeenCalled();
        });
    });

    describe('splitSegment', () => {
        it('splits a segment and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.splitSegment(1);

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.geometry.splitSegment).toHaveBeenCalledWith(1);
        });
    });

    describe('reverseSegment', () => {
        it('reverses a segment and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            ops.reverseSegment(0);

            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.geometry.reverseSegment).toHaveBeenCalledWith(0);
            expect(ctx.autosave).toHaveBeenCalled();
        });
    });

    describe('reverseTrack', () => {
        it('reverses the track and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.reverseTrack();

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.geometry.reverseTrack).toHaveBeenCalled();
        });
    });

    describe('setActiveSegment', () => {
        it('sets the active segment', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            ops.setActiveSegment(0);

            expect(ctx.geometry.setActiveSegment).toHaveBeenCalledWith(0);
        });
    });

    describe('joinSegments', () => {
        it('joins segments and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.joinSegments(0, 1);

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.geometry.joinSegments).toHaveBeenCalledWith(0, 1);
        });
    });

    describe('closeLoop', () => {
        it('closes the loop and triggers side effects', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.closeLoop();

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.geometry.closeLoop).toHaveBeenCalled();
        });
    });

    describe('closeLoopSameWay', () => {
        it('closes loop by retracing path', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.closeLoopSameWay();

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.autosave).toHaveBeenCalled();
        });

        it('returns false for short segments', () => {
            const seg = createTestSegment({
                points: [[50, 30]] as LatLngTuple[],
                waypoints: [0],
            });
            const ctx = createMockContext();
            ctx.geometry.segments = ref([seg]);
            const ops = useTrackSegments(ctx);

            const result = ops.closeLoopSameWay();

            expect(result).toBe(false);
        });

        it('returns false when start and end are too close', () => {
            const seg = createTestSegment({
                points: [[50, 30], [50.0000001, 30.0000001]] as LatLngTuple[],
                waypoints: [0, 1],
            });
            const ctx = createMockContext();
            ctx.geometry.segments = ref([seg]);
            const ops = useTrackSegments(ctx);

            const result = ops.closeLoopSameWay();

            expect(result).toBe(false);
        });
    });

    describe('closeLoopDifferentRoute', () => {
        it('returns false for short segments', () => {
            const seg = createTestSegment({
                points: [[50, 30]] as LatLngTuple[],
                waypoints: [0],
            });
            const ctx = createMockContext();
            ctx.geometry.segments = ref([seg]);
            const ops = useTrackSegments(ctx);

            const result = ops.closeLoopDifferentRoute();

            expect(result).toBe(false);
        });

        it('returns false when routing fails', () => {
            const ctx = createMockContext();
            ctx.routing.findRouteDetailed = vi.fn().mockReturnValue(null);
            const ops = useTrackSegments(ctx);

            const result = ops.closeLoopDifferentRoute();

            expect(result).toBe(false);
        });
    });

    describe('promoteToWaypoint', () => {
        it('promotes a point to waypoint', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.promoteToWaypoint(0, 1);

            expect(result).toBe(true);
            expect(ctx.geometry.promoteToWaypoint).toHaveBeenCalledWith(0, 1);
            expect(ctx.autosave).toHaveBeenCalled();
        });
    });

    describe('deleteLastPoint', () => {
        it('deletes the last point of active segment', () => {
            const ctx = createMockContext();
            const ops = useTrackSegments(ctx);

            const result = ops.deleteLastPoint();

            expect(result).toBe(true);
            expect(ctx.saveUndoState).toHaveBeenCalled();
            expect(ctx.autosave).toHaveBeenCalled();
            expect(ctx.geometry.segments.value[0].points.length).toBe(2);
        });

        it('returns false for empty segment', () => {
            const seg = createTestSegment({ points: [] as LatLngTuple[] });
            const ctx = createMockContext();
            ctx.geometry.segments = ref([seg]);
            const ops = useTrackSegments(ctx);

            const result = ops.deleteLastPoint();

            expect(result).toBe(false);
        });
    });
});
