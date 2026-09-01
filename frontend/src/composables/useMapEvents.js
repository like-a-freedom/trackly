/**
 * Composable that encapsulates all map event handlers for TrackMap.
 *
 * Extracted from TrackMap.vue to separate event-handling concerns from
 * template/rendering logic. All external dependencies are injected via
 * the options object so the composable stays framework-agnostic
 * (no direct imports of Vue refs or component state).
 */
import { nextTick } from "vue";
import { latLngBounds } from "leaflet";
import {
  getDetailPanelFitBoundsOptions,
} from "../utils/mapConstants.js";

// ---------------------------------------------------------------------------
// Local storage helpers for pre-selection state persistence
// ---------------------------------------------------------------------------
const STORAGE_KEYS = {
  preSelectionZoom: "trackly_preSelectionZoom",
  preSelectionCenterLat: "trackly_preSelectionCenterLat",
  preSelectionCenterLng: "trackly_preSelectionCenterLng",
};

function saveMapStateToStorage(zoom, center) {
  try {
    if (zoom !== undefined) {
      localStorage.setItem(STORAGE_KEYS.preSelectionZoom, zoom.toString());
    }
    if (center && center.length >= 2) {
      localStorage.setItem(
        STORAGE_KEYS.preSelectionCenterLat,
        center[0].toString()
      );
      localStorage.setItem(
        STORAGE_KEYS.preSelectionCenterLng,
        center[1].toString()
      );
    }
  } catch (error) {
    console.warn("[useMapEvents] Failed to save state to localStorage:", error);
  }
}

function loadMapStateFromStorage() {
  try {
    const storedZoom = localStorage.getItem(STORAGE_KEYS.preSelectionZoom);
    const storedLat = localStorage.getItem(STORAGE_KEYS.preSelectionCenterLat);
    const storedLng = localStorage.getItem(STORAGE_KEYS.preSelectionCenterLng);

    if (storedZoom && storedLat && storedLng) {
      return {
        zoom: parseFloat(storedZoom),
        center: [parseFloat(storedLat), parseFloat(storedLng)],
      };
    }
  } catch (error) {
    console.warn("[useMapEvents] Failed to load state from localStorage:", error);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main composable
// ---------------------------------------------------------------------------

/**
 * @param {Object} options
 * @param {Object}   options.props               - Component props (reactive proxy)
 * @param {Function} options.emit                 - Component emit function
 * @param {Object}   options.leafletAdapter       - Leaflet adapter for layer operations
 * @param {Object}   options.clusterAdapter       - Cluster adapter (reserved)
 * @param {Ref}      options.mapState             - Ref to map state object
 * @param {Ref}      options.mapIsReady           - Ref<boolean> whether map is ready
 * @param {Ref}      options.isPanningOrZooming   - Ref<boolean>
 * @param {Ref}      options.isZoomAnimating      - Ref<boolean>
 * @param {Ref}      options.trackZoomAnimating   - Ref<boolean>
 * @param {Ref}      options.isTransitioning      - Ref<boolean>
 * @param {Ref}      options.stableBounds          - Ref for stable bounds
 * @param {Function} options.highlightSegmentForMarker - Highlights polyline segment near marker
 * @param {Function} options.removeMarkerPolyline  - Removes hover marker polyline
 * @param {Function} options.showMarkerPolyline    - Shows hover marker polyline
 * @param {Function} options.clearSegmentHighlight - Clears segment highlight layer
 * @param {Function} options.performAutoPan        - Auto-pans map to keep marker in view
 * @param {Function} options.setTrackZoomAnimating - Sets trackZoomAnimating ref
 * @param {Function} options.updateStableBounds    - Debounced stable-bounds updater
 * @param {Function} options.debouncedUpdateClustering - Debounced clustering updater
 * @param {Object}   options.clustering            - Clustering composable instance
 * @param {*}        options.layerKey              - Reactive key for layer rebuilds
 * @param {Function} options.getMapObject          - Returns the Leaflet map instance
 * @param {Ref}      options.displayMode           - Computed ref for display mode ("cluster"|"detail"|…)
 * @param {Ref}      options.hoveredSegmentPolyline - Ref to current hovered segment polyline
 * @param {Ref}      options.isUnmounting          - Ref<boolean> whether component is unmounting
 * @param {Ref}      options.filteredTracks        - Computed ref of filtered tracks
 * @param {Ref}      options.mapBounds             - Ref for map bounds (used in selection/deselection)
 */
export function useMapEvents({
  props,
  emit,
  leafletAdapter,
  clusterAdapter,
  mapState,
  mapIsReady,
  isPanningOrZooming,
  isZoomAnimating,
  trackZoomAnimating,
  isTransitioning,
  stableBounds,
  highlightSegmentForMarker,
  removeMarkerPolyline,
  showMarkerPolyline,
  clearSegmentHighlight,
  performAutoPan,
  setTrackZoomAnimating,
  updateStableBounds,
  debouncedUpdateClustering,
  clustering,
  layerKey,
  // Additional dependencies needed by the extracted handlers
  getMapObject,
  displayMode,
  hoveredSegmentPolyline,
  isUnmounting,
  filteredTracks,
  mapBounds,
}) {
  // -----------------------------------------------------------------------
  // Internal timeout management (mirrors the original component-scoped vars)
  // -----------------------------------------------------------------------
  let clusteringUpdateTimeout = null;
  let mapUpdateTimeout = null;

  function clearClusteringUpdateTimeout() {
    if (clusteringUpdateTimeout) {
      clearTimeout(clusteringUpdateTimeout);
      clusteringUpdateTimeout = null;
    }
  }

  function clearMapUpdateTimeout() {
    if (mapUpdateTimeout) {
      clearTimeout(mapUpdateTimeout);
      mapUpdateTimeout = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal helper – updateInitialMapState
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // 1. Track event handlers
  // -----------------------------------------------------------------------
  function onTrackClick(poly, event) {
    emit("trackClick", poly, event);
  }

  function onTrackMouseOver(poly, event) {
    // Skip hover events during zoom animations or panning to reduce processing
    if (
      props.selectedTrackDetail ||
      isZoomAnimating.value ||
      isPanningOrZooming.value
    )
      return;

    const leafletLayer = event.target;
    if (leafletLayer && typeof leafletLayer.bringToFront === "function") {
      leafletLayer.bringToFront();
    }
    emit("trackMouseOver", poly, event);
  }

  function onTrackMouseMove(event) {
    // Skip mouse move events during active operations
    if (!isPanningOrZooming.value && !isZoomAnimating.value) {
      emit("trackMouseMove", event);
    }
  }

  function onTrackMouseOut(event) {
    if (props.selectedTrackDetail) return;
    emit("trackMouseOut", event);
  }

  // -----------------------------------------------------------------------
  // 2. GeoJSON event handlers
  // -----------------------------------------------------------------------
  function onEachFeature(feature, layer) {
    layer.on({
      click: (event) => onGeoJsonClick(event),
      mouseover: (event) => onGeoJsonMouseOver(event),
      mousemove: (event) => onTrackMouseMove(event),
      mouseout: (event) => onGeoJsonMouseOut(event),
    });
  }

  function onGeoJsonClick(event) {
    // In GeoJSON layer events, the feature is accessed via event.target.feature
    const layer = event.target;
    const feature = layer?.feature;

    if (!feature?.properties?.id) {
      return;
    }

    const poly = props.polylines.find(
      (p) => p.properties?.id === feature.properties.id
    );
    if (poly) {
      emit("trackClick", poly, event);
    }
  }

  function onGeoJsonMouseOver(event) {
    // Skip hover events during zoom animations or panning to reduce processing
    if (
      props.selectedTrackDetail ||
      isZoomAnimating.value ||
      isPanningOrZooming.value
    )
      return;

    const layer = event.target;
    const feature = layer?.feature;

    if (!feature?.properties?.id) {
      return;
    }

    // Bring the layer to front
    if (layer && typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }

    const poly = props.polylines.find(
      (p) => p.properties?.id === feature.properties.id
    );
    if (poly) {
      emit("trackMouseOver", poly, event);
    }
  }

  function onGeoJsonMouseOut(event) {
    if (props.selectedTrackDetail) return;
    emit("trackMouseOut", event);
  }

  // -----------------------------------------------------------------------
  // 3. Move / zoom handlers
  // -----------------------------------------------------------------------
  function onMoveStart(e) {
    // Set panning state to optimize certain operations during pan
    isPanningOrZooming.value = true;
    // Remove hover polylines during move to prevent visual glitches
    const map = e.target;
    removeMarkerPolyline(map);
    clearSegmentHighlight(map);
  }

  function onMoveEnd(e) {
    const map = e.target;
    const center_val = map.getCenter();
    const mapBoundsLocal = map.getBounds();

    // Clear panning state immediately
    isPanningOrZooming.value = false;

    // Update stable bounds with debouncing to reduce reactive updates
    updateStableBounds(mapBoundsLocal);

    // Only emit center update if it's meaningfully different to prevent oscillation
    const newCenter = [center_val.lat, center_val.lng];
    if (
      !props.center ||
      Math.abs(newCenter[0] - props.center[0]) > 0.0001 ||
      Math.abs(newCenter[1] - props.center[1]) > 0.0001
    ) {
      emit("update:center", newCenter);
    }

    emit("update:bounds", mapBoundsLocal);
    updateInitialMapState(e);

    // If we have a marker persisted, re-draw the segment highlight after pan ends
    if (props.markerLatLng) {
      // Delay slightly to let map repaint
      setTimeout(() => {
        highlightSegmentForMarker(props.markerLatLng);
      }, 150);
    }
  }

  function onZoomStart(e) {
    // Set zoom animating state and clean up hover polylines immediately
    isZoomAnimating.value = true;
    const map = e.target;
    removeMarkerPolyline(map);
  }

  function onZoomEnd(e) {
    const map = e.target;
    const currentZoom = map.getZoom();

    // Update stable bounds with debouncing to reduce reactive updates
    updateStableBounds(map.getBounds());

    // Debounced update of clustering and animation states
    clearMapUpdateTimeout();
    mapUpdateTimeout = setTimeout(() => {
      try {
        clustering.updateZoomLevel(currentZoom);

        // Only emit zoom update if it's meaningfully different to prevent oscillation
        if (Math.abs(currentZoom - props.zoom) > 0.1) {
          emit("update:zoom", currentZoom);
        }

        // Clear zoom animating state after debounced update
        isZoomAnimating.value = false;
      } catch (error) {
        console.error("[useMapEvents] Error updating clustering zoom level:", error);
        // Ensure states are cleared even on error
        isZoomAnimating.value = false;
      }
    }, 100); // Slightly increased debounce time to prevent rapid-fire updates

    emit("update:zoom", map.getZoom());
    updateInitialMapState(e);
  }

  // -----------------------------------------------------------------------
  // 4. Track selection / deselection
  // -----------------------------------------------------------------------
  async function handleTrackSelected(newDetail) {
    try {
      // If bounds prop is provided, let the bounds watch handle positioning
      // This prevents double-positioning and conflicts
      if (
        props.bounds &&
        Array.isArray(props.bounds) &&
        props.bounds.length === 2
      ) {
        console.log(
          "[useMapEvents] Bounds provided, skipping handleTrackSelected flyToBounds"
        );
        // Just save pre-selection state for returning later
        const map = getMapObject("handleTrackSelected-saveState");
        if (map) {
          mapState.value.preSelection.zoom = map.getZoom();
          mapState.value.preSelection.center = [
            map.getCenter().lat,
            map.getCenter().lng,
          ];
          saveMapStateToStorage(
            mapState.value.preSelection.zoom,
            mapState.value.preSelection.center
          );
        }
        return;
      }

      const selectedPolyline = props.polylines.find(
        (poly) => poly.properties && poly.properties.id === newDetail.id
      );
      if (
        !selectedPolyline ||
        !selectedPolyline.latlngs ||
        !selectedPolyline.latlngs.length
      )
        return;

      const map = getMapObject("handleTrackSelected");
      if (map) {
        // Clean up any hover polylines before flying to track
        removeMarkerPolyline(map);

        // Save current state before flying to track
        mapState.value.preSelection.zoom = map.getZoom();
        mapState.value.preSelection.center = [
          map.getCenter().lat,
          map.getCenter().lng,
        ];
        saveMapStateToStorage(
          mapState.value.preSelection.zoom,
          mapState.value.preSelection.center
        );

        map.flyToBounds(selectedPolyline.latlngs, {
          ...getDetailPanelFitBoundsOptions(),
          duration: 1.5,
          easeLinearity: 0.25,
        });
      } else {
        // Fallback when map object is not available
        if (
          mapState.value.lastKnownGood.zoom !== undefined &&
          mapState.value.lastKnownGood.center
        ) {
          mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
          mapState.value.preSelection.center = [
            ...mapState.value.lastKnownGood.center,
          ];
          saveMapStateToStorage(
            mapState.value.preSelection.zoom,
            mapState.value.preSelection.center
          );
        }

        mapBounds.value = null;
        await nextTick();
        mapBounds.value = latLngBounds(selectedPolyline.latlngs);
      }
    } catch (error) {
      console.error("[useMapEvents] Error in handleTrackSelected:", error, {
        newDetail,
      });
    }
  }

  async function handleTrackDeselected() {
    try {
      setTrackZoomAnimating(true);
      const map = getMapObject("handleTrackDeselected");

      // Clean up any hover polylines before flying back
      removeMarkerPolyline(map);

      mapBounds.value = null;

      let center = mapState.value.preSelection.center;
      let zoom = mapState.value.preSelection.zoom;

      // Try to load from localStorage if not available in memory
      if (!center || zoom === undefined) {
        const storedState = loadMapStateFromStorage();
        if (storedState) {
          zoom = storedState.zoom;
          center = storedState.center;
        }
      }

      // Final fallback to last known good state
      if (!center || zoom === undefined) {
        center = mapState.value.lastKnownGood.center;
        zoom = mapState.value.lastKnownGood.zoom;
      }

      if (map && center && zoom !== undefined && !isUnmounting.value) {
        // Clean up hover polylines before starting flyTo
        removeMarkerPolyline(map);

        setTimeout(() => {
          // Double-check if component is still mounted
          if (isUnmounting.value) return;

          try {
            map.flyTo(center, zoom, {
              duration: 1.5,
              easeLinearity: 0.25,
            });
            // Update state after successful fly
            mapState.value.lastKnownGood.center = Array.isArray(center)
              ? [...center]
              : [center.lat, center.lng];
            mapState.value.lastKnownGood.zoom = zoom;
          } catch (flyError) {
            console.warn("[useMapEvents] flyTo failed, trying setView:", flyError);
            try {
              if (!isUnmounting.value) {
                map.setView(center, zoom, { animate: false }); // Disable animation on fallback
              }
            } catch (setViewError) {
              console.error("[useMapEvents] setView also failed:", setViewError);
            }
          }
        }, 50);
      }
    } catch (error) {
      console.error("[useMapEvents] Error in handleTrackDeselected:", error);
      // Recovery attempt
      try {
        const map = getMapObject("handleTrackDeselected-recovery");
        if (map && !isUnmounting.value) {
          const center =
            mapState.value.preSelection.center ||
            mapState.value.lastKnownGood.center;
          const zoom =
            mapState.value.preSelection.zoom || mapState.value.lastKnownGood.zoom;
          if (center && zoom !== undefined) {
            map.setView(center, zoom, { animate: false }); // Disable animation in recovery
          }
        }
      } catch (recoveryError) {
        console.error(
          "[useMapEvents] Failed to recover from deselection error:",
          recoveryError
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 5. Geolocation
  // -----------------------------------------------------------------------
  function onLocationFound(location) {
    if (location.error) {
      console.warn("[useMapEvents] Geolocation error:", location.error);
      return;
    }

    const map = getMapObject("onLocationFound");
    if (!map) {
      console.warn("[useMapEvents] Map not available for geolocation");
      return;
    }

    try {
      // Center the map on the user's location
      // Check if component is still mounted before flying
      if (isUnmounting.value) return;

      map.flyTo([location.latitude, location.longitude], 15, {
        duration: 1.5,
        easeLinearity: 0.25,
      });

      // If we have a highlighted segment or gap lines, keep them in sync (no-op here)
      // This is a placeholder for more advanced sync logic if needed later
      if (hoveredSegmentPolyline.value) {
        // No action required now
      }
    } catch (error) {
      console.error("[useMapEvents] Error centering map on user location:", error);
    }
  }

  // -----------------------------------------------------------------------
  // 6. Cluster event handlers
  // -----------------------------------------------------------------------
  function onClusterClick(e) {
    const cluster = e.layer || e.target;

    if (cluster.getAllChildMarkers) {
      // This is a cluster, zoom in to show individual tracks
      const map = getMapObject("onClusterClick");
      if (map && cluster.getBounds) {
        // Clean up hover polylines before fitting bounds
        removeMarkerPolyline(map);
        const bounds = cluster.getBounds();
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }

  function onClusterMarkerClick(e) {
    const marker = e.layer || e.target;

    // Check if this is an individual marker (not a cluster)
    if (marker.trackData && !marker.getAllChildMarkers) {
      // Emit track click event with track data
      emit("trackClick", marker.trackData, e);
    }
  }

  function updateClustering() {
    if (!clustering.clusterGroup.value || displayMode.value === "detail") {
      return;
    }

    // Clear any pending clustering updates to debounce
    clearClusteringUpdateTimeout();

    clusteringUpdateTimeout = setTimeout(() => {
      try {
        if (displayMode.value === "cluster") {
          // Add filtered tracks to cluster
          clustering.addTracksToCluster(
            filteredTracks.value,
            clustering.clusterGroup.value,
            null,
            "center" // Use center point strategy
          );
        } else {
          // Clear clusters when showing individual tracks
          if (
            clustering.clusterGroup.value.getLayers &&
            clustering.clusterGroup.value.getLayers().length > 0
          ) {
            clustering.clusterGroup.value.clearLayers();
          }
        }
      } catch (error) {
        console.error("[useMapEvents] Error updating clustering:", error);
      }
      clusteringUpdateTimeout = null;
    }, 150); // Debounce clustering updates by 150ms
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  return {
    onTrackClick,
    onTrackMouseOver,
    onTrackMouseMove,
    onTrackMouseOut,
    onEachFeature,
    onGeoJsonClick,
    onGeoJsonMouseOver,
    onGeoJsonMouseOut,
    onMoveStart,
    onMoveEnd,
    onZoomStart,
    onZoomEnd,
    handleTrackSelected,
    handleTrackDeselected,
    onLocationFound,
    onClusterClick,
    onClusterMarkerClick,
    updateClustering,
  };
}
