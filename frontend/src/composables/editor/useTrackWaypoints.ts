import type { Ref } from 'vue';
import { haversineDistance } from '../../utils/haversine';
import { isValidCoord } from './trackGeometryUtils';
import type { Segment, LatLngTuple, EditorMode } from '@/types';

const SURFACE_UNKNOWN = 'unknown';
const MIN_POINT_DISTANCE_M = 5;
const MAX_TRACK_POINTS = 100_000;

export interface RouteData {
    points: LatLngTuple[];
    surfaceTypes: string[];
}

export interface RoutingAdapter {
    mode: Ref<string>;
    graphReady: Ref<boolean>;
    graphLoading: Ref<boolean>;
    ensureGraphLoaded(): void;
    findRouteDetailed(
        from: { lat: number; lng: number },
        to: { lat: number; lng: number },
        options?: { onNotAvailable?: (msg: string) => void },
    ): RouteData | null;
}

export interface GeometryAdapter {
    segments: Ref<Segment[]>;
    activeSegmentIndex: Ref<number>;
    totalPoints: Ref<number>;
}

export interface WaypointEditorContext {
    editorMode: Ref<EditorMode>;
    geometry: GeometryAdapter;
    routing: RoutingAdapter;
    saveUndoState(): void;
    autosave(): void;
    scheduleGeometryUpdates(): void;
}

export interface WaypointOperations {
    addWaypoint(lat: number, lng: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean;
    moveWaypoint(segIndex: number, pointIndex: number, lat: number, lng: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean;
    deleteWaypoint(segIndex: number, pointIndex: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean;
    insertWaypoint(segIndex: number, afterIndex: number, lat: number, lng: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean;
}

export function useTrackWaypoints(ctx: WaypointEditorContext): WaypointOperations {
    const { editorMode, geometry, routing, saveUndoState, autosave, scheduleGeometryUpdates } = ctx;

    function addWaypoint(lat: number, lng: number, { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        if (editorMode.value === 'view') return false;
        if (!isValidCoord(lat, lng)) return false;
        if (geometry.totalPoints.value >= MAX_TRACK_POINTS) return false;

        const seg = geometry.segments.value[geometry.activeSegmentIndex.value];
        const newPoint: LatLngTuple = [lat, lng];

        if (seg.points.length > 0) {
            const last = seg.points[seg.points.length - 1];
            const dist = haversineDistance({ lat: last[0], lng: last[1] }, { lat, lng });
            if (dist < MIN_POINT_DISTANCE_M) return false;
        }

        if (seg.points.length > 0 && routing.mode.value === 'auto') {
            if (!routing.graphReady.value && !routing.graphLoading.value) {
                routing.ensureGraphLoaded();
            }
            const lastPt = seg.points[seg.points.length - 1];
            const routeData = routing.findRouteDetailed(
                { lat: lastPt[0], lng: lastPt[1] },
                { lat, lng },
                { onNotAvailable: onRoutingNotAvailable },
            );

            if (routeData && routeData.points.length >= 2) {
                const route = routeData.points;
                const surfaceTypes = routeData.surfaceTypes || route.map(() => SURFACE_UNKNOWN);
                saveUndoState();
                for (let i = 1; i < route.length; i++) {
                    seg.points.push(route[i]);
                }
                seg.waypoints.push(seg.points.length - 1);
                if (!seg.surfaceTypes) seg.surfaceTypes = [];
                while (seg.surfaceTypes.length < seg.points.length) {
                    seg.surfaceTypes.push(SURFACE_UNKNOWN);
                }
                seg.surfaceTypes.push(...surfaceTypes.slice(1));
            } else {
                return false;
            }
        } else {
            saveUndoState();
            seg.points.push(newPoint);
            seg.waypoints.push(seg.points.length - 1);
            if (!seg.surfaceTypes) seg.surfaceTypes = [];
            while (seg.surfaceTypes.length < seg.points.length) {
                seg.surfaceTypes.push(SURFACE_UNKNOWN);
            }
            seg.surfaceTypes[seg.surfaceTypes.length - 1] = SURFACE_UNKNOWN;
        }

        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    function moveWaypoint(segIndex: number, pointIndex: number, lat: number, lng: number, { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        if (!isValidCoord(lat, lng)) return false;
        const seg = geometry.segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;

        const updatedSeg: Segment = {
            points: seg.points.map((p) => [...p] as LatLngTuple),
            waypoints: [...seg.waypoints],
            surfaceTypes: seg.surfaceTypes ? [...seg.surfaceTypes] : [],
            name: seg.name,
            color: seg.color,
        };
        updatedSeg.points[pointIndex] = [lat, lng];
        while (updatedSeg.surfaceTypes!.length < updatedSeg.points.length) {
            updatedSeg.surfaceTypes!.push(SURFACE_UNKNOWN);
        }
        updatedSeg.surfaceTypes![pointIndex] = SURFACE_UNKNOWN;
        if (updatedSeg.points.length > 0) {
            const waypointSet = new Set(updatedSeg.waypoints);
            waypointSet.add(0);
            waypointSet.add(updatedSeg.points.length - 1);
            updatedSeg.waypoints = Array.from(waypointSet)
                .filter((idx) => idx >= 0 && idx < updatedSeg.points.length)
                .sort((a, b) => a - b);
        }

        applyUpdatedSegmentWithRouting(seg, updatedSeg, { onRoutingNotAvailable });
        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    function deleteWaypoint(segIndex: number, pointIndex: number, { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        const seg = geometry.segments.value[segIndex];
        if (!seg) return false;
        if (seg.points.length <= 1) {
            return false; // Caller should handle segment deletion
        }

        const updatedSeg: Segment = {
            points: seg.points.map((p) => [...p] as LatLngTuple),
            waypoints: [...seg.waypoints],
            surfaceTypes: seg.surfaceTypes ? [...seg.surfaceTypes] : [],
            name: seg.name,
            color: seg.color,
        };

        updatedSeg.points.splice(pointIndex, 1);
        if (updatedSeg.surfaceTypes!.length) {
            updatedSeg.surfaceTypes!.splice(pointIndex, 1);
        }
        updatedSeg.waypoints = updatedSeg.waypoints
            .filter((idx) => idx !== pointIndex)
            .map((idx) => (idx > pointIndex ? idx - 1 : idx));
        if (updatedSeg.points.length > 0) {
            const waypointSet = new Set(updatedSeg.waypoints);
            waypointSet.add(0);
            waypointSet.add(updatedSeg.points.length - 1);
            updatedSeg.waypoints = Array.from(waypointSet)
                .filter((idx) => idx >= 0 && idx < updatedSeg.points.length)
                .sort((a, b) => a - b);
        }

        applyUpdatedSegmentWithRouting(seg, updatedSeg, { onRoutingNotAvailable });
        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    function insertWaypoint(segIndex: number, afterIndex: number, lat: number, lng: number, { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        if (!isValidCoord(lat, lng)) return false;
        const seg = geometry.segments.value[segIndex];
        if (!seg || afterIndex < 0 || afterIndex >= seg.points.length) return false;
        if (geometry.totalPoints.value >= MAX_TRACK_POINTS) return false;

        const updatedSeg: Segment = {
            points: seg.points.map((p) => [...p] as LatLngTuple),
            waypoints: [...seg.waypoints],
            surfaceTypes: seg.surfaceTypes ? [...seg.surfaceTypes] : [],
            name: seg.name,
            color: seg.color,
        };

        updatedSeg.points.splice(afterIndex + 1, 0, [lat, lng]);
        if (updatedSeg.surfaceTypes) {
            updatedSeg.surfaceTypes.splice(afterIndex + 1, 0, SURFACE_UNKNOWN);
        }
        updatedSeg.waypoints = updatedSeg.waypoints.map((idx) =>
            idx > afterIndex ? idx + 1 : idx,
        );
        updatedSeg.waypoints.push(afterIndex + 1);
        updatedSeg.waypoints.sort((a, b) => a - b);
        if (updatedSeg.points.length > 0) {
            const waypointSet = new Set(updatedSeg.waypoints);
            waypointSet.add(0);
            waypointSet.add(updatedSeg.points.length - 1);
            updatedSeg.waypoints = Array.from(waypointSet)
                .filter((idx) => idx >= 0 && idx < updatedSeg.points.length)
                .sort((a, b) => a - b);
        }

        applyUpdatedSegmentWithRouting(seg, updatedSeg, { onRoutingNotAvailable });
        autosave();
        scheduleGeometryUpdates();
        return true;
    }

    function applyUpdatedSegmentWithRouting(
        seg: Segment,
        updatedSeg: Segment,
        { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {},
    ): void {
        if (routing.mode.value === 'auto') {
            if (!routing.graphReady.value && !routing.graphLoading.value) {
                routing.ensureGraphLoaded();
            }
            const orderedWaypoints = [...updatedSeg.waypoints].sort((a, b) => a - b);
            if (orderedWaypoints.length >= 2) {
                const newPoints: LatLngTuple[] = [];
                const newWaypoints: number[] = [];
                const newSurfaceTypes: string[] = [];

                for (let i = 0; i < orderedWaypoints.length - 1; i++) {
                    const fromIdx = orderedWaypoints[i];
                    const toIdx = orderedWaypoints[i + 1];
                    const from = updatedSeg.points[fromIdx];
                    const to = updatedSeg.points[toIdx];

                    const routeData = routing.findRouteDetailed(
                        { lat: from[0], lng: from[1] },
                        { lat: to[0], lng: to[1] },
                        { onNotAvailable: onRoutingNotAvailable },
                    );

                    if (!routeData || routeData.points.length < 2) {
                        // If routing fails, fall back to direct segment
                        saveUndoState();
                        seg.points = updatedSeg.points;
                        seg.waypoints = updatedSeg.waypoints;
                        seg.surfaceTypes = updatedSeg.surfaceTypes;
                        return;
                    }
                    const route = routeData.points;
                    const surfaceTypes = routeData.surfaceTypes || route.map(() => SURFACE_UNKNOWN);

                    if (newPoints.length === 0) {
                        newPoints.push(...route);
                        newSurfaceTypes.push(...surfaceTypes);
                        newWaypoints.push(0);
                    } else {
                        newPoints.push(...route.slice(1));
                        newSurfaceTypes.push(...surfaceTypes.slice(1));
                    }
                    newWaypoints.push(newPoints.length - 1);
                }

                saveUndoState();
                seg.points = newPoints;
                seg.waypoints = newWaypoints;
                seg.surfaceTypes = newSurfaceTypes;
            } else {
                saveUndoState();
                seg.points = updatedSeg.points;
                seg.waypoints = updatedSeg.waypoints;
                seg.surfaceTypes = updatedSeg.surfaceTypes;
            }
        } else {
            saveUndoState();
            seg.points = updatedSeg.points;
            seg.waypoints = updatedSeg.waypoints;
            seg.surfaceTypes = updatedSeg.surfaceTypes;
        }
    }

    return {
        addWaypoint,
        moveWaypoint,
        deleteWaypoint,
        insertWaypoint,
    };
}
