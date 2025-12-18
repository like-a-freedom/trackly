import { ref } from 'vue';
import { getColorForId } from '../utils/trackColors';
import { getSessionId } from '../utils/session';



/**
 * Speed and pace utility functions
 */
export function validateSpeedData(speed) {
    if (typeof speed !== 'number' || isNaN(speed) || speed < 0 || speed > 200) {
        return null;
    }
    return speed;
}

export function formatSpeed(speed, unit = 'kmh') {
    const validSpeed = validateSpeedData(speed);
    if (validSpeed === null) return 'N/A';

    if (unit === 'mph') {
        return `${(validSpeed * 0.621371).toFixed(2)} mph`;
    }
    return `${validSpeed.toFixed(2)} km/h`;
}

export function calculatePaceFromSpeed(speed, unit = 'min/km') {
    const validSpeed = validateSpeedData(speed);
    if (validSpeed === null || validSpeed === 0) return 'N/A';

    let paceMinutes;
    if (unit === 'min/mi') {
        // Convert km/h to min/mi: 60 / (km/h * 0.621371)
        paceMinutes = 60 / (validSpeed * 0.621371);
    } else {
        // Convert km/h to min/km: 60 / km/h
        paceMinutes = 60 / validSpeed;
    }

    const minutes = Math.floor(paceMinutes);
    const seconds = Math.round((paceMinutes - minutes) * 60);

    return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
}

export function speedToPace(speed, unit = 'min/km') {
    return calculatePaceFromSpeed(speed, unit);
}

export function paceToSpeed(paceString, unit = 'min/km') {
    if (!paceString || typeof paceString !== 'string') return null;

    // Parse pace like "5:30" or "5:30 min/km" - ensure match starts at beginning
    const match = paceString.match(/^(\d+):(\d+)/);
    if (!match) return null;

    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);

    if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

    const totalMinutes = minutes + (seconds / 60);

    if (unit === 'min/mi') {
        // Convert min/mi to km/h: (60 / min/mi) * 1.60934
        return (60 / totalMinutes) * 1.60934;
    } else {
        // Convert min/km to km/h: 60 / min/km
        return 60 / totalMinutes;
    }
}

export function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || seconds < 0 || isNaN(seconds)) return 'N/A';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${remainingSeconds}s`;
    }
}

export function formatDistance(distanceKm, unit = 'km') {
    if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
        return 'N/A';
    }

    if (unit === 'mi') {
        return `${(distanceKm * 0.621371).toFixed(2)} mi`;
    }
    return `${distanceKm.toFixed(2)} km`;
}

export function formatPace(paceMinutes, unit = 'min/km') {
    if (typeof paceMinutes !== 'number' || isNaN(paceMinutes) || paceMinutes <= 0) {
        return 'N/A';
    }

    const minutes = Math.floor(paceMinutes);
    const seconds = Math.round((paceMinutes - minutes) * 60);

    return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
}

export function useTracks() {
    const polylines = ref([]);
    const tracksCollection = ref({ type: 'FeatureCollection', features: [] });
    const error = ref(null);

    // AbortController for cancelling ongoing requests 
    let currentController = null;

    // Simple cache for bbox requests to prevent duplicates
    const bboxCache = new Map();
    const CACHE_TTL = 30000; // 30 seconds

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

        // Check cache first
        const cachedData = getCachedTracks(bboxString);
        if (cachedData && !options.forceRefresh) {
            updatePolylines(cachedData);
            return;
        }

        // Build URL with zoom and mode parameters for optimization
        const zoom = options.zoom || 12; // Default zoom
        const mode = options.mode || 'overview'; // Default mode for track lists
        let url = `/tracks?bbox=${bboxString}&zoom=${zoom}&mode=${mode}`;
        // If owner_session_id is provided ("My tracks" filter), append it so backend can return owner-only results
        if (options && options.ownerSessionId) {
            url += `&owner_session_id=${encodeURIComponent(options.ownerSessionId)}`;
        }

        try {
            currentController = new AbortController();
            const response = await fetch(url, {
                signal: currentController.signal
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

    function updatePolylines(data) {
        let newPolylines = [];
        data.features.forEach((feature, index) => {
            const id = feature.properties && feature.properties.id ? feature.properties.id : undefined;
            const color = getColorForId(id);

            if (feature.geometry && feature.geometry.type === 'MultiLineString') {
                feature.geometry.coordinates.forEach(coords => {
                    newPolylines.push({
                        latlngs: coords.map(([lng, lat]) => [lat, lng]),
                        color,
                        properties: feature.properties,
                        showTooltip: false
                    });
                });
            } else if (feature.geometry && feature.geometry.type === 'LineString') {
                newPolylines.push({
                    latlngs: feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                    color,
                    properties: feature.properties,
                    showTooltip: false
                });
            }
        });
        polylines.value = newPolylines;
        tracksCollection.value = data;
    }
    async function uploadTrack({ file, name, categories }) {
        error.value = null;
        const formData = new FormData();
        formData.append('file', file);
        if (name) formData.append('name', name);
        if (categories && categories.length > 0) formData.append('categories', categories.join(','));
        // Always attach session_id
        formData.append('session_id', getSessionId());
        try {
            const response = await fetch('/tracks/upload', { method: 'POST', body: formData });
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
            const response = await fetch('/tracks/exist', { method: 'POST', body: formData });
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
            let endpoint = `/tracks/${id}`;
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

            const response = await fetch(endpoint);
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

    return {
        polylines,
        tracksCollection,
        fetchTracksInBounds,
        uploadTrack,
        error,
        checkTrackDuplicate,
        fetchTrackDetail,
        processTrackData,
        updateTrackInPolylines,
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
