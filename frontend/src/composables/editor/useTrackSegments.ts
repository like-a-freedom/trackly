import type { Ref } from 'vue';
import { haversineDistance } from '../../utils/haversine';
import type { Segment, LatLngTuple, EditorMode } from '@/types';
import type { RoutingAdapter, RouteData } from './useTrackWaypoints';

const SURFACE_UNKNOWN = 'unknown';
const MIN_POINT_DISTANCE_M = 5;

export interface SegmentEditorContext {
    editorMode: Ref<EditorMode>;
    geometry: {
        segments: Ref<Segment[]>;
        activeSegmentIndex: Ref<number>;
        totalPoints: Ref<number>;
        addSegment(): number;
        deleteSegment(segIndex: number): boolean;
        splitSegment(pointIndex: number): boolean;
        reverseSegment(segIndex: number): void;
        reverseTrack(): boolean;
        joinSegments(segIndexA: number, segIndexB: number): boolean;
        closeLoop(): boolean;
        promoteToWaypoint(segIndex: number, pointIndex: number): boolean;
        setActiveSegment(index: number): void;
    };
    routing: RoutingAdapter;
    saveUndoState(): void;
    autosave(): void;
    scheduleGeometryUpdates(): void;
}

export interface SegmentOperations {
    addSegment(): number;
    deleteSegment(segIndex: number): boolean;
    splitSegment(pointIndex: number): boolean;
    reverseSegment(segIndex: number): void;
    reverseTrack(): boolean;
    setActiveSegment(index: number): void;
    joinSegments(segIndexA: number, segIndexB: number): boolean;
    closeLoop(): boolean;
    closeLoopSameWay(): boolean;
    closeLoopDifferentRoute(options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean;
    promoteToWaypoint(segIndex: number, pointIndex: number): boolean;
    deleteLastPoint(): boolean;
}

export function useTrackSegments(ctx: SegmentEditorContext): SegmentOperations {
    const { editorMode, geometry, routing, saveUndoState, autosave, scheduleGeometryUpdates } = ctx;

    function addSegment(): number {
        const idx = geometry.addSegment();
        if (idx >= 0) {
            autosave();
            scheduleGeometryUpdates();
        }
        return idx;
    }

    function deleteSegment(segIndex: number): boolean {
        saveUndoState();
        const ok = geometry.deleteSegment(segIndex);
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function splitSegment(pointIndex: number): boolean {
        saveUndoState();
        const ok = geometry.splitSegment(pointIndex);
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function reverseSegment(segIndex: number): void {
        saveUndoState();
        geometry.reverseSegment(segIndex);
        autosave();
        scheduleGeometryUpdates();
    }

    function reverseTrack(): boolean {
        saveUndoState();
        const ok = geometry.reverseTrack();
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function setActiveSegment(index: number): void {
        geometry.setActiveSegment(index);
    }

    function joinSegments(segIndexA: number, segIndexB: number): boolean {
        saveUndoState();
        const ok = geometry.joinSegments(segIndexA, segIndexB);
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function closeLoop(): boolean {
        saveUndoState();
        const ok = geometry.closeLoop();
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function closeLoopSameWay(): boolean {
        const seg = geometry.segments.value[geometry.activeSegmentIndex.value];
        if (!seg || seg.points.length < 2) return false;

        const first = seg.points[0];
        const last = seg.points[seg.points.length - 1];
        const dist = haversineDistance({ lat: first[0], lng: first[1] }, { lat: last[0], lng: last[1] });
        if (dist < MIN_POINT_DISTANCE_M) return false;

        saveUndoState();
        const reversed = seg.points.slice(0, -1).reverse();
        for (const pt of reversed) {
            seg.points.push([pt[0], pt[1]]);
            if (!seg.surfaceTypes) seg.surfaceTypes = [];
            while (seg.surfaceTypes.length < seg.points.length) {
                seg.surfaceTypes.push(SURFACE_UNKNOWN);
            }
            seg.surfaceTypes.push(SURFACE_UNKNOWN);
        }
        const turnIdx = seg.points.length - reversed.length;
        if (!seg.waypoints.includes(turnIdx)) seg.waypoints.push(turnIdx);
        seg.waypoints.push(seg.points.length - 1);
        seg.waypoints.sort((a, b) => a - b);

        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    function closeLoopDifferentRoute({ onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        const seg = geometry.segments.value[geometry.activeSegmentIndex.value];
        if (!seg || seg.points.length < 2) return false;

        const first = seg.points[0];
        const last = seg.points[seg.points.length - 1];
        const dist = haversineDistance({ lat: first[0], lng: first[1] }, { lat: last[0], lng: last[1] });
        if (dist < MIN_POINT_DISTANCE_M) return false;

        const routeData = routing.findRouteDetailed(
            { lat: last[0], lng: last[1] },
            { lat: first[0], lng: first[1] },
            { onNotAvailable: onRoutingNotAvailable },
        );

        if (!routeData || routeData.points.length < 2) return false;

        saveUndoState();
        const routedPts = routeData.points.slice(1);
        const routedSurfaces = routeData.surfaceTypes.slice(1);
        for (let i = 0; i < routedPts.length; i++) {
            seg.points.push(routedPts[i]);
            if (!seg.surfaceTypes) seg.surfaceTypes = [];
            while (seg.surfaceTypes.length < seg.points.length) {
                seg.surfaceTypes.push(SURFACE_UNKNOWN);
            }
            seg.surfaceTypes.push(routedSurfaces[i] || SURFACE_UNKNOWN);
        }
        seg.waypoints.push(seg.points.length - 1);
        seg.waypoints.sort((a, b) => a - b);

        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    function promoteToWaypoint(segIndex: number, pointIndex: number): boolean {
        const ok = geometry.promoteToWaypoint(segIndex, pointIndex);
        if (ok) autosave();
        return ok;
    }

    function deleteLastPoint(): boolean {
        const seg = geometry.segments.value[geometry.activeSegmentIndex.value];
        if (!seg || seg.points.length === 0) return false;

        saveUndoState();
        seg.points.pop();
        if (seg.surfaceTypes && seg.surfaceTypes.length > seg.points.length) {
            seg.surfaceTypes.pop();
        }
        // Remove waypoint indices that no longer point to valid points
        seg.waypoints = seg.waypoints.filter((idx) => idx < seg.points.length);
        // Ensure last point is a waypoint
        if (seg.points.length > 0 && !seg.waypoints.includes(seg.points.length - 1)) {
            seg.waypoints.push(seg.points.length - 1);
            seg.waypoints.sort((a, b) => a - b);
        }

        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    return {
        addSegment,
        deleteSegment,
        splitSegment,
        reverseSegment,
        reverseTrack,
        setActiveSegment,
        joinSegments,
        closeLoop,
        closeLoopSameWay,
        closeLoopDifferentRoute,
        promoteToWaypoint,
        deleteLastPoint,
    };
}
