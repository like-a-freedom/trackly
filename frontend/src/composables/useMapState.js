import { ref, computed } from "vue";

// LocalStorage keys for map state persistence
const storageKeys = {
  preSelectionZoom: "trackly_preSelectionZoom",
  preSelectionCenterLat: "trackly_preSelectionCenterLat",
  preSelectionCenterLng: "trackly_preSelectionCenterLng",
};

/**
 * Composable that encapsulates map state persistence logic extracted from TrackMap.vue.
 *
 * Manages:
 * - Reactive map state (lastKnownGood, preSelection, flags)
 * - effectiveZoom / effectiveCenter computed values that avoid conflicting with fitBounds
 * - localStorage save/load helpers for zoom and center
 * - updateInitialMapState: captures zoom/center on user interaction
 *
 * @param {Object} props - Component props (needs zoom, center, bounds, selectedTrackDetail)
 * @returns {{ mapState, effectiveZoom, effectiveCenter, saveMapStateToStorage, loadMapStateFromStorage, updateInitialMapState }}
 */
export function useMapState(props) {
  // Centralized map state management
  const mapState = ref({
    lastKnownGood: {
      zoom: props.zoom,
      center: props.center ? [...props.center] : null,
    },
    preSelection: {
      zoom: props.zoom,
      center: props.center ? [...props.center] : null,
    },
    userChangedZoomOrCenter: false,
    pendingRestoreCenterZoom: false,
  });

  // Computed values for zoom/center that avoid conflicting with fitBounds
  // When bounds is provided with selectedTrackDetail, we let fitBounds control the view
  // and don't pass zoom/center to l-map to prevent vue-leaflet from overriding fitBounds
  const effectiveZoom = computed(() => {
    // When we have bounds for a track detail view, don't apply zoom prop
    // to avoid conflicting with fitBounds
    if (props.bounds && props.selectedTrackDetail) {
      return mapState.value.lastKnownGood.zoom || props.zoom;
    }
    return props.zoom;
  });

  const effectiveCenter = computed(() => {
    // When we have bounds for a track detail view, don't apply center prop
    // to avoid conflicting with fitBounds
    if (props.bounds && props.selectedTrackDetail) {
      return mapState.value.lastKnownGood.center || props.center;
    }
    return props.center;
  });

  function saveMapStateToStorage(zoom, center) {
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

  function loadMapStateFromStorage() {
    try {
      const storedZoom = localStorage.getItem(storageKeys.preSelectionZoom);
      const storedLat = localStorage.getItem(storageKeys.preSelectionCenterLat);
      const storedLng = localStorage.getItem(storageKeys.preSelectionCenterLng);

      if (storedZoom && storedLat && storedLng) {
        return {
          zoom: parseFloat(storedZoom),
          center: [parseFloat(storedLat), parseFloat(storedLng)],
        };
      }
    } catch (error) {
      console.warn("[useMapState] Failed to load state from localStorage:", error);
    }
    return null;
  }

  /**
   * Updates the initial map state (zoom and center) if the user interacts with the map
   * and no detail view is active.
   * @param {Object} e - The map event object.
   */
  function updateInitialMapState(e) {
    if (!props.selectedTrackDetail) {
      const map = e.target;
      mapState.value.lastKnownGood.zoom = map.getZoom();
      mapState.value.lastKnownGood.center = [
        map.getCenter().lat,
        map.getCenter().lng,
      ];

      // When no detail view is active, also update preSelection values
      // to match the current state for next time a track is selected
      mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
      mapState.value.preSelection.center = [
        ...mapState.value.lastKnownGood.center,
      ];

      mapState.value.userChangedZoomOrCenter = true;
    }
  }

  return {
    mapState,
    effectiveZoom,
    effectiveCenter,
    saveMapStateToStorage,
    loadMapStateFromStorage,
    updateInitialMapState,
  };
}
