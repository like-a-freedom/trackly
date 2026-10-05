import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { haversineDistance } from '../../utils/haversine';
import { isValidCoord, getDefaultSegmentColor, calcSegmentDistance } from './trackGeometryUtils';
import type { LatLngTuple, Segment, SegmentStats } from '@/types';

const MAX_TRACK_POINTS = 100_000;
const MAX_SEGMENTS = 100;
const MIN_POINT_DISTANCE_M = 5;
const SURFACE_UNKNOWN = 'unknown';

interface EditorStore {
    segments: Segment[];
    activeSegmentIndex: number;
    editorMode: string;
    totalPoints: number;
}

/**
 * Composable for track geometry operations.
 * Can be used standalone or with the editorStore.
 */
export function useTrackGeometry({ initialSegments = null }: { initialSegments?: Segment[] | null } = {}) {
    const segments: Ref<Segment[]> = ref(initialSegments || [createEmptySegment(0)]);
    const activeSegmentIndex: Ref<number> = ref(0);

    const activeSegment: ComputedRef<Segment | undefined> = computed(() => segments.value[activeSegmentIndex.value]);
    const totalPoints: ComputedRef<number> = computed(() =>
        segments.value.reduce((sum, s) => sum + s.points.length, 0)
    );
    const totalDistanceKm: ComputedRef<number> = computed(() => {
        let total = 0;
        for (const seg of segments.value) {
            total += calcSegmentDistance(seg.points);
        }
        return total / 1000;
    });
    const coordinateData: ComputedRef<LatLngTuple[]> = computed(() =>
        segments.value.flatMap((seg) => seg.points)
    );
    const segmentStats: ComputedRef<SegmentStats[]> = computed(() =>
        segments.value.map((seg, i) => {
            const displayName = seg.name?.trim() || `Day ${i + 1}`;
            return {
                index: i,
                name: seg.name ?? '',
                displayName,
                pointCount: seg.points.length,
                distanceKm: calcSegmentDistance(seg.points) / 1000,
                color: seg.color || getDefaultSegmentColor(i),
            };
        })
    );

    function setSegmentName(index: number, name: string): boolean {
        const seg = segments.value[index];
        if (!seg) return false;
        const cleaned = String(name ?? '').trim();
        seg.name = cleaned.length > 0 ? cleaned : null;
        return true;
    }

    function setSegmentColor(index: number, color: string): boolean {
        const seg = segments.value[index];
        if (!seg) return false;
        const cleaned = String(color ?? '').trim();
        if (!/^#([0-9a-fA-F]{6})$/.test(cleaned)) return false;
        seg.color = cleaned;
        return true;
    }

    function promoteToWaypoint(segIndex: number, pointIndex: number): boolean {
        const seg = segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;
        if (seg.waypoints.includes(pointIndex)) return false;
        seg.waypoints.push(pointIndex);
        seg.waypoints.sort((a, b) => a - b);
        return true;
    }

    function addSegmentFn(): number {
        if (segments.value.length >= MAX_SEGMENTS) return -1;
        const newSeg = createEmptySegment(segments.value.length);
        segments.value.push(newSeg);
        activeSegmentIndex.value = segments.value.length - 1;
        return activeSegmentIndex.value;
    }

    function deleteSegmentFn(segIndex: number): boolean {
        if (segIndex < 0 || segIndex >= segments.value.length) return false;
        if (segments.value.length === 1) {
            segments.value = [createEmptySegment(0)];
            activeSegmentIndex.value = 0;
        } else {
            segments.value.splice(segIndex, 1);
            if (activeSegmentIndex.value >= segments.value.length) {
                activeSegmentIndex.value = segments.value.length - 1;
            }
        }
        return true;
    }

    function setActiveSegment(index: number): void {
        if (index >= 0 && index < segments.value.length) {
            activeSegmentIndex.value = index;
        }
    }

    function getSegment(index: number): Segment | undefined {
        return segments.value[index];
    }

    function reverseSegment(segIndex: number): void {
        const seg = segments.value[segIndex];
        if (!seg || seg.points.length < 2) return;
        const len = seg.points.length;
        seg.points.reverse();
        seg.waypoints = seg.waypoints.map((i) => len - 1 - i).sort((a, b) => a - b);
        if (seg.surfaceTypes) {
            seg.surfaceTypes.reverse();
        }
    }

    function reverseTrack(): boolean {
        if (!segments.value.length) return false;
        segments.value = segments.value
            .map((seg) => {
                if (!seg || seg.points.length < 2) return seg;
                const len = seg.points.length;
                return {
                    ...seg,
                    points: [...seg.points].reverse(),
                    waypoints: seg.waypoints
                        .map((i) => len - 1 - i)
                        .sort((a, b) => a - b),
                    surfaceTypes: seg.surfaceTypes
                        ? [...seg.surfaceTypes].reverse()
                        : [],
                };
            })
            .reverse();
        activeSegmentIndex.value = Math.max(
            0,
            segments.value.length - 1 - activeSegmentIndex.value
        );
        return true;
    }

    function clearSegments(): void {
        segments.value = [createEmptySegment(0)];
        activeSegmentIndex.value = 0;
    }

    function splitSegment(pointIndex: number): boolean {
        const seg = segments.value[activeSegmentIndex.value];
        if (!seg || pointIndex <= 0 || pointIndex >= seg.points.length - 1) {
            return false;
        }

        const firstPoints = seg.points.slice(0, pointIndex + 1);
        const secondPoints = seg.points.slice(pointIndex);
        const firstSurface = seg.surfaceTypes ? seg.surfaceTypes.slice(0, pointIndex + 1) : [];
        const secondSurface = seg.surfaceTypes ? seg.surfaceTypes.slice(pointIndex) : [];

        const firstWaypoints = seg.waypoints.filter((i) => i <= pointIndex).sort((a, b) => a - b);
        const secondWaypoints = seg.waypoints
            .filter((i) => i >= pointIndex)
            .map((i) => i - pointIndex)
            .sort((a, b) => a - b);

        seg.points = firstPoints;
        seg.waypoints = firstWaypoints;
        seg.surfaceTypes = firstSurface;

        const newSeg: Segment = {
            points: secondPoints,
            waypoints: secondWaypoints,
            surfaceTypes: secondSurface,
            name: null,
            color: getDefaultSegmentColor(activeSegmentIndex.value + 1),
        };
        segments.value.splice(activeSegmentIndex.value + 1, 0, newSeg);

        return true;
    }

    function joinSegments(segIndexA: number, segIndexB: number): boolean {
        if (segIndexB !== segIndexA + 1) return false;
        const segA = segments.value[segIndexA];
        const segB = segments.value[segIndexB];
        if (!segA || !segB) return false;
        if (segA.points.length === 0 && segB.points.length === 0) return false;

        const offsetB = segA.points.length;
        segA.points = segA.points.concat(segB.points);
        if (segA.surfaceTypes || segB.surfaceTypes) {
            ensureSurfaceTypes(segA);
            ensureSurfaceTypes(segB);
            segA.surfaceTypes = segA.surfaceTypes!.concat(segB.surfaceTypes!);
        }
        const mergedWaypoints = segA.waypoints.concat(
            segB.waypoints.map((i) => i + offsetB),
        );
        segA.waypoints = [...new Set(mergedWaypoints)].sort((a, b) => a - b);

        segments.value.splice(segIndexB, 1);
        if (activeSegmentIndex.value >= segments.value.length) {
            activeSegmentIndex.value = segments.value.length - 1;
        }

        return true;
    }

    function closeLoop(): boolean {
        const seg = segments.value[activeSegmentIndex.value];
        if (!seg || seg.points.length < 3) return false;

        const first = seg.points[0];
        const last = seg.points[seg.points.length - 1];
        if (!first || !last) return false;
        const dist = haversineDistance(
            { lat: first[0], lng: first[1] },
            { lat: last[0], lng: last[1] },
        );

        if (dist < MIN_POINT_DISTANCE_M) return false;

        seg.points.push([first[0], first[1]]);
        seg.waypoints.push(seg.points.length - 1);
        ensureSurfaceTypes(seg);
        const surfaceTypes = seg.surfaceTypes;
        if (surfaceTypes) surfaceTypes.push(surfaceTypes[0] || SURFACE_UNKNOWN);

        return true;
    }

    function toGeoJSON(): GeoJSON.MultiLineString | null {
        const coords = segments.value
            .filter((s) => s.points.length >= 2)
            .map((s) => s.points.map(([lat, lng]) => [lng, lat]));

        if (coords.length === 0) return null;

        return {
            type: 'MultiLineString',
            coordinates: coords,
        };
    }

    function fromGeoJSON(geojson: GeoJSON.Geometry | null, anchors: Array<number | { lat: number; lon: number; index?: number; segment_index?: number }> = [], segmentMeta: Array<{ name?: string; color?: string }> = []): void {
        if (!geojson || !('coordinates' in geojson)) return;

        const coords = geojson.type === 'MultiLineString'
            ? (geojson as GeoJSON.MultiLineString).coordinates
            : geojson.type === 'LineString'
                ? [(geojson as GeoJSON.LineString).coordinates]
                : [];

        const metaList = Array.isArray(segmentMeta) ? segmentMeta : [];
        let pointOffset = 0;
        segments.value = coords.map((line, index) => {
            const points = line.map(([lng, lat]) => [lat, lng] as LatLngTuple);
            const waypointIndices = anchors.flatMap(anchor => {
                if (typeof anchor === 'number') {
                    const local = anchor - pointOffset;
                    return local >= 0 && local < points.length ? [local] : [];
                }
                if (anchor.segment_index !== undefined && anchor.segment_index !== index) return [];
                const local = anchor.index === undefined ? -1 : anchor.segment_index === undefined ? anchor.index - pointOffset : anchor.index;
                if (local >= 0 && local < points.length && Math.abs(points[local][0] - anchor.lat) < 1e-6 && Math.abs(points[local][1] - anchor.lon) < 1e-6) return [local];
                const match = points.findIndex(([lat, lon]) => Math.abs(lat - anchor.lat) < 1e-6 && Math.abs(lon - anchor.lon) < 1e-6);
                return match >= 0 ? [match] : [];
            });
            if (points.length) waypointIndices.push(0, points.length - 1);
            pointOffset += points.length;
            const meta = metaList[index] || {};
            return {
                points,
                waypoints: [...new Set(waypointIndices)].sort((a,b) => a-b),
                surfaceTypes: points.map(() => SURFACE_UNKNOWN),
                name: typeof meta.name === 'string' ? meta.name : null,
                color: typeof meta.color === 'string' ? meta.color : getDefaultSegmentColor(index),
            };
        });

        if (segments.value.length === 0) {
            segments.value = [createEmptySegment()];
        }
        activeSegmentIndex.value = 0;
    }

    return {
        segments,
        activeSegmentIndex,
        activeSegment,
        totalPoints,
        totalDistanceKm,
        coordinateData,
        segmentStats,
        createEmptySegment,
        ensureSurfaceTypes,
        normalizeWaypoints,
        setSegmentName,
        setSegmentColor,
        promoteToWaypoint,
        addSegment: addSegmentFn,
        deleteSegment: deleteSegmentFn,
        setActiveSegment,
        getSegment,
        reverseSegment,
        reverseTrack,
        clearSegments,
        splitSegment,
        joinSegments,
        closeLoop,
        toGeoJSON,
        fromGeoJSON,
    };
}

function createEmptySegment(index: number = 0): Segment {
    return {
        points: [],
        waypoints: [],
        surfaceTypes: [],
        name: null,
        color: getDefaultSegmentColor(index),
    };
}

function ensureSurfaceTypes(seg: Segment): void {
    if (!seg.surfaceTypes) seg.surfaceTypes = [];
    if (seg.surfaceTypes.length > seg.points.length) {
        seg.surfaceTypes = seg.surfaceTypes.slice(0, seg.points.length);
    }
    while (seg.surfaceTypes.length < seg.points.length) {
        seg.surfaceTypes.push(SURFACE_UNKNOWN);
    }
}

function normalizeWaypoints(seg: Segment): void {
    if (!seg.points.length) {
        seg.waypoints = [];
        return;
    }
    const waypointSet = new Set(seg.waypoints);
    waypointSet.add(0);
    waypointSet.add(seg.points.length - 1);
    seg.waypoints = Array.from(waypointSet)
        .filter((idx) => idx >= 0 && idx < seg.points.length)
        .sort((a, b) => a - b);
}
