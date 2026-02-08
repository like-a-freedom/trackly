import { ref, reactive, computed, watch } from 'vue';
import { getSessionId } from '../utils/session';
import { useAuth } from './useAuth';
import { useUndoRedo } from './useUndoRedo';
import { useDraftSave } from './useDraftSave';
import { useRouting } from './useRouting';

const API_BASE = '';
const MAX_TRACK_POINTS = 100_000;
const MAX_SEGMENTS = 100;
const MIN_POINT_DISTANCE_M = 5;

/**
 * Segment color palette for differentiating segments visually.
 * Colors chosen for sufficient contrast against the map.
 */
const SEGMENT_COLORS = [
    '#1976D2', '#D32F2F', '#388E3C', '#7B1FA2',
    '#F57C00', '#0097A7', '#C2185B', '#512DA8',
];

/** Haversine distance in meters between two {lat, lng} points. */
function haversineDistance(a, b) {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const aVal =
        sinLat * sinLat +
        Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

/** Calculate total distance for an array of [lat, lng] points. */
function calcSegmentDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversineDistance(
            { lat: points[i - 1][0], lng: points[i - 1][1] },
            { lat: points[i][0], lng: points[i][1] }
        );
    }
    return total;
}

/** Validate lat/lng coordinate ranges. */
function isValidCoord(lat, lng) {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
    );
}

/**
 * Core track editor composable.
 * Manages the full lifecycle of creating/editing a track.
 *
 * @param {Object} options
 * @param {string} options.trackId - Existing track ID (for edit mode), or null for new
 * @returns {Object} Editor API
 */
export function useTrackEditor({ trackId = null } = {}) {
    const { getAccessToken, user } = useAuth();
    const routing = useRouting();
    const undoRedo = useUndoRedo(50);
    const draftSave = useDraftSave();

    // ── Editor mode ──────────────────────────────────────────
    /** 'view' | 'edit' | 'fragment' | 'routing' */
    const editorMode = ref('edit');

    // ── Track metadata ───────────────────────────────────────
    const trackName = ref('');
    const trackDescription = ref('');
    const trackCategories = ref([]);

    // ── Geometry ─────────────────────────────────────────────
    /**
     * Segments: Array of segment objects.
     * Each segment: { points: [[lat,lng], ...], waypoints: [indices] }
     * `points` are in Leaflet [lat, lng] format.
     * `waypoints` are indices into `points` that were explicitly placed by the user.
     */
    const segments = ref([createEmptySegment()]);
    const activeSegmentIndex = ref(0);

    // ── POIs ─────────────────────────────────────────────────
    const pois = ref([]);

    // ── Status ───────────────────────────────────────────────
    const saving = ref(false);
    const loading = ref(false);
    const error = ref(null);
    const savedTrackId = ref(trackId);

    // ── Computed ─────────────────────────────────────────────
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

    const segmentStats = computed(() =>
        segments.value.map((seg, i) => ({
            index: i,
            pointCount: seg.points.length,
            distanceKm: calcSegmentDistance(seg.points) / 1000,
            color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        }))
    );

    const canSave = computed(
        () => trackName.value.trim().length > 0 && totalPoints.value >= 2
    );

    const isNewTrack = computed(() => !savedTrackId.value);

    /** Average speed (km/h) per category for time estimation. */
    const CATEGORY_SPEEDS = {
        hiking: 5,
        walking: 4,
        running: 10,
        cycling: 20,
    };

    /** Estimated time in minutes based on distance and primary category. */
    const estimatedTimeMinutes = computed(() => {
        const dist = totalDistanceKm.value;
        if (dist <= 0) return 0;
        const cat = trackCategories.value[0];
        const speed = CATEGORY_SPEEDS[cat] ?? 5;
        return (dist / speed) * 60;
    });

    // ── Helpers ──────────────────────────────────────────────
    function createEmptySegment() {
        return { points: [], waypoints: [] };
    }

    /** Snapshot current geometry state for undo. */
    function getGeometrySnapshot() {
        return {
            segments: JSON.parse(JSON.stringify(segments.value)),
            activeSegmentIndex: activeSegmentIndex.value,
            pois: JSON.parse(JSON.stringify(pois.value)),
        };
    }

    /** Restore geometry from a snapshot. */
    function applySnapshot(snapshot) {
        segments.value = snapshot.segments;
        activeSegmentIndex.value = snapshot.activeSegmentIndex;
        pois.value = snapshot.pois;
    }

    /** Push current state to undo stack. */
    function saveUndoState() {
        undoRedo.pushState(getGeometrySnapshot());
    }

    /** Trigger debounced draft save. */
    function autosave() {
        draftSave.debouncedSave({
            track: {
                name: trackName.value,
                description: trackDescription.value,
                categories: trackCategories.value,
                segments: segments.value,
                pois: pois.value,
            },
            editingState: {
                activeSegment: activeSegmentIndex.value,
                routingMode: routing.mode.value,
            },
        });
    }

    // ── Waypoint operations ──────────────────────────────────
    /**
     * Add a waypoint at [lat, lng] to the active segment.
     * If routing is enabled, route from last point to new point.
     * @param {number} lat
     * @param {number} lng
     * @param {Object} options
     * @param {Function} options.onRoutingNotAvailable - Notification callback
     * @returns {boolean} Whether the point was added
     */
    function addWaypoint(lat, lng, { onRoutingNotAvailable } = {}) {
        if (editorMode.value === 'view') return false;
        if (!isValidCoord(lat, lng)) return false;
        if (totalPoints.value >= MAX_TRACK_POINTS) return false;

        const seg = segments.value[activeSegmentIndex.value];
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

        saveUndoState();

        if (seg.points.length > 0 && routing.mode.value === 'auto') {
            const lastPt = seg.points[seg.points.length - 1];
            const route = routing.findRoute(
                { lat: lastPt[0], lng: lastPt[1] },
                { lat, lng },
                { onNotAvailable: onRoutingNotAvailable }
            );

            if (route && route.length >= 2) {
                // Add routed points (skip first — it's the existing last point)
                for (let i = 1; i < route.length; i++) {
                    seg.points.push(route[i]);
                }
                // Mark last point as waypoint
                seg.waypoints.push(seg.points.length - 1);
            } else {
                // Route failed — don't add the point (per BR-ROUTE-06, no fallback)
                return false;
            }
        } else {
            // Manual mode or first point
            seg.points.push(newPoint);
            seg.waypoints.push(seg.points.length - 1);
        }

        autosave();
        return true;
    }

    /**
     * Move a waypoint to a new position.
     * @param {number} segIndex - Segment index
     * @param {number} pointIndex - Point index within segment
     * @param {number} lat - New latitude
     * @param {number} lng - New longitude
     */
    function moveWaypoint(segIndex, pointIndex, lat, lng) {
        if (!isValidCoord(lat, lng)) return;
        const seg = segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return;

        saveUndoState();
        seg.points[pointIndex] = [lat, lng];
        autosave();
    }

    /**
     * Delete a waypoint by index.
     * @param {number} segIndex - Segment index
     * @param {number} pointIndex - Point index within segment
     * @returns {boolean} Whether deletion succeeded
     */
    function deleteWaypoint(segIndex, pointIndex) {
        const seg = segments.value[segIndex];
        if (!seg) return false;
        // Don't allow deletion if it would leave segment with <2 points
        // unless we remove the segment entirely
        if (seg.points.length <= 1) {
            // Remove the segment itself
            return deleteSegment(segIndex);
        }

        saveUndoState();
        seg.points.splice(pointIndex, 1);
        // Update waypoint indices
        seg.waypoints = seg.waypoints
            .filter((idx) => idx !== pointIndex)
            .map((idx) => (idx > pointIndex ? idx - 1 : idx));
        autosave();
        return true;
    }

    /**
     * Insert a waypoint between two existing points by clicking on the segment line.
     * @param {number} segIndex - Segment index
     * @param {number} afterIndex - Index after which to insert
     * @param {number} lat
     * @param {number} lng
     */
    function insertWaypoint(segIndex, afterIndex, lat, lng) {
        if (!isValidCoord(lat, lng)) return;
        const seg = segments.value[segIndex];
        if (!seg || afterIndex < 0 || afterIndex >= seg.points.length) return;
        if (totalPoints.value >= MAX_TRACK_POINTS) return;

        saveUndoState();
        seg.points.splice(afterIndex + 1, 0, [lat, lng]);
        // Update waypoint indices and add new one
        seg.waypoints = seg.waypoints.map((idx) =>
            idx > afterIndex ? idx + 1 : idx
        );
        seg.waypoints.push(afterIndex + 1);
        seg.waypoints.sort((a, b) => a - b);
        autosave();
    }

    // ── Segment operations ───────────────────────────────────
    /**
     * Promote an intermediate (non-waypoint) point to a control point (waypoint).
     * FR-EDIT-06: Click on intermediate point converts it to control point.
     * @param {number} segIndex - Segment index
     * @param {number} pointIndex - Point index within segment
     * @returns {boolean} Whether the promotion succeeded
     */
    function promoteToWaypoint(segIndex, pointIndex) {
        const seg = segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;
        if (seg.waypoints.includes(pointIndex)) return false; // already a waypoint

        saveUndoState();
        seg.waypoints.push(pointIndex);
        seg.waypoints.sort((a, b) => a - b);
        autosave();
        return true;
    }

    /**
     * Delete the last point of the active segment.
     * Convenience function for Delete/Backspace keyboard shortcut.
     * @returns {boolean}
     */
    function deleteLastPoint() {
        const seg = segments.value[activeSegmentIndex.value];
        if (!seg || seg.points.length === 0) return false;
        return deleteWaypoint(activeSegmentIndex.value, seg.points.length - 1);
    }

    /**
     * Create a new empty segment and switch to it.
     * @returns {number} New segment index
     */
    function addSegment() {
        if (segments.value.length >= MAX_SEGMENTS) return -1;
        const newSeg = createEmptySegment();
        segments.value.push(newSeg);
        activeSegmentIndex.value = segments.value.length - 1;
        autosave();
        return activeSegmentIndex.value;
    }

    /**
     * Delete a segment by index.
     * @param {number} segIndex
     * @returns {boolean}
     */
    function deleteSegment(segIndex) {
        if (segIndex < 0 || segIndex >= segments.value.length) return false;

        saveUndoState();

        if (segments.value.length === 1) {
            // Last segment — reset to empty
            segments.value = [createEmptySegment()];
            activeSegmentIndex.value = 0;
        } else {
            segments.value.splice(segIndex, 1);
            if (activeSegmentIndex.value >= segments.value.length) {
                activeSegmentIndex.value = segments.value.length - 1;
            }
        }

        autosave();
        return true;
    }

    /**
     * Split active segment at a given point index.
     * Creates two segments from one.
     * @param {number} pointIndex - Split point (must not be first or last)
     * @returns {boolean}
     */
    function splitSegment(pointIndex) {
        const seg = segments.value[activeSegmentIndex.value];
        if (!seg || pointIndex <= 0 || pointIndex >= seg.points.length - 1) {
            return false;
        }

        saveUndoState();

        const firstPoints = seg.points.slice(0, pointIndex + 1);
        const secondPoints = seg.points.slice(pointIndex);

        // Rebuild waypoint indices for each half
        const firstWaypoints = seg.waypoints
            .filter((i) => i <= pointIndex)
            .sort((a, b) => a - b);
        const secondWaypoints = seg.waypoints
            .filter((i) => i >= pointIndex)
            .map((i) => i - pointIndex)
            .sort((a, b) => a - b);

        seg.points = firstPoints;
        seg.waypoints = firstWaypoints;

        const newSeg = { points: secondPoints, waypoints: secondWaypoints };
        segments.value.splice(activeSegmentIndex.value + 1, 0, newSeg);

        autosave();
        return true;
    }

    /**
     * Reverse the point order of a segment.
     * @param {number} segIndex
     */
    function reverseSegment(segIndex) {
        const seg = segments.value[segIndex];
        if (!seg || seg.points.length < 2) return;

        saveUndoState();

        const len = seg.points.length;
        seg.points.reverse();
        seg.waypoints = seg.waypoints.map((i) => len - 1 - i).sort((a, b) => a - b);

        autosave();
    }

    /** Switch active segment. */
    function setActiveSegment(index) {
        if (index >= 0 && index < segments.value.length) {
            activeSegmentIndex.value = index;
        }
    }

    /**
     * Join two adjacent segments into one. UC-12.
     * The second segment's points are appended to the first.
     * @param {number} segIndexA - First segment index
     * @param {number} segIndexB - Second segment index (must be segIndexA + 1)
     * @returns {boolean}
     */
    function joinSegments(segIndexA, segIndexB) {
        if (segIndexB !== segIndexA + 1) return false;
        const segA = segments.value[segIndexA];
        const segB = segments.value[segIndexB];
        if (!segA || !segB) return false;
        if (segA.points.length === 0 && segB.points.length === 0) return false;

        saveUndoState();

        const offsetB = segA.points.length;
        // Append segB points to segA
        segA.points = segA.points.concat(segB.points);
        // Merge waypoints with offset
        const mergedWaypoints = segA.waypoints.concat(
            segB.waypoints.map((i) => i + offsetB)
        );
        segA.waypoints = [...new Set(mergedWaypoints)].sort((a, b) => a - b);

        // Remove segB
        segments.value.splice(segIndexB, 1);
        if (activeSegmentIndex.value >= segments.value.length) {
            activeSegmentIndex.value = segments.value.length - 1;
        }

        autosave();
        return true;
    }

    /**
     * Close the loop: connect the last point of the active segment to the first.
     * If the distance is > MIN_POINT_DISTANCE_M, adds a new point at the start position.
     * @returns {boolean}
     */
    function closeLoop() {
        const seg = segments.value[activeSegmentIndex.value];
        if (!seg || seg.points.length < 3) return false;

        const first = seg.points[0];
        const last = seg.points[seg.points.length - 1];
        const dist = haversineDistance(
            { lat: first[0], lng: first[1] },
            { lat: last[0], lng: last[1] }
        );

        // Already closed
        if (dist < MIN_POINT_DISTANCE_M) return false;

        saveUndoState();
        seg.points.push([first[0], first[1]]);
        seg.waypoints.push(seg.points.length - 1);
        autosave();
        return true;
    }

    /**
     * Create a shortcut: replace all points between fromIdx and toIdx with a straight line.
     * Section 11: Shortcut operation.
     * @param {number} segIndex
     * @param {number} fromIdx - Start point index
     * @param {number} toIdx - End point index
     * @returns {boolean}
     */
    function shortcutBetweenPoints(segIndex, fromIdx, toIdx) {
        const seg = segments.value[segIndex];
        if (!seg) return false;
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        if (lo < 0 || hi >= seg.points.length || hi - lo < 2) return false;

        saveUndoState();

        // Keep only start and end points, remove everything in between
        const startPt = seg.points[lo];
        const endPt = seg.points[hi];
        seg.points.splice(lo + 1, hi - lo - 1);

        // Rebuild waypoints
        seg.waypoints = seg.waypoints
            .filter((i) => i <= lo || i >= hi)
            .map((i) => (i > lo ? i - (hi - lo - 1) : i));
        // Ensure lo and lo+1 are waypoints
        if (!seg.waypoints.includes(lo)) seg.waypoints.push(lo);
        if (!seg.waypoints.includes(lo + 1)) seg.waypoints.push(lo + 1);
        seg.waypoints.sort((a, b) => a - b);

        autosave();
        return true;
    }

    /**
     * Extract a segment as a separate new track (Section 11: New Track From Segment).
     * Returns the GeoJSON and metadata for the new track without saving it.
     * @param {number} segIndex
     * @returns {{ geometry: Object, name: string } | null}
     */
    function extractSegmentAsTrack(segIndex) {
        const seg = segments.value[segIndex];
        if (!seg || seg.points.length < 2) return null;

        const coords = seg.points.map(([lat, lng]) => [lng, lat]);
        return {
            geometry: { type: 'MultiLineString', coordinates: [coords] },
            name: `${trackName.value} — сегмент ${segIndex + 1}`,
        };
    }

    /** Set editor mode. */
    function setMode(newMode) {
        if (['view', 'edit', 'fragment', 'routing'].includes(newMode)) {
            editorMode.value = newMode;
            if (newMode === 'routing') {
                routing.setMode('auto');
            } else if (newMode === 'edit') {
                routing.setMode('manual');
            }
        }
    }

    // ── Undo / Redo ──────────────────────────────────────────
    function handleUndo() {
        const snapshot = undoRedo.undo(getGeometrySnapshot());
        if (snapshot) {
            applySnapshot(snapshot);
            autosave();
        }
    }

    function handleRedo() {
        const snapshot = undoRedo.redo(getGeometrySnapshot());
        if (snapshot) {
            applySnapshot(snapshot);
            autosave();
        }
    }

    // ── GeoJSON conversion ───────────────────────────────────
    /** Convert segments to GeoJSON MultiLineString. */
    function toGeoJSON() {
        const coords = segments.value
            .filter((s) => s.points.length >= 2)
            .map((s) => s.points.map(([lat, lng]) => [lng, lat]));

        if (coords.length === 0) return null;

        return {
            type: 'MultiLineString',
            coordinates: coords,
        };
    }

    /** Load geometry from GeoJSON MultiLineString. */
    function fromGeoJSON(geojson, waypoints = []) {
        if (!geojson?.coordinates) return;

        const coords = geojson.type === 'MultiLineString'
            ? geojson.coordinates
            : geojson.type === 'LineString'
                ? [geojson.coordinates]
                : [];

        segments.value = coords.map((line) => {
            const points = line.map(([lng, lat]) => [lat, lng]);
            // All points are waypoints if no explicit waypoints provided
            const waypointIndices = Array.from({ length: points.length }, (_, i) => i);
            return { points, waypoints: waypointIndices };
        });

        // Override with explicit waypoints if provided
        if (waypoints.length > 0) {
            // Waypoints from server have lat/lon/index
            // We'd need to match them to segment points (future enhancement)
        }

        if (segments.value.length === 0) {
            segments.value = [createEmptySegment()];
        }
        activeSegmentIndex.value = 0;
    }

    // ── POI operations ─────────────────────────────────────────
    /**
     * Add a POI at [lat, lng]. UC-08.
     * @param {number} lat
     * @param {number} lng
     * @param {string} name - POI name (required)
     * @param {Object} options
     * @param {string} options.description
     * @param {string} options.category
     * @returns {boolean}
     */
    function addPoi(lat, lng, name, { description = '', category = '' } = {}) {
        if (!isValidCoord(lat, lng)) return false;
        if (!name || name.trim().length === 0) return false;

        saveUndoState();

        // Calculate distance from track start (along the line)
        const distFromStart = calcDistanceFromStart(lat, lng);

        pois.value.push({
            lat,
            lng,
            name: name.trim(),
            description: description.trim(),
            category,
            distFromStart,
            id: null, // Will be set after server save
        });

        autosave();
        return true;
    }

    /**
     * Update an existing POI's properties. UC-09.
     * @param {number} poiIndex
     * @param {Object} updates - { name?, description?, category? }
     * @returns {boolean}
     */
    function updatePoi(poiIndex, updates) {
        const poi = pois.value[poiIndex];
        if (!poi) return false;
        if (updates.name !== undefined && updates.name.trim().length === 0) return false;

        saveUndoState();

        if (updates.name !== undefined) poi.name = updates.name.trim();
        if (updates.description !== undefined) poi.description = updates.description.trim();
        if (updates.category !== undefined) poi.category = updates.category;

        autosave();
        return true;
    }

    /**
     * Delete a POI by index. UC-09 alternative.
     * @param {number} poiIndex
     * @returns {boolean}
     */
    function deletePoi(poiIndex) {
        if (poiIndex < 0 || poiIndex >= pois.value.length) return false;

        saveUndoState();
        pois.value.splice(poiIndex, 1);
        autosave();
        return true;
    }

    /** Calculate the distance from track start to a point (approximation along segments). */
    function calcDistanceFromStart(lat, lng) {
        let totalDist = 0;
        let minDist = Infinity;
        let distAlongTrack = 0;

        for (const seg of segments.value) {
            for (let i = 0; i < seg.points.length; i++) {
                const pt = seg.points[i];
                const d = haversineDistance({ lat: pt[0], lng: pt[1] }, { lat, lng });
                if (d < minDist) {
                    minDist = d;
                    distAlongTrack = totalDist;
                }
                if (i > 0) {
                    const prev = seg.points[i - 1];
                    totalDist += haversineDistance(
                        { lat: prev[0], lng: prev[1] },
                        { lat: pt[0], lng: pt[1] }
                    );
                }
            }
        }

        return Math.round(distAlongTrack);
    }

    // ── Export ────────────────────────────────────────────────
    /**
     * Export the track in the specified format (GPX, KML, GeoJSON).
     * NFR-COMP-03.
     * @param {'gpx'|'kml'|'geojson'} format
     * @returns {Promise<boolean>} Whether export succeeded
     */
    async function exportTrack(format = 'gpx') {
        const id = savedTrackId.value;
        if (!id) {
            error.value = 'Сохраните трек перед экспортом';
            return false;
        }

        try {
            const headers = {};
            const token = await getAccessToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const resp = await fetch(
                `${API_BASE}/api/tracks/${id}/export?format=${format}`,
                { headers }
            );

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const blob = await resp.blob();
            const ext = format === 'geojson' ? 'json' : format;
            const fileName = `${trackName.value || 'track'}.${ext}`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return true;
        } catch (e) {
            error.value = `Ошибка экспорта: ${e.message}`;
            return false;
        }
    }

    /** Load POIs associated with a track from the server. */
    async function loadTrackPois(id) {
        try {
            const resp = await fetch(`${API_BASE}/api/tracks/${id}/pois`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (Array.isArray(data)) {
                pois.value = data.map((p) => ({
                    id: p.id,
                    lat: p.lat ?? p.latitude,
                    lng: p.lon ?? p.lng ?? p.longitude,
                    name: p.name ?? '',
                    description: p.description ?? '',
                    category: p.category ?? '',
                    distFromStart: p.distance_from_start ?? 0,
                }));
            }
        } catch {
            // Non-critical — POIs can be added later
        }
    }

    // ── Server operations ────────────────────────────────────
    /** Load an existing track for editing. */
    async function loadTrack(id) {
        loading.value = true;
        error.value = null;
        try {
            const response = await fetch(`${API_BASE}/api/tracks/${id}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const feature = data.features?.[0] ?? data;

            trackName.value = feature.properties?.name ?? '';
            trackDescription.value = feature.properties?.description ?? '';
            trackCategories.value = feature.properties?.categories ?? [];
            savedTrackId.value = id;

            fromGeoJSON(feature.geometry, feature.properties?.waypoints ?? []);
            undoRedo.clear();
            draftSave.markClean();

            // Load associated POIs
            await loadTrackPois(id);
        } catch (e) {
            error.value = `Ошибка загрузки трека: ${e.message}`;
        } finally {
            loading.value = false;
        }
    }

    /** Save the track to the server (create or update). */
    async function saveTrack() {
        if (!canSave.value) return null;

        saving.value = true;
        error.value = null;

        const geojson = toGeoJSON();
        if (!geojson) {
            error.value = 'Трек должен содержать минимум 2 точки';
            saving.value = false;
            return null;
        }

        const sessionId = getSessionId();
        const waypointsPayload = [];
        for (const seg of segments.value) {
            for (const idx of seg.waypoints) {
                if (idx < seg.points.length) {
                    waypointsPayload.push({
                        lat: seg.points[idx][0],
                        lon: seg.points[idx][1],
                        index: idx,
                    });
                }
            }
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = await getAccessToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            if (savedTrackId.value) {
                // Update existing track geometry
                const resp = await fetch(
                    `${API_BASE}/api/tracks/${savedTrackId.value}/geometry`,
                    {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({
                            geometry: geojson,
                            waypoints: waypointsPayload,
                            session_id: sessionId,
                        }),
                    }
                );

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                // Also update metadata
                await updateMetadata(headers);

                draftSave.markClean();
                draftSave.deleteDraft();
                saving.value = false;
                return savedTrackId.value;
            } else {
                // Create new track
                const resp = await fetch(`${API_BASE}/api/tracks/create`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        name: trackName.value.trim(),
                        description: trackDescription.value.trim(),
                        categories: trackCategories.value,
                        geometry: geojson,
                        waypoints: waypointsPayload,
                        pois: pois.value.map((p) => ({
                            lat: p.lat,
                            lon: p.lng,
                            name: p.name,
                            description: p.description,
                            category: p.category,
                        })),
                        session_id: sessionId,
                        is_draft: false,
                    }),
                });

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                const result = await resp.json();
                savedTrackId.value = result.id;
                draftSave.markClean();
                draftSave.deleteDraft();
                saving.value = false;
                return result.id;
            }
        } catch (e) {
            error.value = `Ошибка сохранения: ${e.message}`;
            saving.value = false;
            // Save as draft on failure
            autosave();
            return null;
        }
    }

    /** Update track name/description/categories via existing PATCH endpoints. */
    async function updateMetadata(headers) {
        const id = savedTrackId.value;
        if (!id) return;

        const requests = [
            fetch(`${API_BASE}/api/tracks/${id}/name`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ name: trackName.value.trim() }),
            }),
            fetch(`${API_BASE}/api/tracks/${id}/description`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ description: trackDescription.value.trim() }),
            }),
            fetch(`${API_BASE}/api/tracks/${id}/categories`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ categories: trackCategories.value }),
            }),
        ];

        await Promise.allSettled(requests);
    }

    /** Restore from localStorage draft. */
    function restoreDraft() {
        const draft = draftSave.loadDraft();
        if (!draft?.track) return false;

        trackName.value = draft.track.name ?? '';
        trackDescription.value = draft.track.description ?? '';
        trackCategories.value = draft.track.categories ?? [];
        segments.value = draft.track.segments?.length
            ? draft.track.segments
            : [createEmptySegment()];
        pois.value = draft.track.pois ?? [];
        activeSegmentIndex.value = draft.editingState?.activeSegment ?? 0;

        if (draft.editingState?.routingMode) {
            routing.setMode(draft.editingState.routingMode);
        }

        undoRedo.clear();
        return true;
    }

    // ── Init ─────────────────────────────────────────────────
    draftSave.install();

    return {
        // Mode
        editorMode,
        setMode,

        // Metadata
        trackName,
        trackDescription,
        trackCategories,

        // Geometry
        segments,
        activeSegmentIndex,
        activeSegment,
        totalPoints,
        totalDistanceKm,
        segmentStats,
        SEGMENT_COLORS,

        // Waypoint ops
        addWaypoint,
        moveWaypoint,
        deleteWaypoint,
        insertWaypoint,
        promoteToWaypoint,
        deleteLastPoint,

        // Segment ops
        addSegment,
        deleteSegment,
        splitSegment,
        reverseSegment,
        setActiveSegment,
        joinSegments,
        closeLoop,
        shortcutBetweenPoints,
        extractSegmentAsTrack,

        // Undo/Redo
        handleUndo,
        handleRedo,
        canUndo: undoRedo.canUndo,
        canRedo: undoRedo.canRedo,

        // GeoJSON
        toGeoJSON,
        fromGeoJSON,

        // Server
        loadTrack,
        saveTrack,
        savedTrackId,
        saving,
        loading,
        error,
        canSave,
        isNewTrack,

        // Draft
        restoreDraft,
        hasDraft: draftSave.hasDraft,
        deleteDraft: draftSave.deleteDraft,
        isDirty: draftSave.isDirty,

        // Routing
        routing,

        // POIs
        pois,
        addPoi,
        updatePoi,
        deletePoi,

        // Export
        exportTrack,

        // Time estimation
        estimatedTimeMinutes,
    };
}
