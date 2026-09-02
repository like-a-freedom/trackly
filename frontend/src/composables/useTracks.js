import { computed } from 'vue';
import { useTracksStore } from '../stores/tracks.js';
import { http } from '../http-instance';
import { getSessionId } from '../utils/session';
import { LRUCache } from '../utils/lru-cache';
import {
    formatDuration,
    formatDistance,
    formatPace,
    formatSpeed,
    calculatePaceFromSpeed,
    speedToPace,
    paceToSpeed,
    validateSpeedData
} from '../utils/format';

export {
    formatDuration,
    formatDistance,
    formatPace,
    formatSpeed,
    calculatePaceFromSpeed,
    speedToPace,
    paceToSpeed,
    validateSpeedData
};

// Module-scope caches (not in store — they hold raw API data, not reactive state)
const bboxCache = new LRUCache(100);
const heatmapCache = new LRUCache(100);
const CACHE_TTL = 30000;
const HEATMAP_CACHE_TTL = 30000;

let currentController = null;
let heatmapController = null;

function getCachedTracks(bboxString) {
    const cached = bboxCache.get(bboxString);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
    return null;
}

function setCachedTracks(bboxString, data) {
    bboxCache.set(bboxString, { data, timestamp: Date.now() });
}

function getCachedHeatmap(cacheKey) {
    const cached = heatmapCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HEATMAP_CACHE_TTL) return cached.data;
    return null;
}

function setCachedHeatmap(cacheKey, data) {
    heatmapCache.set(cacheKey, { data, timestamp: Date.now() });
}

function normalizeCategories(categories) {
    if (!Array.isArray(categories)) return null;
    return [...categories].map((cat) => String(cat)).sort();
}

function buildFilterQueryParams(options = {}) {
    const params = new URLSearchParams();
    if (options.ownerSessionId) params.set('owner_session_id', options.ownerSessionId);
    if (options.mine) params.set('mine', 'true');
    const categories = normalizeCategories(options.categories);
    if (categories?.length) params.set('categories', categories.join(','));
    if (Array.isArray(options.lengthRange) && options.lengthRange.length === 2) {
        const [min, max] = options.lengthRange;
        if (typeof min === 'number') params.set('min_length', String(min));
        if (typeof max === 'number') params.set('max_length', String(max));
    }
    if (Array.isArray(options.elevationGainRange) && options.elevationGainRange.length === 2) {
        const [min, max] = options.elevationGainRange;
        if (typeof min === 'number') params.set('elevation_gain_min', String(min));
        if (typeof max === 'number') params.set('elevation_gain_max', String(max));
    }
    if (Array.isArray(options.slopeRange) && options.slopeRange.length === 2) {
        const [min, max] = options.slopeRange;
        if (typeof min === 'number') params.set('slope_min', String(min));
        if (typeof max === 'number') params.set('slope_max', String(max));
    }
    return params;
}

export function resetTracksCaches() {
    bboxCache.clear();
    heatmapCache.clear();
}

export function useTracks() {
    const store = useTracksStore();

    const polylines = computed(() => store.polylines);
    const tracksCollection = computed(() => store.tracksCollection);
    const heatmapPoints = computed(() => store.heatmapPoints);
    const error = computed(() => store.error);

    async function fetchTracksInBounds(bounds, options = {}) {
        store.error = null;
        if (!bounds) return;
        if (currentController) currentController.abort();

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const bboxString = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

        const cachedData = getCachedTracks(bboxString);
        if (cachedData && !options.forceRefresh && !options.mine) {
            store.updatePolylines(cachedData);
            return;
        }

        const zoom = options.zoom || 12;
        const mode = options.mode || 'overview';
        let url = `/api/tracks?bbox=${bboxString}&zoom=${zoom}&mode=${mode}`;
        if (options.ownerSessionId) url += `&owner_session_id=${encodeURIComponent(options.ownerSessionId)}`;
        if (options.mine) url += '&mine=true';

        try {
            currentController = new AbortController();
            const response = await http(url, { signal: currentController.signal });
            if (!response.ok) throw new Error('Failed to fetch tracks');
            const data = await response.json();
            if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
                setCachedTracks(bboxString, data);
                store.updatePolylines(data);
            } else {
                store.polylines = [];
                store.tracksCollection = { type: 'FeatureCollection', features: [] };
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
            store.error = e.message || 'Unknown error fetching tracks';
            store.polylines = [];
            store.tracksCollection = { type: 'FeatureCollection', features: [] };
        } finally {
            currentController = null;
        }
    }

    async function fetchHeatmapInBounds(bounds, options = {}) {
        store.error = null;
        if (!bounds) return;
        if (heatmapController) heatmapController.abort();

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const bboxString = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
        const zoom = options.zoom || 12;
        const filterParams = buildFilterQueryParams(options);
        const filterKey = JSON.stringify({
            zoom,
            categories: normalizeCategories(options.categories),
            lengthRange: options.lengthRange || null,
            elevationGainRange: options.elevationGainRange || null,
            slopeRange: options.slopeRange || null,
            mine: !!options.mine,
            ownerSessionId: options.ownerSessionId || null
        });
        const cacheKey = `${bboxString}|${filterKey}`;

        const cached = getCachedHeatmap(cacheKey);
        if (cached && !options.forceRefresh) {
            store.heatmapPoints = cached;
            return;
        }

        filterParams.set('bbox', bboxString);
        filterParams.set('zoom', String(zoom));

        try {
            heatmapController = new AbortController();
            const response = await http(`/api/tracks/heatmap?${filterParams.toString()}`, {
                signal: heatmapController.signal,
            });
            if (!response.ok) throw new Error('Failed to fetch heatmap data');
            const data = await response.json();
            if (data && Array.isArray(data.points)) {
                store.heatmapPoints = data.points;
                setCachedHeatmap(cacheKey, data.points);
            } else {
                store.heatmapPoints = [];
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
            store.error = e.message || 'Unknown error fetching heatmap data';
            store.heatmapPoints = [];
        } finally {
            heatmapController = null;
        }
    }

    async function uploadTrack({ file, name, categories, isPublic }) {
        store.error = null;
        const formData = new FormData();
        formData.append('file', file);
        if (name) formData.append('name', name);
        if (categories?.length) formData.append('categories', categories.join(','));
        formData.append('session_id', getSessionId());
        if (isPublic !== undefined) formData.append('is_public', isPublic.toString());

        try {
            const response = await http('/api/tracks/upload', { method: 'POST', body: formData });
            if (!response.ok) {
                const text = await response.text();
                if (response.status === 429) throw new Error('Please, wait 10 seconds between uploads.');
                throw new Error(text || 'Unknown error uploading track');
            }
            return await response.json();
        } catch (e) {
            store.error = e.message || 'Unknown upload error';
            throw e;
        }
    }

    function checkTrackDuplicate() {
        return { alreadyExists: false };
    }

    async function fetchTrackDetail(id, zoom = null, mode = 'detail') {
        store.error = null;
        if (!id) return null;
        try {
            let endpoint = `/api/tracks/${id}`;
            const params = new URLSearchParams();
            if (zoom !== null) params.append('zoom', zoom.toString());
            if (mode) params.append('mode', mode);
            if (params.toString()) endpoint += `?${params.toString()}`;

            const sessionId = getSessionId();
            const headers = sessionId ? { 'x-session-id': sessionId } : {};

            const response = await http(endpoint, { headers });
            if (!response.ok) throw new Error(`Failed to fetch track detail: ${response.status}`);
            return store.processTrackData(await response.json());
        } catch (e) {
            store.error = e.message || 'Unknown error fetching track detail';
            return null;
        }
    }

    async function updateTrackCategories(id, categories) {
        store.error = null;
        try {
            const response = await http(`/api/tracks/${id}/categories`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: getSessionId(), categories })
            });
            if (!response.ok) throw new Error(await response.text() || 'Failed to update categories');
            store.updateTrackInPolylines(id, { categories });
            return true;
        } catch (e) {
            store.error = e.message || 'Unknown error updating categories';
            throw e;
        }
    }

    async function updateTrackDistanceMarkers(id, enabled) {
        store.error = null;
        try {
            const response = await http(`/api/tracks/${id}/distance-markers`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ distance_markers_enabled: !!enabled, session_id: getSessionId() })
            });
            if (!response.ok) throw new Error(await response.text() || 'Failed to update distance markers');
            store.updateTrackInPolylines(id, { distance_markers_enabled: !!enabled });
            return true;
        } catch (e) {
            store.error = e.message || 'Unknown error updating distance markers';
            throw e;
        }
    }

    async function updateTrackVisibility(id, isPublic) {
        store.error = null;
        try {
            const response = await http(`/api/tracks/${id}/visibility`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_public: isPublic, session_id: getSessionId() })
            });
            if (!response.ok) throw new Error(await response.text() || 'Failed to update visibility');
            store.updateTrackInPolylines(id, { is_public: isPublic });
            return await response.json();
        } catch (e) {
            store.error = e.message || 'Unknown error updating visibility';
            throw e;
        }
    }

    return {
        polylines,
        tracksCollection,
        heatmapPoints,
        error,
        fetchTracksInBounds,
        fetchHeatmapInBounds,
        clearHeatmap: () => { store.heatmapPoints = []; },
        uploadTrack,
        checkTrackDuplicate,
        fetchTrackDetail,
        processTrackData: (d) => store.processTrackData(d),
        updateTrackInPolylines: (id, u) => store.updateTrackInPolylines(id, u),
        updateTrackCategories,
        updateTrackDistanceMarkers,
        updateTrackVisibility,
        validateSpeedData,
        formatSpeed,
        calculatePaceFromSpeed,
        speedToPace,
        paceToSpeed,
        formatDuration,
        formatDistance,
        formatPace
    };
}
