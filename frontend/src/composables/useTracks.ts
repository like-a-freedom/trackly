import { computed, type ComputedRef } from 'vue';
import { useTracksStore } from '../stores/tracks';
import { http } from '../http-instance';
import { getSessionId } from '../utils/session';
import { LRUCache } from '../utils/lru-cache';
import type { Bounds } from '../map/MapAdapter';

interface Polyline {
    latlngs: [number, number][];
    color: string;
    properties: Record<string, unknown>;
    showTooltip: boolean;
}

interface CachedData<T> {
    data: T;
    timestamp: number;
}

const CACHE_TTL = 30000;
const HEATMAP_CACHE_TTL = 30000;

// Module-level reset for test isolation (clears all instances)
let globalBboxCache: LRUCache<CachedData<GeoJSON.FeatureCollection>> | null = null;
let globalHeatmapCache: LRUCache<CachedData<unknown[]>> | null = null;

export function resetTracksCaches(): void {
    globalBboxCache = null;
    globalHeatmapCache = null;
}

function getBBoxCache(): LRUCache<CachedData<GeoJSON.FeatureCollection>> {
    if (!globalBboxCache) globalBboxCache = new LRUCache<CachedData<GeoJSON.FeatureCollection>>(100);
    return globalBboxCache;
}

function getHeatmapCache(): LRUCache<CachedData<unknown[]>> {
    if (!globalHeatmapCache) globalHeatmapCache = new LRUCache<CachedData<unknown[]>>(100);
    return globalHeatmapCache;
}

function getCachedTracks(bboxString: string): GeoJSON.FeatureCollection | null {
    if (!globalBboxCache) return null;
    const cached = globalBboxCache.get(bboxString);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
    return null;
}

function setCachedTracks(bboxString: string, data: GeoJSON.FeatureCollection): void {
    getBBoxCache().set(bboxString, { data, timestamp: Date.now() });
}

function getCachedHeatmap(cacheKey: string): unknown[] | null {
    if (!globalHeatmapCache) return null;
    const cached = globalHeatmapCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HEATMAP_CACHE_TTL) return cached.data;
    return null;
}

function setCachedHeatmap(cacheKey: string, data: unknown[]): void {
    getHeatmapCache().set(cacheKey, { data, timestamp: Date.now() });
}

function normalizeCategories(categories: unknown): string[] | null {
    if (!Array.isArray(categories)) return null;
    return [...categories].map((cat) => String(cat)).sort();
}

interface FilterOptions {
    ownerSessionId?: string;
    mine?: boolean;
    categories?: string[];
    lengthRange?: number[];
    elevationGainRange?: number[];
    slopeRange?: number[];
    zoom?: number;
    forceRefresh?: boolean;
}

function buildFilterQueryParams(options: FilterOptions = {}): URLSearchParams {
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

interface FetchTracksOptions {
    zoom?: number;
    mode?: string;
    ownerSessionId?: string;
    mine?: boolean;
    forceRefresh?: boolean;
    categories?: string[];
    lengthRange?: number[];
    elevationGainRange?: number[];
    slopeRange?: number[];
}

interface UploadTrackOptions {
    file: File;
    name?: string;
    categories?: string[];
    isPublic?: boolean;
}

export function useTracks() {
    const store = useTracksStore();

    // Per-instance controllers — each component calling useTracks() gets its own,
    // preventing cross-component abort interference.
    let currentController: AbortController | null = null;
    let heatmapController: AbortController | null = null;

    const polylines: ComputedRef<Polyline[]> = computed(() => store.polylines);
    const tracksCollection: ComputedRef<GeoJSON.FeatureCollection> = computed(() => store.tracksCollection);
    const heatmapPoints: ComputedRef<unknown[]> = computed(() => store.heatmapPoints);
    const error: ComputedRef<string | null> = computed(() => store.error);

    async function fetchTracksInBounds(bounds: Bounds, options: FetchTracksOptions = {}): Promise<void> {
        store.error = null;
        if (!bounds) return;
        if (currentController) currentController.abort();

        const [swLng, swLat] = bounds.sw;
        const [neLng, neLat] = bounds.ne;
        const bboxString = `${swLng},${swLat},${neLng},${neLat}`;

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
                setCachedTracks(bboxString, data as GeoJSON.FeatureCollection);
                store.updatePolylines(data as GeoJSON.FeatureCollection);
            } else {
                store.polylines = [];
                store.tracksCollection = { type: 'FeatureCollection', features: [] };
            }
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') return;
            store.error = e instanceof Error ? e.message : 'Unknown error fetching tracks';
            store.polylines = [];
            store.tracksCollection = { type: 'FeatureCollection', features: [] };
        } finally {
            currentController = null;
        }
    }

    async function fetchHeatmapInBounds(bounds: Bounds, options: FetchTracksOptions = {}): Promise<void> {
        store.error = null;
        if (!bounds) return;
        if (heatmapController) heatmapController.abort();

        const [swLng, swLat] = bounds.sw;
        const [neLng, neLat] = bounds.ne;
        const bboxString = `${swLng},${swLat},${neLng},${neLat}`;
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
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') return;
            store.error = e instanceof Error ? e.message : 'Unknown error fetching heatmap data';
            store.heatmapPoints = [];
        } finally {
            heatmapController = null;
        }
    }

    async function uploadTrack({ file, name, categories, isPublic }: UploadTrackOptions): Promise<unknown> {
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
        } catch (e: unknown) {
            store.error = e instanceof Error ? e.message : 'Unknown upload error';
            throw e;
        }
    }

    function checkTrackDuplicate(): { alreadyExists: boolean } {
        return { alreadyExists: false };
    }

    async function fetchTrackDetail(id: string, zoom: number | null = null, mode: string = 'detail'): Promise<unknown> {
        store.error = null;
        if (!id) return null;
        try {
            let endpoint = `/api/tracks/${id}`;
            const params = new URLSearchParams();
            if (zoom !== null) params.append('zoom', zoom.toString());
            if (mode) params.append('mode', mode);
            if (params.toString()) endpoint += `?${params.toString()}`;

            const sessionId = getSessionId();
            const headers: Record<string, string> | undefined = sessionId ? { 'x-session-id': sessionId } : undefined;

            const response = await http(endpoint, { headers });
            if (!response.ok) throw new Error(`Failed to fetch track detail: ${response.status}`);
            return store.processTrackData(await response.json());
        } catch (e: unknown) {
            store.error = e instanceof Error ? e.message : 'Unknown error fetching track detail';
            return null;
        }
    }

    async function updateTrackCategories(id: string, categories: string[]): Promise<boolean> {
        store.error = null;
        try {
            const response = await http(`/api/tracks/${id}/categories`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: getSessionId(), categories })
            });
            if (!response.ok) throw new Error(await response.text() || 'Failed to update categories');
            store.updateTrackInPolylines(id, { categories });
            return true;
        } catch (e: unknown) {
            store.error = e instanceof Error ? e.message : 'Unknown error updating categories';
            throw e;
        }
    }

    async function updateTrackDistanceMarkers(id: string, enabled: boolean): Promise<boolean> {
        store.error = null;
        try {
            const response = await http(`/api/tracks/${id}/distance-markers`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ distance_markers_enabled: !!enabled, session_id: getSessionId() })
            });
            if (!response.ok) throw new Error(await response.text() || 'Failed to update distance markers');
            store.updateTrackInPolylines(id, { distance_markers_enabled: !!enabled });
            return true;
        } catch (e: unknown) {
            store.error = e instanceof Error ? e.message : 'Unknown error updating distance markers';
            throw e;
        }
    }

    async function updateTrackVisibility(id: string, isPublic: boolean): Promise<unknown> {
        store.error = null;
        try {
            const response = await http(`/api/tracks/${id}/visibility`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_public: isPublic, session_id: getSessionId() })
            });
            if (!response.ok) throw new Error(await response.text() || 'Failed to update visibility');
            store.updateTrackInPolylines(id, { is_public: isPublic });
            return await response.json();
        } catch (e: unknown) {
            store.error = e instanceof Error ? e.message : 'Unknown error updating visibility';
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
        processTrackData: (d: Parameters<typeof store.processTrackData>[0]) => store.processTrackData(d),
        updateTrackInPolylines: (id: string, u: Record<string, unknown>) => store.updateTrackInPolylines(id, u),
        updateTrackCategories,
        updateTrackDistanceMarkers,
        updateTrackVisibility,
    };
}
