import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { calcSegmentDistance, getDefaultSegmentColor } from '../composables/editor/trackGeometryUtils.js';

const API_BASE = '';
const MAX_TRACK_POINTS = 100_000;
const MAX_SEGMENTS = 100;
const MIN_POINT_DISTANCE_M = 5;
const OPTIMIZER_DEFAULT_RATIO = 0.1;
const OPTIMIZER_MIN_RATIO = 0.01;
const OPTIMIZER_MAX_RATIO = 1.0;
const SURFACE_UNKNOWN = 'unknown';

function createEmptySegment(index = 0) {
    return {
        points: [],
        waypoints: [],
        surfaceTypes: [],
        name: null,
        color: getDefaultSegmentColor(index),
    };
}

export const useEditorStore = defineStore('editor', () => {
    // ── Editor mode ──────────────────────────────────────────
    const editorMode = ref('edit');
    const snapToRoadMode = ref('auto');

    // ── Track metadata ───────────────────────────────────────
    const trackName = ref('');
    const trackDescription = ref('');
    const trackCategories = ref([]);

    // ── Geometry ─────────────────────────────────────────────
    const segments = ref([createEmptySegment(0)]);
    const activeSegmentIndex = ref(0);

    // ── Fragment selection ───────────────────────────────────
    const fragmentSelection = ref({
        segIndex: null,
        startIdx: null,
        endIdx: null,
    });

    // ── POIs ─────────────────────────────────────────────────
    const pois = ref([]);

    // ── Status ───────────────────────────────────────────────
    const saving = ref(false);
    const loading = ref(false);
    const error = ref(null);
    const savedTrackId = ref(null);
    const ownerSessionId = ref(null);
    const ownerUserId = ref(null);

    // ── Elevation preview ────────────────────────────────────
    const elevationProfile = ref([]);
    const elevationStats = ref({});
    const elevationLoading = ref(false);
    const elevationError = ref(null);

    // ── Optimization preview ───────────────────────────────
    const optimizerTargetRatio = ref(OPTIMIZER_DEFAULT_RATIO);
    const optimizerPreview = ref(null);
    const optimizerStats = ref(null);
    const optimizerLoading = ref(false);
    const optimizerError = ref(null);

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

    const canSave = computed(
        () => trackName.value.trim().length > 0 && totalPoints.value >= 2
    );

    const isNewTrack = computed(() => !savedTrackId.value);

    // ── Actions ──────────────────────────────────────────────

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

    function setMode(newMode) {
        if (['view', 'edit', 'fragment', 'routing', 'trace'].includes(newMode)) {
            editorMode.value = newMode;
            if (newMode !== 'fragment') {
                clearFragmentSelection();
            }
        }
    }

    function setSnapToRoadMode(newMode) {
        if (['auto', 'on', 'off'].includes(newMode)) {
            snapToRoadMode.value = newMode;
        }
    }

    function setActiveSegment(index) {
        if (index >= 0 && index < segments.value.length) {
            activeSegmentIndex.value = index;
        }
    }

    function setFragmentPoint(segIndex, pointIndex) {
        const seg = segments.value[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;

        const current = fragmentSelection.value;
        if (current.segIndex !== segIndex || current.startIdx === null) {
            fragmentSelection.value = { segIndex, startIdx: pointIndex, endIdx: null };
            return true;
        }

        if (current.endIdx === null) {
            fragmentSelection.value = {
                segIndex,
                startIdx: current.startIdx,
                endIdx: pointIndex,
            };
            return true;
        }

        fragmentSelection.value = { segIndex, startIdx: pointIndex, endIdx: null };
        return true;
    }

    function clearFragmentSelection() {
        fragmentSelection.value = { segIndex: null, startIdx: null, endIdx: null };
    }

    function getFragmentRange() {
        const { segIndex, startIdx, endIdx } = fragmentSelection.value;
        if (segIndex === null || startIdx === null || endIdx === null) return null;
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        return { segIndex, startIdx: lo, endIdx: hi };
    }

    function clear() {
        editorMode.value = 'edit';
        snapToRoadMode.value = 'auto';
        trackName.value = '';
        trackDescription.value = '';
        trackCategories.value = [];
        segments.value = [createEmptySegment(0)];
        activeSegmentIndex.value = 0;
        fragmentSelection.value = { segIndex: null, startIdx: null, endIdx: null };
        pois.value = [];
        saving.value = false;
        loading.value = false;
        error.value = null;
        ownerSessionId.value = null;
        ownerUserId.value = null;
        elevationProfile.value = [];
        elevationStats.value = {};
        elevationLoading.value = false;
        elevationError.value = null;
        optimizerTargetRatio.value = OPTIMIZER_DEFAULT_RATIO;
        optimizerPreview.value = null;
        optimizerStats.value = null;
        optimizerLoading.value = false;
        optimizerError.value = null;
    }

    return {
        // State
        editorMode,
        snapToRoadMode,
        trackName,
        trackDescription,
        trackCategories,
        segments,
        activeSegmentIndex,
        fragmentSelection,
        pois,
        saving,
        loading,
        error,
        savedTrackId,
        ownerSessionId,
        ownerUserId,
        elevationProfile,
        elevationStats,
        elevationLoading,
        elevationError,
        optimizerTargetRatio,
        optimizerPreview,
        optimizerStats,
        optimizerLoading,
        optimizerError,

        // Getters
        activeSegment,
        totalPoints,
        totalDistanceKm,
        coordinateData,
        segmentStats,
        canSave,
        isNewTrack,

        // Actions
        setSegmentName,
        setSegmentColor,
        setMode,
        setSnapToRoadMode,
        setActiveSegment,
        setFragmentPoint,
        clearFragmentSelection,
        getFragmentRange,
        clear,
    };
});
