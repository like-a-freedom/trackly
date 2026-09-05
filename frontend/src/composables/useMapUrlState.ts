/**
 * Composable for managing map state synchronization with URL parameters
 * Enables shareable URLs by syncing zoom/center with query parameters
 */

import { ref, watch, onMounted, onUnmounted, getCurrentInstance, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdvancedDebounce } from './useAdvancedDebounce';
import { events } from '../events';
import type { LatLngTuple } from '@/types';

/**
 * URL parameter validation functions
 */
function isValidZoom(val: number): boolean {
    return typeof val === 'number' && !isNaN(val) && val >= 6 && val <= 18;
}

function isValidLatLng(val: unknown): val is LatLngTuple {
    return Array.isArray(val) && val.length === 2 &&
        typeof val[0] === 'number' && typeof val[1] === 'number' &&
        !isNaN(val[0]) && !isNaN(val[1]) &&
        val[0] >= -90 && val[0] <= 90 &&
        val[1] >= -180 && val[1] <= 180;
}

interface UseMapUrlStateOptions {
    initialZoom?: number;
    initialCenter?: LatLngTuple;
    debounceMs?: number;
    zoomPrecision?: number;
    coordPrecision?: number;
}

interface UrlParams {
    zoom: number;
    center: LatLngTuple;
    hasValidParams: boolean;
}

interface MapUrlStateChangedEvent {
    zoom: number;
    center: LatLngTuple;
    source: string;
}

/**
 * Main composable for map URL state management
 */
export function useMapUrlState(options: UseMapUrlStateOptions = {}) {
    const {
        initialZoom = 11,
        initialCenter = [56.04028, 37.83185] as LatLngTuple,
        debounceMs = 300,
        zoomPrecision = 2,
        coordPrecision = 6
    } = options;

    const route = useRoute();
    const router = useRouter();

    // Reactive state
    const isUpdatingFromUrl: Ref<boolean> = ref(false);
    const hasUrlParams: Ref<boolean> = ref(false);

    // Track last update to prevent oscillation
    const lastUpdateTime: Ref<number> = ref(0);
    const MIN_UPDATE_INTERVAL = 150; // Minimum time between updates in ms

    /**
     * Parse URL parameters and validate them
     */
    function parseUrlParams(): UrlParams {
        const urlZoom = parseFloat(route.query.zoom as string);
        const urlLat = parseFloat(route.query.lat as string);
        const urlLng = parseFloat(route.query.lng as string);

        // Check if any URL params are present
        hasUrlParams.value = !!(route.query.zoom || route.query.lat || route.query.lng);

        // Validate parsed values
        const validZoom = isValidZoom(urlZoom);
        const validCoords = isValidLatLng([urlLat, urlLng]);

        if (hasUrlParams.value && (!validZoom || !validCoords)) {
            console.warn('[MapURL] Invalid URL parameters detected:', {
                zoom: route.query.zoom,
                lat: route.query.lat,
                lng: route.query.lng,
                validZoom,
                validCoords
            });
        }

        return {
            zoom: validZoom ? urlZoom : initialZoom,
            center: validCoords ? [urlLat, urlLng] as LatLngTuple : initialCenter,
            hasValidParams: validZoom && validCoords
        };
    }

    /**
     * Update URL with new map state (debounced)
     */
    const debouncedUpdateUrl = useAdvancedDebounce((zoom: unknown, center: unknown) => {
        const z = zoom as number;
        const c = center as LatLngTuple;
        // Prevent recursive updates
        if (isUpdatingFromUrl.value) return;

        try {
            const newQuery = {
                zoom: z.toFixed(zoomPrecision),
                lat: c[0].toFixed(coordPrecision),
                lng: c[1].toFixed(coordPrecision)
            };

            // Only update if values actually changed
            const currentQuery = route.query;
            const hasChanged =
                currentQuery.zoom !== newQuery.zoom ||
                currentQuery.lat !== newQuery.lat ||
                currentQuery.lng !== newQuery.lng;

            if (hasChanged) {
                router.replace({
                    query: { ...currentQuery, ...newQuery }
                });
            }
        } catch (error) {
            console.error('[MapURL] Error updating URL:', error);
        }
    }, debounceMs, { leading: false, trailing: true });

    /**
     * Update map state from URL parameters
     */
    function updateFromUrl(zoom: Ref<number>, center: Ref<LatLngTuple>): void {
        const urlParams = parseUrlParams();

        isUpdatingFromUrl.value = true;

        try {
            // Update zoom if it changed and is valid
            if (urlParams.hasValidParams && urlParams.zoom !== zoom.value) {
                zoom.value = urlParams.zoom;
            }

            // Update center if it changed and is valid
            if (urlParams.hasValidParams &&
                (urlParams.center[0] !== center.value[0] || urlParams.center[1] !== center.value[1])) {
                center.value = [...urlParams.center];
            }
        } finally {
            // Always reset the flag after a tick to prevent issues
            setTimeout(() => {
                isUpdatingFromUrl.value = false;
            }, 0);
        }
    }

    /**
     * Batch update both zoom and center to URL
     */
    function updateMapState(zoom: number, center: LatLngTuple): void {
        const now = Date.now();

        // Prevent too rapid updates that can cause oscillation
        if (now - lastUpdateTime.value < MIN_UPDATE_INTERVAL) {
            return;
        }

        lastUpdateTime.value = now;

        if (!isValidZoom(zoom) || !isValidLatLng(center)) {
            return;
        }

        // Use the debounced update instead of direct router update
        debouncedUpdateUrl(zoom, center);
    }

    /**
     * Initialize from URL parameters
     */
    function initializeFromUrl(): { zoom: number; center: LatLngTuple; fromUrl: boolean } {
        const urlParams = parseUrlParams();
        return {
            zoom: urlParams.zoom,
            center: urlParams.center,
            fromUrl: urlParams.hasValidParams
        };
    }

    /**
     * Clear URL parameters (reset to base route)
     */
    function clearUrlParams(): void {
        const { zoom, lat, lng, ...otherQuery } = route.query;
        router.replace({ query: otherQuery });
    }

    /**
     * Get current URL with map parameters
     */
    function getCurrentMapUrl(): string {
        return window.location.href;
    }

    // Watch for route changes to update map state
    let routeUnwatch: (() => void) | null = null;

    // Register route watcher only when used inside a component setup lifecycle
    if (getCurrentInstance()) {
        onMounted(() => {
            // Set up route watcher with proper cleanup
            routeUnwatch = watch(
                () => route.query,
                (newQuery, oldQuery) => {
                    // Only react to map-related query changes
                    const mapQueryChanged =
                        newQuery.zoom !== oldQuery?.zoom ||
                        newQuery.lat !== oldQuery?.lat ||
                        newQuery.lng !== oldQuery?.lng;

                    if (mapQueryChanged && !isUpdatingFromUrl.value) {
                        // External route change (browser back/forward, direct URL change)
                        const urlParams = parseUrlParams();
                        if (urlParams.hasValidParams) {
                            // Emit event for components to react to URL changes
                            events.emit('mapUrlStateChanged', {
                                zoom: urlParams.zoom,
                                center: urlParams.center,
                                source: 'url'
                            });
                        }
                    }
                },
                { immediate: false }
            );
        });

        onUnmounted(() => {
            // Cleanup
            if (routeUnwatch) {
                routeUnwatch();
            }
            debouncedUpdateUrl.cancel();
        });
    }

    return {
        // State
        hasUrlParams,
        isUpdatingFromUrl,

        // Methods
        updateMapState,
        updateFromUrl,
        initializeFromUrl,
        clearUrlParams,
        getCurrentMapUrl,
        parseUrlParams,

        // Validation utilities
        isValidZoom,
        isValidLatLng,

        // Internal methods (exposed for testing)
        _debouncedUpdateUrl: debouncedUpdateUrl
    };
}
