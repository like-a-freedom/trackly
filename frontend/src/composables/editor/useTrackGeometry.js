/**
 * Composable for track geometry management.
 * Handles segment operations, waypoint management, and geometry calculations.
 */
import { ref, computed } from 'vue';
import { calcSegmentDistance, getDefaultSegmentColor } from './trackGeometryUtils';

export function useTrackGeometry(options = {}) {
    const segments = ref(options.initialSegments || [{ points: [], waypoints: [], surfaceTypes: [], name: null, color: getDefaultSegmentColor(0) }]);
    const activeSegmentIndex = ref(0);

    // Limits
    const MAX_SEGMENTS = options.maxSegments || 100;

    const activeSegment = computed(() => segments.value[activeSegmentIndex.value]);

    const totalPoints = computed(() =>
        segments.value.reduce((sum, seg) => sum + seg.points.length, 0)
    );

    const totalDistanceKm = computed(() => {
        let total = 0;
        for (const seg of segments.value) {
            total += calcSegmentDistance(seg.points);
        }
        return total / 1000;
    });

    const coordinateData = computed(() => {
        const coords = [];
        for (const seg of segments.value) {
            for (const [lat, lng] of seg.points) {
                coords.push({ lat, lng });
            }
        }
        return coords;
    });

    const segmentStats = computed(() =>
        segments.value.map((seg, i) => ({
            index: i,
            pointCount: seg.points.length,
            distanceKm: calcSegmentDistance(seg.points) / 1000,
            color: seg.color || getDefaultSegmentColor(i),
        }))
    );

    /**
     * Create an empty segment.
     * @param {number} index - Segment index
     * @returns {Object} Empty segment
     */
    function createEmptySegment(index = 0) {
        return {
            points: [],
            waypoints: [],
            surfaceTypes: [],
            name: null,
            color: getDefaultSegmentColor(index),
        };
    }

    /**
     * Ensure segment surface types array matches points length.
     * @param {Object} seg - Segment object
     */
    function ensureSurfaceTypes(seg) {
        if (!seg.surfaceTypes) seg.surfaceTypes = [];
        if (seg.surfaceTypes.length > seg.points.length) {
            seg.surfaceTypes = seg.surfaceTypes.slice(0, seg.points.length);
        }
        while (seg.surfaceTypes.length < seg.points.length) {
            seg.surfaceTypes.push('unknown');
        }
    }

    /**
     * Normalize waypoints to include first and last points.
     * @param {Object} seg - Segment object
     */
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

    /**
     * Set segment name.
     * @param {number} index - Segment index
     * @param {string} name - Segment name
     * @returns {boolean} Whether the operation succeeded
     */
    function setSegmentName(index, name) {
        const seg = segments.value[index];
        if (!seg) return false;
        const cleaned = String(name ?? '').trim();
        seg.name = cleaned.length > 0 ? cleaned : null;
        return true;
    }

    /**
     * Set segment color.
     * @param {number} index - Segment index
     * @param {string} color - Hex color
     * @returns {boolean} Whether the operation succeeded
     */
    function setSegmentColor(index, color) {
        const seg = segments.value[index];
        if (!seg) return false;
        const cleaned = String(color ?? '').trim();
        if (!/^#([0-9a-fA-F]{6})$/.test(cleaned)) return false;
        seg.color = cleaned;
        return true;
    }

    /**
     * Promote a point to waypoint.
     * @param {number} segIndex - Segment index
     * @param {number} pointIndex - Point index
     * @returns {boolean} Whether the operation succeeded
     */
    function promoteToWaypoint(segIndex, pointIndex) {
        const seg = segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;
        if (seg.waypoints.includes(pointIndex)) return false;
        seg.waypoints.push(pointIndex);
        seg.waypoints.sort((a, b) => a - b);
        return true;
    }

    /**
     * Add a new empty segment.
     * @returns {number} New segment index
     */
    function addSegment() {
        if (segments.value.length >= MAX_SEGMENTS) return -1;
        const newSeg = createEmptySegment(segments.value.length);
        segments.value.push(newSeg);
        activeSegmentIndex.value = segments.value.length - 1;
        return activeSegmentIndex.value;
    }

    /**
     * Delete a segment.
     * @param {number} segIndex - Segment index
     * @returns {boolean} Whether the operation succeeded
     */
    function deleteSegment(segIndex) {
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

    /**
     * Set active segment.
     * @param {number} index - Segment index
     */
    function setActiveSegment(index) {
        if (index >= 0 && index < segments.value.length) {
            activeSegmentIndex.value = index;
        }
    }

    /**
     * Reverse segment points.
     * @param {number} segIndex - Segment index
     * @returns {boolean} Whether the operation succeeded
     */
    function reverseSegment(segIndex) {
        const seg = segments.value[segIndex];
        if (!seg) return false;
        seg.points.reverse();
        seg.waypoints = seg.waypoints.map((idx) => seg.points.length - 1 - idx).sort((a, b) => a - b);
        return true;
    }

    /**
     * Reverse all segments.
     */
    function reverseTrack() {
        for (let i = 0; i < segments.value.length; i++) {
            reverseSegment(i);
        }
    }

    /**
     * Get segment by index.
     * @param {number} index - Segment index
     * @returns {Object|undefined} Segment or undefined
     */
    function getSegment(index) {
        return segments.value[index];
    }

    /**
     * Clear all segments.
     */
    function clearSegments() {
        segments.value = [createEmptySegment(0)];
        activeSegmentIndex.value = 0;
    }

    return {
        // State
        segments,
        activeSegmentIndex,
        activeSegment,
        // Computed
        totalPoints,
        totalDistanceKm,
        coordinateData,
        segmentStats,
        // Methods
        createEmptySegment,
        ensureSurfaceTypes,
        normalizeWaypoints,
        setSegmentName,
        setSegmentColor,
        promoteToWaypoint,
        addSegment,
        deleteSegment,
        setActiveSegment,
        reverseSegment,
        reverseTrack,
        getSegment,
        clearSegments,
    };
}
