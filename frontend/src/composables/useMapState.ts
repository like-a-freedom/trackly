import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { LatLngTuple } from '@/types';

// LocalStorage keys for map state persistence
const storageKeys = {
    preSelectionZoom: "trackly_preSelectionZoom",
    preSelectionCenterLat: "trackly_preSelectionCenterLat",
    preSelectionCenterLng: "trackly_preSelectionCenterLng",
};

interface MapState {
    lastKnownGood: {
        zoom: number;
        center: LatLngTuple | null;
    };
    preSelection: {
        zoom: number;
        center: LatLngTuple | null;
    };
    userChangedZoomOrCenter: boolean;
    pendingRestoreCenterZoom: boolean;
}

interface MapStateProps {
    zoom: number;
    center: LatLngTuple | null;
    bounds?: unknown;
    selectedTrackDetail?: unknown;
}

/**
 * Save map state to localStorage.
 */
export function saveMapStateToStorage(zoom: number | undefined, center: LatLngTuple | null): void {
    try {
        if (zoom !== undefined) {
            localStorage.setItem(storageKeys.preSelectionZoom, zoom.toString());
        }
        if (center && center.length >= 2) {
            localStorage.setItem(
                storageKeys.preSelectionCenterLat,
                center[0].toString()
            );
            localStorage.setItem(
                storageKeys.preSelectionCenterLng,
                center[1].toString()
            );
        }
    } catch (error) {
        console.warn("[useMapState] Failed to save state to localStorage:", error);
    }
}

/**
 * Load map state from localStorage.
 */
export function loadMapStateFromStorage(): { zoom: number; center: LatLngTuple } | null {
    try {
        const storedZoom = localStorage.getItem(storageKeys.preSelectionZoom);
        const storedLat = localStorage.getItem(storageKeys.preSelectionCenterLat);
        const storedLng = localStorage.getItem(storageKeys.preSelectionCenterLng);

        if (storedZoom && storedLat && storedLng) {
            return {
                zoom: parseFloat(storedZoom),
                center: [parseFloat(storedLat), parseFloat(storedLng)] as LatLngTuple,
            };
        }
    } catch (error) {
        console.warn("[useMapState] Failed to load state from localStorage:", error);
    }
    return null;
}

/**
 * Composable that encapsulates map state persistence logic extracted from TrackMap.vue.
 */
export function useMapState(props: MapStateProps) {
    // Centralized map state management
    const mapState: Ref<MapState> = ref({
        lastKnownGood: {
            zoom: props.zoom,
            center: props.center ? [...props.center] as LatLngTuple : null,
        },
        preSelection: {
            zoom: props.zoom,
            center: props.center ? [...props.center] as LatLngTuple : null,
        },
        userChangedZoomOrCenter: false,
        pendingRestoreCenterZoom: false,
    });

    // Computed values for zoom/center that avoid conflicting with fitBounds
    const effectiveZoom: ComputedRef<number> = computed(() => {
        // When we have bounds for a track detail view, don't apply zoom prop
        // to avoid conflicting with fitBounds
        if (props.bounds && props.selectedTrackDetail) {
            return mapState.value.lastKnownGood.zoom || props.zoom;
        }
        return props.zoom;
    });

    const effectiveCenter: ComputedRef<LatLngTuple | null> = computed(() => {
        // When we have bounds for a track detail view, don't apply center prop
        // to avoid conflicting with fitBounds
        if (props.bounds && props.selectedTrackDetail) {
            return mapState.value.lastKnownGood.center || props.center;
        }
        return props.center;
    });

    /**
     * Updates the initial map state (zoom and center) if the user interacts with the map
     * and no detail view is active.
     */
    function updateInitialMapState(e: { target: L.Map }): void {
        if (!props.selectedTrackDetail) {
            const map = e.target;
            mapState.value.lastKnownGood.zoom = map.getZoom();
            mapState.value.lastKnownGood.center = [
                map.getCenter().lat,
                map.getCenter().lng,
            ] as LatLngTuple;

            // When no detail view is active, also update preSelection values
            // to match the current state for next time a track is selected
            mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
            mapState.value.preSelection.center = [
                ...mapState.value.lastKnownGood.center,
            ] as LatLngTuple;

            mapState.value.userChangedZoomOrCenter = true;
        }
    }

    // Return module-level functions (they don't depend on closure)
    return {
        mapState,
        effectiveZoom,
        effectiveCenter,
        saveMapStateToStorage,
        loadMapStateFromStorage,
        updateInitialMapState,
    };
}
