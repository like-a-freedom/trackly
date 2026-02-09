import { ref } from 'vue';
import { getColorForId } from '../utils/trackColors';
import { getSessionId } from '../utils/session';
import { useAuth } from './useAuth';
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
import { geoJsonLineToLeaflet } from '../utils/coordinates';

// Re-export format utilities for backward compatibility
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

export function useTracks() {
    const polylines = ref([]);
    const tracksCollection = ref({ type: 'FeatureCollection', features: [] });
    const heatmapPoints = ref([]);
    const error = ref(null);

    // AbortController for cancelling ongoing requests 
    let currentController = null;
    let heatmapController = null;

    // Simple cache for bbox requests to prevent duplicates
    const bboxCache = new Map();
    const heatmapCache = new Map();
    const CACHE_TTL = 30000; // 30 seconds
    const HEATMAP_CACHE_TTL = 30000; // 30 seconds

    function getCachedTracks(bboxString) {
        const cached = bboxCache.get(bboxString);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    function setCachedTracks(bboxString, data) {
        bboxCache.set(bboxString, {
            data,
            timestamp: Date.now()
        });

        // Clean old cache entries
        for (const [key, value] of bboxCache.entries()) {
            if (Date.now() - value.timestamp > CACHE_TTL) {
                bboxCache.delete(key);
            }
        }
    }

    function getCachedHeatmap(cacheKey) {
        const cached = heatmapCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < HEATMAP_CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    function setCachedHeatmap(cacheKey, data) {
        heatmapCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        for (const [key, value] of heatmapCache.entries()) {
            if (Date.now() - value.timestamp > HEATMAP_CACHE_TTL) {
                heatmapCache.delete(key);
            }
        }
    }

    function normalizeCategories(categories) {
        if (!Array.isArray(categories)) return null;
        return [...categories].map((cat) => String(cat)).sort();
    }

    function buildFilterQueryParams(options = {}) {
        const params = new URLSearchParams();

        if (options.ownerSessionId) {
            params.set('owner_session_id', options.ownerSessionId);
        }

        if (options.mine) {
            params.set('mine', 'true');
        }

        const categories = normalizeCategories(options.categories);
        if (categories && categories.length > 0) {
            params.set('categories', categories.join(','));
        }

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

    async function fetchTracksInBounds(bounds, options = {}) {
        error.value = null;
        if (!bounds) return;

        // Cancel previous request
        if (currentController) {
            currentController.abort();
        }

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const bboxString = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

        // Check cache first (skip cache if mine filter is active to ensure fresh auth data)
        const cachedData = getCachedTracks(bboxString);
        if (cachedData && !options.forceRefresh && !options.mine) {
            updatePolylines(cachedData);
            return;
        }

        // Build URL with zoom and mode parameters for optimization
        const zoom = options.zoom || 12; // Default zoom
        const mode = options.mode || 'overview'; // Default mode for track lists
        let url = `/api/tracks?bbox=${bboxString}&zoom=${zoom}&mode=${mode}`;

        // If owner_session_id is provided ("My tracks" filter), append it so backend can return owner-only results
        if (options && options.ownerSessionId) {
            url += `&owner_session_id=${encodeURIComponent(options.ownerSessionId)}`;
        }

        // If mine filter is active, add mine=true parameter
        if (options.mine) {
            url += '&mine=true';
        }

        try {
            currentController = new AbortController();

            // Build headers - include auth token if authenticated for mine filter
            const headers = {};
            if (options.mine) {
                const { accessToken, ensureValidToken } = useAuth();
                if (accessToken.value) {
                    try {
                        await ensureValidToken();
                        headers['Authorization'] = `Bearer ${accessToken.value}`;
                    } catch (e) {
                        // Auth expired, fall back to session-based
                        console.debug('Auth token expired for mine filter');
                    }
                }
            }

            const response = await fetch(url, {
                signal: currentController.signal,
                headers
            });

            if (!response.ok) throw new Error("Failed to fetch tracks");
            const data = await response.json();

            if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
                // Cache the response
                setCachedTracks(bboxString, data);
                updatePolylines(data);
            } else {
                polylines.value = [];
                tracksCollection.value = { type: 'FeatureCollection', features: [] };
            }
        } catch (e) {
            // Don't show error for aborted requests
            if (e.name === 'AbortError') {
                return;
            }

            error.value = e.message || 'Unknown error fetching tracks';
            polylines.value = [];
            tracksCollection.value = { type: 'FeatureCollection', features: [] };
        } finally {
            currentController = null;
        }
    }

    async function fetchHeatmapInBounds(bounds, options = {}) {
        error.value = null;
        if (!bounds) return;

        if (heatmapController) {
            heatmapController.abort();
        }

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
            heatmapPoints.value = cached;
            return;
        }

        filterParams.set('bbox', bboxString);
        filterParams.set('zoom', String(zoom));

        try {
            heatmapController = new AbortController();

            const headers = {};
            if (options.mine) {
                const { accessToken, ensureValidToken } = useAuth();
                if (accessToken.value) {
                    try {
                        await ensureValidToken();
                        headers['Authorization'] = `Bearer ${accessToken.value}`;
                    } catch (e) {
                        console.debug('Auth token expired for heatmap mine filter');
                    }
                }
            }

            const response = await fetch(`/api/tracks/heatmap?${filterParams.toString()}`, {
                signal: heatmapController.signal,
                headers
            });

            if (!response.ok) throw new Error('Failed to fetch heatmap data');
            const data = await response.json();

            if (data && Array.isArray(data.points)) {
                heatmapPoints.value = data.points;
                setCachedHeatmap(cacheKey, data.points);
            } else {
                heatmapPoints.value = [];
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                return;
            }
            error.value = e.message || 'Unknown error fetching heatmap data';
            heatmapPoints.value = [];
        } finally {
            heatmapController = null;
        }
    }

    function clearHeatmap() {
        heatmapPoints.value = [];
    }

    function updatePolylines(data) {
        let newPolylines = [];
        data.features.forEach((feature, index) => {
            const id = feature.properties && feature.properties.id ? feature.properties.id : undefined;
            const color = getColorForId(id);

            if (feature.geometry && feature.geometry.type === 'MultiLineString') {
                feature.geometry.coordinates.forEach(coords => {
                    newPolylines.push({
                        latlngs: geoJsonLineToLeaflet(coords),
                        color,
                        properties: feature.properties,
                        showTooltip: false
                    });
                });
            } else if (feature.geometry && feature.geometry.type === 'LineString') {
                newPolylines.push({
                    latlngs: geoJsonLineToLeaflet(feature.geometry.coordinates),
                    color,
                    properties: feature.properties,
                    showTooltip: false
                });
            }
        });
        polylines.value = newPolylines;
        tracksCollection.value = data;
    }
    async function uploadTrack({ file, name, categories, isPublic }) {
        error.value = null;
        const formData = new FormData();
        formData.append('file', file);
        if (name) formData.append('name', name);
        if (categories && categories.length > 0) formData.append('categories', categories.join(','));
        // Always attach session_id for anonymous fallback
        formData.append('session_id', getSessionId());
        // Set visibility if provided
        if (isPublic !== undefined) {
            formData.append('is_public', isPublic.toString());
        }

        try {
            // Build headers with auth token if authenticated
            const headers = {};
            const { accessToken, ensureValidToken, isAuthenticated } = useAuth();
            if (isAuthenticated.value && accessToken.value) {
                try {
                    await ensureValidToken();
                    headers['Authorization'] = `Bearer ${accessToken.value}`;
                } catch (e) {
                    // Auth expired, continue with session-based upload
                    console.debug('Auth token expired, using session-based upload');
                }
            }

            const response = await fetch('/api/tracks/upload', {
                method: 'POST',
                body: formData,
                headers
            });
            if (!response.ok) {
                const text = await response.text();
                if (response.status === 429) {
                    throw new Error('Please, wait 10 seconds between uploads.');
                }
                throw new Error(text || 'Unknown error uploading track');
            }
            return await response.json();
        } catch (e) {
            error.value = e.message || 'Unknown upload error';
            throw e;
        }
    }
    /**
     * Checks if a track already exists by uploading file to /tracks/exist.
     * Returns { alreadyExists: boolean, id?: string, warning?: string }
     */
    async function checkTrackDuplicate({ file }) {
        if (!file) return { alreadyExists: false };
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/api/tracks/exist', { method: 'POST', body: formData });
            let json = null;
            try {
                json = await response.json();
            } catch { }
            if (json && json.is_exist) {
                return {
                    alreadyExists: true,
                    id: json.id,
                    warning: 'Track already exists',
                };
            }
            return { alreadyExists: false };
        } catch (e) {
            return { alreadyExists: false, warning: e.message || 'Error checking track' };
        }
    }

    /**
     * Validate and process track data for display
     */
    function processTrackData(trackData) {
        if (!trackData || typeof trackData !== 'object') {
            console.warn('Invalid track data provided');
            return null;
        }

        const processed = { ...trackData };

        // Validate and process speed data
        if (processed.avg_speed !== undefined) {
            processed.avg_speed = validateSpeedData(processed.avg_speed);
        }

        if (processed.max_speed !== undefined) {
            processed.max_speed = validateSpeedData(processed.max_speed);
        }

        // Validate distance
        if (processed.length_km !== undefined) {
            if (typeof processed.length_km !== 'number' || isNaN(processed.length_km) || processed.length_km < 0) {
                processed.length_km = null;
            }
        }

        // Validate duration
        if (processed.duration_seconds !== undefined) {
            if (typeof processed.duration_seconds !== 'number' || isNaN(processed.duration_seconds) || processed.duration_seconds < 0) {
                processed.duration_seconds = null;
            }
        }

        // Validate elevation data
        ['elevation_up', 'elevation_down', 'avg_hr'].forEach(field => {
            if (processed[field] !== undefined) {
                if (typeof processed[field] !== 'number' || isNaN(processed[field])) {
                    processed[field] = null;
                }
            }
        });

        return processed;
    }

    /**
     * Enhanced fetchTrackDetail with data validation and zoom/mode support
     * @param {string} id - track ID
     * @param {number} zoom - zoom level for track simplification (optional)
     * @param {string} mode - detail or overview mode (optional, defaults to 'detail')
     */
    async function fetchTrackDetail(id, zoom = null, mode = 'detail') {
        error.value = null;
        if (!id) {
            console.warn('fetchTrackDetail: No track ID provided');
            return null;
        }

        try {
            // Use adaptive endpoint with zoom and mode for optimal performance
            let endpoint = `/api/tracks/${id}`;
            const params = new URLSearchParams();

            if (zoom !== null) {
                params.append('zoom', zoom.toString());
            }
            if (mode) {
                params.append('mode', mode);
            }

            if (params.toString()) {
                endpoint += `?${params.toString()}`;
            }

            console.log(`Fetching track detail: ${endpoint}`);

            // Include session id header so backend can classify ownership
            const sessionId = getSessionId();
            const headers = sessionId ? { 'x-session-id': sessionId } : {};

            // Include auth token if authenticated for private track access
            const { accessToken, isAuthenticated } = useAuth();
            if (isAuthenticated.value && accessToken.value) {
                headers['Authorization'] = `Bearer ${accessToken.value}`;
            }

            const response = await fetch(endpoint, { headers });
            if (!response.ok) {
                throw new Error(`Failed to fetch track detail: ${response.status} ${response.statusText}`);
            }

            const trackData = await response.json();
            const processedTrack = processTrackData(trackData);

            if (!processedTrack) {
                throw new Error('Invalid track data received from server');
            }

            return processedTrack;
        } catch (e) {
            const errorMessage = e.message || 'Unknown error fetching track detail';
            console.error('fetchTrackDetail error:', errorMessage);
            error.value = errorMessage;
            return null;
        }
    }

    // Function to update specific track data in cached polylines
    function updateTrackInPolylines(trackId, updates) {
        // Update polylines
        polylines.value = polylines.value.map(polyline => {
            if (polyline.properties?.id === trackId) {
                return {
                    ...polyline,
                    properties: {
                        ...polyline.properties,
                        ...updates
                    }
                };
            }
            return polyline;
        });

        // Update tracksCollection
        if (tracksCollection.value?.features) {
            tracksCollection.value.features = tracksCollection.value.features.map(feature => {
                if (feature.properties?.id === trackId) {
                    return {
                        ...feature,
                        properties: {
                            ...feature.properties,
                            ...updates
                        }
                    };
                }
                return feature;
            });
        }
    }

    async function updateTrackCategories(id, categories) {
        // Send PATCH request to update categories for track with session_id
        error.value = null;
        try {
            const body = {
                session_id: getSessionId(),
                categories
            };

            // Build headers with auth token if authenticated
            const headers = { 'Content-Type': 'application/json' };
            const { accessToken, isAuthenticated } = useAuth();
            if (isAuthenticated.value && accessToken.value) {
                headers['Authorization'] = `Bearer ${accessToken.value}`;
            }

            const response = await fetch(`/api/tracks/${id}/categories`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to update categories');
            }
            // Update cached track data if present
            updateTrackInPolylines(id, { categories });
            return true;
        } catch (e) {
            error.value = e.message || 'Unknown error updating categories';
            throw e;
        }
    }

    /**
     * Update track visibility (public/private)
     * @param {string} id - track ID
     * @param {boolean} isPublic - visibility state
     */
    async function updateTrackVisibility(id, isPublic) {
        error.value = null;
        try {
            const headers = { 'Content-Type': 'application/json' };
            const { accessToken, ensureValidToken, isAuthenticated } = useAuth();

            if (isAuthenticated.value && accessToken.value) {
                await ensureValidToken();
                headers['Authorization'] = `Bearer ${accessToken.value}`;
            }

            const response = await fetch(`/api/tracks/${id}/visibility`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    is_public: isPublic,
                    session_id: getSessionId()
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Failed to update visibility');
            }

            // Update cached track data
            updateTrackInPolylines(id, { is_public: isPublic });
            return await response.json();
        } catch (e) {
            error.value = e.message || 'Unknown error updating visibility';
            throw e;
        }
    }

    return {
        polylines,
        tracksCollection,
        heatmapPoints,
        fetchTracksInBounds,
        fetchHeatmapInBounds,
        clearHeatmap,
        uploadTrack,
        error,
        checkTrackDuplicate,
        fetchTrackDetail,
        processTrackData,
        updateTrackInPolylines,
        updateTrackCategories,
        updateTrackVisibility,
        // Export utility functions
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
