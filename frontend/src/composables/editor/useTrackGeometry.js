import { ref, computed } from 'vue';
import { haversineDistance } from '../../utils/haversine.js';
import { isValidCoord, getDefaultSegmentColor, calcSegmentDistance } from './trackGeometryUtils.js';

const MAX_TRACK_POINTS = 100_000;
const MAX_SEGMENTS = 100;
const MIN_POINT_DISTANCE_M = 5;
const SURFACE_UNKNOWN = 'unknown';

/**
 * Composable for track geometry operations.
 * Can be used standalone or with the editorStore.
 *
 * @param {Object} options
 * @param {Array} options.initialSegments - Initial segments array
 * @returns {Object} Geometry management API
 */
export function useTrackGeometry({ initialSegments = null } = {}) {
    const segments = ref(initialSegments || [createEmptySegment(0)]);
    const activeSegmentIndex = ref(0);

    const activeSegment = computed(() => segments.value[activeSegmentIndex.value]);
    const totalPoints = computed(() =>
        segments.value.reduce((sum, s) => sum + s.points.length, 0)
    );
    const totalDistanceKm = computed(() => {
        let total = 0;
        for (const seg of segments.value) {
            total += calcSegmentDistance(seg.points);
        }
        return total / 1000;
    });
    const coordinateData = computed(() =>
        segments.value.flatMap((seg) => seg.points)
    );
    const segmentStats = computed(() =>
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

    function setSegmentName(index, name) {
        const seg = segments.value[index];
        if (!seg) return false;
        const cleaned = String(name ?? '').trim();
        seg.name = cleaned.length > 0 ? cleaned : null;
        return true;
    }

    function setSegmentColor(index, color) {
        const seg = segments.value[index];
        if (!seg) return false;
        const cleaned = String(color ?? '').trim();
        if (!/^#([0-9a-fA-F]{6})$/.test(cleaned)) return false;
        seg.color = cleaned;
        return true;
    }

    function promoteToWaypoint(segIndex, pointIndex) {
        const seg = segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;
        if (seg.waypoints.includes(pointIndex)) return false;
        seg.waypoints.push(pointIndex);
        seg.waypoints.sort((a, b) => a - b);
        return true;
    }

    function addSegmentFn() {
        if (segments.value.length >= MAX_SEGMENTS) return -1;
        const newSeg = createEmptySegment(segments.value.length);
        segments.value.push(newSeg);
        activeSegmentIndex.value = segments.value.length - 1;
        return activeSegmentIndex.value;
    }

    function deleteSegmentFn(segIndex) {
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

    function setActiveSegment(index) {
        if (index >= 0 && index < segments.value.length) {
            activeSegmentIndex.value = index;
        }
    }

    function getSegment(index) {
        return segments.value[index];
    }

    function reverseSegment(segIndex) {
        const seg = segments.value[segIndex];
        if (!seg || seg.points.length < 2) return;
        const len = seg.points.length;
        seg.points.reverse();
        seg.waypoints = seg.waypoints.map((i) => len - 1 - i).sort((a, b) => a - b);
        if (seg.surfaceTypes) {
            seg.surfaceTypes.reverse();
        }
    }

    function reverseTrack() {
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

    function clearSegments() {
        segments.value = [createEmptySegment(0)];
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
    };
}

function createEmptySegment(index = 0) {
    return {
        points: [],
        waypoints: [],
        surfaceTypes: [],
        name: null,
        color: getDefaultSegmentColor(index),
    };
}

function ensureSurfaceTypes(seg) {
    if (!seg.surfaceTypes) seg.surfaceTypes = [];
    if (seg.surfaceTypes.length > seg.points.length) {
        seg.surfaceTypes = seg.surfaceTypes.slice(0, seg.points.length);
    }
    while (seg.surfaceTypes.length < seg.points.length) {
        seg.surfaceTypes.push(SURFACE_UNKNOWN);
    }
}

function normalizeWaypoints(seg) {
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

export function addWaypoint(store, lat, lng, { onRoutingNotAvailable } = {}) {
    if (store.editorMode === 'view') return false;
    if (!isValidCoord(lat, lng)) return false;
    if (store.totalPoints >= MAX_TRACK_POINTS) return false;

    const seg = store.segments[store.activeSegmentIndex];
    const newPoint = [lat, lng];

    // Check minimum distance to last point
    if (seg.points.length > 0) {
        const last = seg.points[seg.points.length - 1];
        const dist = haversineDistance(
            { lat: last[0], lng: last[1] },
            { lat, lng }
        );
        if (dist < MIN_POINT_DISTANCE_M) return false;
    }

    // Add point (manual mode - routing handled by facade)
    seg.points.push(newPoint);
    seg.waypoints.push(seg.points.length - 1);
    ensureSurfaceTypes(seg);
    seg.surfaceTypes[seg.surfaceTypes.length - 1] = SURFACE_UNKNOWN;

    return true;
}

export function moveWaypoint(store, segIndex, pointIndex, lat, lng) {
    if (!isValidCoord(lat, lng)) return false;
    const seg = store.segments[segIndex];
    if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;

    seg.points[pointIndex] = [lat, lng];
    ensureSurfaceTypes(seg);
    seg.surfaceTypes[pointIndex] = SURFACE_UNKNOWN;

    return true;
}

export function deleteWaypoint(store, segIndex, pointIndex) {
    const seg = store.segments[segIndex];
    if (!seg) return false;

    // Don't allow deletion if it would leave segment with <2 points
    // unless we remove the segment entirely
    if (seg.points.length <= 1) {
        return deleteSegment(store, segIndex);
    }

    seg.points.splice(pointIndex, 1);
    if (seg.surfaceTypes?.length) {
        seg.surfaceTypes.splice(pointIndex, 1);
    }
    seg.waypoints = seg.waypoints
        .filter((idx) => idx !== pointIndex)
        .map((idx) => (idx > pointIndex ? idx - 1 : idx));
    normalizeWaypoints(seg);

    return true;
}

export function insertWaypoint(store, segIndex, afterIndex, lat, lng) {
    if (!isValidCoord(lat, lng)) return false;
    const seg = store.segments[segIndex];
    if (!seg || afterIndex < 0 || afterIndex >= seg.points.length) return false;
    if (store.totalPoints >= MAX_TRACK_POINTS) return false;

    seg.points.splice(afterIndex + 1, 0, [lat, lng]);
    if (seg.surfaceTypes) {
        seg.surfaceTypes.splice(afterIndex + 1, 0, SURFACE_UNKNOWN);
    }
    seg.waypoints = seg.waypoints.map((idx) =>
        idx > afterIndex ? idx + 1 : idx
    );
    seg.waypoints.push(afterIndex + 1);
    seg.waypoints.sort((a, b) => a - b);
    normalizeWaypoints(seg);

    return true;
}

export function addSegment(store) {
    if (store.segments.length >= MAX_SEGMENTS) return -1;
    const newSeg = createEmptySegment(store.segments.length);
    store.segments.push(newSeg);
    store.activeSegmentIndex = store.segments.length - 1;
    return store.activeSegmentIndex;
}

export function deleteSegment(store, segIndex) {
    if (segIndex < 0 || segIndex >= store.segments.length) return false;

    if (store.segments.length === 1) {
        // Last segment — reset to empty
        store.segments = [createEmptySegment(0)];
        store.activeSegmentIndex = 0;
    } else {
        store.segments.splice(segIndex, 1);
        if (store.activeSegmentIndex >= store.segments.length) {
            store.activeSegmentIndex = store.segments.length - 1;
        }
    }

    return true;
}

export function splitSegment(store, pointIndex) {
    const seg = store.segments[store.activeSegmentIndex];
    if (!seg || pointIndex <= 0 || pointIndex >= seg.points.length - 1) {
        return false;
    }

    const firstPoints = seg.points.slice(0, pointIndex + 1);
    const secondPoints = seg.points.slice(pointIndex);
    const firstSurface = seg.surfaceTypes
        ? seg.surfaceTypes.slice(0, pointIndex + 1)
        : [];
    const secondSurface = seg.surfaceTypes
        ? seg.surfaceTypes.slice(pointIndex)
        : [];

    const firstWaypoints = seg.waypoints
        .filter((i) => i <= pointIndex)
        .sort((a, b) => a - b);
    const secondWaypoints = seg.waypoints
        .filter((i) => i >= pointIndex)
        .map((i) => i - pointIndex)
        .sort((a, b) => a - b);

    seg.points = firstPoints;
    seg.waypoints = firstWaypoints;
    seg.surfaceTypes = firstSurface;

    const newSeg = {
        points: secondPoints,
        waypoints: secondWaypoints,
        surfaceTypes: secondSurface,
        name: null,
        color: getDefaultSegmentColor(store.activeSegmentIndex + 1),
    };
    store.segments.splice(store.activeSegmentIndex + 1, 0, newSeg);

    return true;
}

export function reverseSegment(store, segIndex) {
    const seg = store.segments[segIndex];
    if (!seg || seg.points.length < 2) return;

    const len = seg.points.length;
    seg.points.reverse();
    seg.waypoints = seg.waypoints.map((i) => len - 1 - i).sort((a, b) => a - b);
    if (seg.surfaceTypes) {
        seg.surfaceTypes.reverse();
    }
}

export function reverseTrack(store) {
    if (!store.segments.length) return false;

    store.segments = store.segments
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

    store.activeSegmentIndex = Math.max(
        0,
        store.segments.length - 1 - store.activeSegmentIndex
    );

    return true;
}

export function joinSegments(store, segIndexA, segIndexB) {
    if (segIndexB !== segIndexA + 1) return false;
    const segA = store.segments[segIndexA];
    const segB = store.segments[segIndexB];
    if (!segA || !segB) return false;
    if (segA.points.length === 0 && segB.points.length === 0) return false;

    const offsetB = segA.points.length;
    segA.points = segA.points.concat(segB.points);
    if (segA.surfaceTypes || segB.surfaceTypes) {
        ensureSurfaceTypes(segA);
        ensureSurfaceTypes(segB);
        segA.surfaceTypes = segA.surfaceTypes.concat(segB.surfaceTypes);
    }
    const mergedWaypoints = segA.waypoints.concat(
        segB.waypoints.map((i) => i + offsetB)
    );
    segA.waypoints = [...new Set(mergedWaypoints)].sort((a, b) => a - b);

    store.segments.splice(segIndexB, 1);
    if (store.activeSegmentIndex >= store.segments.length) {
        store.activeSegmentIndex = store.segments.length - 1;
    }

    return true;
}

export function closeLoop(store) {
    const seg = store.segments[store.activeSegmentIndex];
    if (!seg || seg.points.length < 3) return false;

    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    const dist = haversineDistance(
        { lat: first[0], lng: first[1] },
        { lat: last[0], lng: last[1] }
    );

    // Already closed
    if (dist < MIN_POINT_DISTANCE_M) return false;

    seg.points.push([first[0], first[1]]);
    seg.waypoints.push(seg.points.length - 1);
    ensureSurfaceTypes(seg);
    seg.surfaceTypes.push(seg.surfaceTypes[0] || SURFACE_UNKNOWN);

    return true;
}

export function toGeoJSON(store) {
    const coords = store.segments
        .filter((s) => s.points.length >= 2)
        .map((s) => s.points.map(([lat, lng]) => [lng, lat]));

    if (coords.length === 0) return null;

    return {
        type: 'MultiLineString',
        coordinates: coords,
    };
}

export function fromGeoJSON(store, geojson, waypoints = [], segmentMeta = []) {
    if (!geojson?.coordinates) return;

    const coords = geojson.type === 'MultiLineString'
        ? geojson.coordinates
        : geojson.type === 'LineString'
            ? [geojson.coordinates]
            : [];

    const metaList = Array.isArray(segmentMeta) ? segmentMeta : [];
    store.segments = coords.map((line, index) => {
        const points = line.map(([lng, lat]) => [lat, lng]);
        const waypointIndices = Array.from({ length: points.length }, (_, i) => i);
        const meta = metaList[index] || {};
        return {
            points,
            waypoints: waypointIndices,
            surfaceTypes: points.map(() => SURFACE_UNKNOWN),
            name: typeof meta.name === 'string' ? meta.name : null,
            color: typeof meta.color === 'string'
                ? meta.color
                : getDefaultSegmentColor(index),
        };
    });

    if (store.segments.length === 0) {
        store.segments = [createEmptySegment()];
    }
    store.activeSegmentIndex = 0;
}
