<template>
  <l-map
    :key="mapKey"
    ref="leafletMap"
    class="fullscreen-map"
    :zoom="effectiveZoom"
    :center="effectiveCenter"
    :options="{ zoomControl: false, preferCanvas: true }"
    @ready="onMapReady"
    @movestart="onMoveStart"
    @moveend="onMoveEnd"
    @zoomstart="onZoomStart"
    @zoomend="onZoomEnd"
  >
    <l-tile-layer :url="url" :attribution="attribution" />
    <template
      v-if="mapIsReady && shouldRenderGeoJson && displayMode === 'tracks'"
    >
      <l-geo-json
        :key="layerKey"
        :geojson="geojsonData"
        :options="{ onEachFeature: onEachFeature, filter: geoJsonFilter }"
        :options-style="geoJsonStyle"
      />
    </template>
    <template
      v-if="mapIsReady && shouldRenderGeoJson && displayMode === 'detail'"
    >
      <l-geo-json
        :key="`detail-${layerKey}`"
        :geojson="geojsonData"
        :options="{ onEachFeature: onEachFeature, filter: geoJsonFilter }"
        :options-style="geoJsonStyle"
      />
    </template>
    <TrackFilterControl
      v-if="!props.selectedTrackDetail"
      class="map-filter-control"
      :categories="allCategories"
      :min-length="minTrackLength"
      :max-length="maxTrackLength"
      :min-elevation-gain="minElevationGain"
      :max-elevation-gain="maxElevationGain"
      :min-slope="minSlope"
      :max-slope="maxSlope"
      :global-categories="globalCategories"
      :global-min-length="globalMinTrackLength"
      :global-max-length="globalMaxTrackLength"
      :global-min-elevation-gain="globalMinElevationGain"
      :global-max-elevation-gain="globalMaxElevationGain"
      :global-min-slope="globalMinSlope"
      :global-max-slope="globalMaxSlope"
      :has-elevation-data="hasElevationData"
      :has-slope-data="hasSlopeData"
      :has-tracks-in-viewport="
        !!(props.polylines && props.polylines.length > 0)
      "
      @update:filter="onFilterChange"
    />

    <!-- Chart hover/fixed marker -->
    <LCircleMarker
      v-if="markerLatLng && markerLatLng.latlng && !isPanningOrZooming"
      :lat-lng="markerLatLng.latlng"
      :radius="markerLatLng.isFixed ? 8 : 7"
      :fill-color="
        markerLatLng.isFixed ? getMarkerFillColor(markerLatLng) : 'white'
      "
      :color="getMarkerStrokeColor(markerLatLng)"
      :fill-opacity="markerLatLng.isFixed ? 0.3 : 1"
      :weight="markerLatLng.isFixed ? 3 : 2.5"
      :pane="'markerPane'"
      class="chart-hover-marker"
      :class="{ 'chart-fixed-marker': markerLatLng.isFixed }"
    >
      <LTooltip
        v-if="markerLatLng.isFixed"
        permanent
        sticky
        :direction="'center'"
      >
        <div class="marker-tooltip">
          <div class="fixed-icon" aria-hidden="true">📍</div>
          <div v-if="typeof markerLatLng.distanceKm === 'number'">
            {{ markerLatLng.distanceKm.toFixed(2) }} km
          </div>
          <div v-if="typeof markerLatLng.elevation === 'number'">
            {{ markerLatLng.elevation.toFixed(0) }} m
          </div>
          <div v-if="typeof markerLatLng.slope === 'number'">
            ↗ {{ markerLatLng.slope.toFixed(1) }}%
          </div>
          <div v-if="markerLatLng.pace !== undefined">
            {{ formatPace(markerLatLng.pace) }}
          </div>
          <div v-if="markerLatLng.time !== undefined">
            {{ formatTime(markerLatLng.time) }}
          </div>
          <div class="fixed-hint">(click/ESC to unpin)</div>
        </div>
      </LTooltip>

      <LTooltip v-else :permanent="false" :sticky="false">
        <div class="marker-tooltip">
          <div v-if="markerLatLng.distanceKm !== undefined">
            {{
              typeof markerLatLng.distanceKm === "number"
                ? markerLatLng.distanceKm.toFixed(2) + " km"
                : markerLatLng.distanceKm
                ? String(markerLatLng.distanceKm) + " km"
                : ""
            }}
          </div>
          <div>
            {{
              typeof markerLatLng.elevation === "number"
                ? markerLatLng.elevation.toFixed(0) + " m"
                : ""
            }}
          </div>
          <div>
            {{
              typeof markerLatLng.slope === "number"
                ? "↗ " + markerLatLng.slope.toFixed(1) + "%"
                : ""
            }}
          </div>
          <div v-if="markerLatLng.pace !== undefined">
            {{ formatPace(markerLatLng.pace) }}
          </div>
          <div v-if="markerLatLng.time !== undefined">
            {{ formatTime(markerLatLng.time) }}
          </div>
        </div>
      </LTooltip>
    </LCircleMarker>

    <slot />
  </l-map>
</template>

<script setup>
import {
  LMap,
  LTileLayer,
  LPolyline,
  LGeoJson,
  LCircleMarker,
  LTooltip,
} from "@vue-leaflet/vue-leaflet";
import {
  ref,
  shallowRef,
  onMounted,
  onUnmounted,
  computed,
  watch,
  nextTick,
  getCurrentInstance,
  provide,
} from "vue";
import { latLngBounds } from "leaflet";
import "leaflet.heat";
import {
  getDetailPanelFitBoundsOptions,
  POLYLINE_WEIGHT_ACTIVE,
  POLYLINE_WEIGHT_SELECTED_DETAIL,
  POLYLINE_WEIGHT_DEFAULT,
  POLYLINE_OPACITY_ACTIVE,
  POLYLINE_OPACITY_HOVER_DIM,
  POLYLINE_OPACITY_SELECTED_DETAIL,
  POLYLINE_OPACITY_DEFAULT,
} from "../utils/mapConstants.js";
import TrackFilterControl from "./TrackFilterControl.vue";
import { useTrackClustering } from "../composables/useTrackClustering.js";
import { useTrackMapE2E } from "../composables/useTrackMapE2E.js";
import {
  useAdvancedDebounce,
  useThrottle,
} from "../composables/useAdvancedDebounce.js";
import { formatPace, formatTime } from "../utils/format.js";
// Import clustering styles
import "../styles/track-clustering.css";

// Map adapters
import { createLeafletAdapter } from "../map/LeafletAdapter.js";
import { createClusterAdapter } from "../map/ClusterAdapter.js";
import { createE2EAdapter } from "../map/E2EAdapter.js";

// Composables
import { useTrackFilters } from "../composables/useTrackFilters.js";
import { useSegmentHighlight } from "../composables/useSegmentHighlight.js";
import { useMapState } from "../composables/useMapState.js";
import { useMapEvents } from "../composables/useMapEvents.js";

// Constants
const ANIMATION_DURATION_MS = 1100;
const HIGHLIGHT_PANE_Z_INDEX = 750;
const FAKE_BOUNDS = [
  [0, 0],
  [0, 0],
];

// Adapter instances — encapsulate Leaflet, clustering, and E2E concerns
const leafletAdapter = createLeafletAdapter();
const e2eAdapter = createE2EAdapter({
  production: import.meta.env.MODE === "production",
});

const props = defineProps({
  polylines: Array,
  zoom: Number,
  center: Array,
  bounds: Array,
  url: String,
  attribution: String,
  activeTrackId: [String, Number, null],
  selectedTrackDetail: Object,
  heatmapPoints: {
    type: Array,
    default: () => [],
  },
  showHeatmap: {
    type: Boolean,
    default: false,
  },
  markerLatLng: {
    type: Object,
    default: null,
  },
  autoPanOnChartHover: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "mapReady",
  "trackClick",
  "trackMouseOver",
  "trackMouseMove",
  "trackMouseOut",
  "update:center",
  "update:zoom",
  "update:bounds",
  "open-search",
  "filter-changed",
]);

// State management for map and animations
const leafletMap = ref(null);
const leafletInstance = shallowRef(null); // resolved L.Map from @ready

// Provide the resolved L.Map (not the Vue Leaflet wrapper ref) to children
provide("leafletMap", leafletInstance);

const mapBounds = ref(null);
const mapKey = ref(0);
const layerKey = ref(0); // For forcing GeoJSON layer re-renders when filter changes
const mapIsReady = ref(false);
const trackZoomAnimating = ref(false);
const isTransitioning = ref(false); // Prevents filter changes during detail view transitions
const heatLayer = ref(null);
const heatmapMaxWeight = ref(0);
const HEATMAP_PANE = "heatmapPane";


const clustering = useTrackClustering();

// Clustering configuration
const clusteringConfig = computed(() => ({
  // Show individual tracks when zoomed in beyond this level
  disableClusteringAtZoom: 14,
  // Maximum cluster radius in pixels
  maxClusterRadius: 36,
  // Show coverage area when hovering over cluster
  showCoverageOnHover: true,
  // Zoom to show all items in cluster when clicking
  zoomToBoundsOnClick: true,
  // Animate cluster creation/destruction
  animate: true,
  // Animation duration
  animateAddingMarkers: true,
}));

// Cluster adapter — wraps MarkerClusterGroup lifecycle
const clusterAdapter = createClusterAdapter(clusteringConfig.value);


// Centralized map state management (delegated to composable)
const { mapState, effectiveZoom, effectiveCenter, saveMapStateToStorage, loadMapStateFromStorage, updateInitialMapState } = useMapState(props);

// Animation management with proper cleanup and debouncing
let animationTimeout = null;
let clusteringUpdateTimeout = null;
let mapUpdateTimeout = null;
let filterUpdateTimeout = null;
const isZoomAnimating = ref(false);
const isUnmounting = ref(false);
const isPanningOrZooming = ref(false);


function clearAnimationTimeout() {
  if (animationTimeout) {
    clearTimeout(animationTimeout);
    animationTimeout = null;
  }
}

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

function clearFilterUpdateTimeout() {
  if (filterUpdateTimeout) {
    clearTimeout(filterUpdateTimeout);
    filterUpdateTimeout = null;
  }
}

function setTrackZoomAnimating(isAnimating) {
  clearAnimationTimeout();
  trackZoomAnimating.value = isAnimating;

  if (isAnimating) {
    animationTimeout = setTimeout(() => {
      trackZoomAnimating.value = false;
      animationTimeout = null;
    }, ANIMATION_DURATION_MS);
  }
}

// Track current viewport bounds for filtering (only update after interaction ends)
const stableBounds = ref(null);
let boundsUpdateTimeout = null;

// Function to safely clear the bounds timeout
function clearBoundsTimeout() {
  if (boundsUpdateTimeout) {
    clearTimeout(boundsUpdateTimeout);
    boundsUpdateTimeout = null;
  }
}

// Debounced function to update stable bounds
function updateStableBounds(newBounds) {
  clearBoundsTimeout();

  boundsUpdateTimeout = setTimeout(() => {
    stableBounds.value = newBounds;
    boundsUpdateTimeout = null;
  }, 200); // Reduced from 500ms for faster responsiveness
}


// Debounced clustering update function
// Uses a forward reference to updateClustering from useMapEvents
let _updateClusteringRef = null;

function debouncedUpdateClustering() {
  clearClusteringUpdateTimeout();

  clusteringUpdateTimeout = setTimeout(() => {
    try {
      if (_updateClusteringRef) _updateClusteringRef();
    } catch (error) {
      console.error("[TrackMap] Error in debounced clustering update:", error);
    }
  }, 100);
}

// Debounced filter update function with reduced re-rendering
function debouncedFilterUpdate() {
  clearFilterUpdateTimeout();

  filterUpdateTimeout = setTimeout(() => {
    try {
      // Only force layer key update if we actually need to re-render the layers
      // This prevents unnecessary re-renders that cause flicker
      if (
        !isTransitioning.value &&
        mapIsReady.value &&
        !isPanningOrZooming.value
      ) {
        layerKey.value += 1;
      }
    } catch (error) {
      console.error("[TrackMap] Error in debounced filter update:", error);
    }
  }, 200); // Increased debounce to reduce frequency further
}

/**
 * Gets the current map object, ensuring it's valid
 * @returns {Object|null} The Leaflet map object or null if not available
 */
function getMapObject(context = "") {
  try {
    if (leafletMap.value && leafletMap.value.mapObject) {
      return leafletMap.value.mapObject;
    }
    // Try to access it through alternative means if available
    const mapInstance =
      leafletMap.value?.leafletObject || leafletMap.value?.mapObject;
    if (mapInstance && typeof mapInstance.getZoom === "function") {
      return mapInstance;
    }
    // Don't log warnings during cleanup or unmounting
    if (context !== "cleanup" && !isUnmounting.value) {
      console.warn(
        `[TrackMap] Map object not available${context ? " in " + context : ""}`
      );
    }
    return null;
  } catch (error) {
    // Don't log errors during cleanup or unmounting
    if (context !== "cleanup" && !isUnmounting.value) {
      console.error(
        `[TrackMap] Error accessing map object${
          context ? " in " + context : ""
        }:`,
        error
      );
    }
    return null;
  }
}


// Determine display mode based on zoom level and settings
// Must be defined before useMapEvents composable call (displayMode is a dependency)
const displayMode = computed(() => {
  if (props.selectedTrackDetail) {
    return "detail"; // Show only selected track
  }

  if (clustering.shouldCluster.value) {
    return "cluster"; // Show clusters
  }

  return "tracks"; // Show individual tracks
});

// ── Track filters composable ──────────────────────────────────────────────
const {
  sessionCategories, sessionTrackLengths, sessionElevationGains, sessionSlopeValues,
  allCategories, minTrackLength, maxTrackLength, minElevationGain, maxElevationGain,
  minSlope, maxSlope, globalMinTrackLength, globalMaxTrackLength,
  globalMinElevationGain, globalMaxElevationGain, globalMinSlope, globalMaxSlope,
  globalCategories, hasElevationData, hasSlopeData,
  filterState, geoJsonFilter, filteredTracks,
  onFilterChange, batchedFilterUpdate,
} = useTrackFilters(props, emit, { isTransitioning, debouncedFilterUpdate });

// ── Segment highlight composable ──────────────────────────────────────────
const {
  hoveredMarkerPolyline, hoveredMarker, hoveredSegmentPolyline, markerGapLine,
  highlightedLayer, highlightedLayerOrigStyle, lastAutoPanTarget,
  getPolylineWeight, getPolylineOpacity, getFeatureWeight, getFeatureOpacity, geoJsonStyle,
  getMarkerStrokeColor, getMarkerFillColor,
  performAutoPan, showMarkerPolyline, clearSegmentHighlight,
  highlightSegmentForMarker, findNearestPointOnCoords, removeMarkerPolyline,
} = useSegmentHighlight(leafletAdapter, { isZoomAnimating, isUnmounting, isPanningOrZooming, getMapObject, getSelectedTrackDetail: () => props.selectedTrackDetail, getPolylines: () => props.polylines, getActiveTrackId: () => props.activeTrackId });

// ── E2E testing hooks (must be declared after highlightSegmentForMarker) ──
const e2eHooks = useTrackMapE2E({
  isPanningOrZooming,
  mapIsReady,
  trackZoomAnimating,
  props,
  highlightSegmentForMarker,
});

// ── Map events composable ─────────────────────────────────────────────────
const {
  onTrackClick, onTrackMouseOver, onTrackMouseMove, onTrackMouseOut,
  onEachFeature, onGeoJsonClick, onGeoJsonMouseOver, onGeoJsonMouseOut,
  onMoveStart, onMoveEnd, onZoomStart, onZoomEnd,
  handleTrackSelected, handleTrackDeselected,
  onLocationFound, onClusterClick, onClusterMarkerClick, updateClustering,
} = useMapEvents({ props, emit, leafletAdapter, clusterAdapter, mapState, mapIsReady, isPanningOrZooming, isZoomAnimating, trackZoomAnimating, isTransitioning, stableBounds, highlightSegmentForMarker, removeMarkerPolyline, showMarkerPolyline, clearSegmentHighlight, performAutoPan, setTrackZoomAnimating, updateStableBounds, debouncedUpdateClustering, clustering, layerKey, getMapObject, displayMode, hoveredSegmentPolyline, isUnmounting, filteredTracks, mapBounds });

// Wire forward reference for debounced clustering updates
_updateClusteringRef = updateClustering;


function ensureHeatmapPane() {
  if (!leafletAdapter.getPane(HEATMAP_PANE)) {
    const pane = leafletAdapter.createPane(HEATMAP_PANE);
    if (pane) {
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
  }
}

function buildHeatmapLatLngs() {
  if (!Array.isArray(props.heatmapPoints)) return [];
  return props.heatmapPoints
    .map((point) => {
      if (!point) return null;
      const lat = typeof point.lat === "number" ? point.lat : null;
      const lon = typeof point.lon === "number" ? point.lon : null;
      if (lat === null || lon === null) return null;
      const weight =
        typeof point.weight === "number" && !Number.isNaN(point.weight)
          ? Math.max(0, point.weight)
          : 0;
      return [lat, lon, weight];
    })
    .filter((point) => point !== null);
}

function removeHeatmapLayer() {
  if (heatLayer.value) {
    leafletAdapter.removeLayer(heatLayer.value);
  }
  heatLayer.value = null;
  heatmapMaxWeight.value = 0;
}

function updateHeatmapLayer() {
  if (!mapIsReady.value || isUnmounting.value) return;
  const map = getMapObject("heatmap");
  if (!map) return;

  if (!props.showHeatmap) {
    removeHeatmapLayer();
    return;
  }

  const latlngs = buildHeatmapLatLngs();
  if (latlngs.length === 0) {
    removeHeatmapLayer();
    return;
  }

  ensureHeatmapPane();
  const maxWeight = Math.max(...latlngs.map((point) => point[2] || 0), 1);
  const shouldRecreate =
    !heatLayer.value || heatmapMaxWeight.value !== maxWeight;
  if (shouldRecreate && heatLayer.value) {
    leafletAdapter.removeLayer(heatLayer.value);
    heatLayer.value = null;
  }

  if (!heatLayer.value) {
    heatLayer.value = leafletAdapter.createHeatLayer(latlngs, {
      radius: 18,
      blur: 22,
      minOpacity: 0.25,
      maxZoom: 17,
      max: maxWeight,
      pane: HEATMAP_PANE,
    });
    if (heatLayer.value) {
      leafletAdapter.addLayer(heatLayer.value);
    }
    heatmapMaxWeight.value = maxWeight;
  } else {
    heatLayer.value.setLatLngs(latlngs);
  }
}

// Convert polylines to GeoJSON format (no filtering here - use native Leaflet filter)
const geojsonData = computed(() => {
  if (!props.polylines || !props.polylines.length) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  const features = props.polylines.map((poly) => {
    return {
      type: "Feature",
      properties: {
        ...poly.properties,
        color: poly.color, // Use original color
        id: poly.properties?.id ?? poly.keyFallback,
      },
      geometry: {
        type: "LineString",
        coordinates: poly.latlngs.map((point) => [point[1], point[0]]), // [lng, lat] for GeoJSON
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
});

function initializeClustering(map) {
  try {
    // Initialize cluster group via adapter
    const clusterGroup = clusterAdapter.initialize(clusteringConfig.value);

    // Wire up cluster events through the adapter
    clusterAdapter.on("clusterclick", (e) => {
      try { onClusterClick(e); }
      catch (error) { console.error("[TrackMap] Error in cluster click handler:", error); }
    });
    clusterAdapter.on("click", (e) => {
      try { onClusterMarkerClick(e); }
      catch (error) { console.error("[TrackMap] Error in marker click handler:", error); }
    });
    clusterAdapter.on("mouseover", (e) => {
      const marker = e.layer || e.target;
      if (marker.trackData && !marker.getAllChildMarkers && !isZoomAnimating.value) {
        showMarkerPolyline(marker.trackData, map, marker);
        emit("trackMouseOver", marker.trackData, e.originalEvent || e);
      }
    });
    clusterAdapter.on("mouseout", (e) => {
      const marker = e.layer || e.target;
      if (marker.trackData && !marker.getAllChildMarkers) {
        removeMarkerPolyline(map);
        emit("trackMouseOut", e.originalEvent || e);
      }
    });

    // Add cluster group to map via adapter
    clusterAdapter.addTo(map);

    // Set initial zoom level for clustering
    clustering.updateZoomLevel(map.getZoom());

    // Perform initial clustering update with delay to ensure map is ready
    setTimeout(() => { updateClustering(); }, 100);
  } catch (error) {
    console.error("[TrackMap] Error initializing clustering:", error);
  }
}

async function onMapReady(e) {
  try {
    const map = e; // Leaflet map instance
    if (!map || typeof map.getZoom !== "function") {
      console.error(
        "[TrackMap] Error in onMapReady: Invalid map instance received.",
        { eventPayload: e }
      );
      mapIsReady.value = true;
      emit("mapReady", e);
      return;
    }

    // Store the resolved L.Map for child components (PoiClusterGroup, etc.)
    leafletInstance.value = map;

    // Bind the Leaflet adapter to the live map
    leafletAdapter.setMap(map);

    // Handle pending restoration
    if (mapState.value.pendingRestoreCenterZoom && !props.selectedTrackDetail) {
      const preSelection = mapState.value.preSelection;
      const lastKnownGood = mapState.value.lastKnownGood;

      if (preSelection.center && preSelection.zoom !== undefined) {
        emit(
          "update:center",
          Array.isArray(preSelection.center)
            ? preSelection.center
            : [preSelection.center.lat, preSelection.center.lng]
        );
        await nextTick();
        emit("update:zoom", preSelection.zoom);
      } else if (lastKnownGood.center && lastKnownGood.zoom !== undefined) {
        emit(
          "update:center",
          Array.isArray(lastKnownGood.center)
            ? lastKnownGood.center
            : [lastKnownGood.center.lat, lastKnownGood.center.lng]
        );
        await nextTick();
        emit("update:zoom", lastKnownGood.zoom);
      }
      mapState.value.pendingRestoreCenterZoom = false;
    }

    // Update current state
    mapState.value.lastKnownGood.zoom = map.getZoom();
    mapState.value.lastKnownGood.center = [
      map.getCenter().lat,
      map.getCenter().lng,
    ];

    // Move attribution control to bottom-left to avoid collision with panel toggle
    leafletAdapter.repositionAttribution("bottomleft");

    // Also update preSelection values if no track is selected
    if (!props.selectedTrackDetail) {
      mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
      mapState.value.preSelection.center = [
        ...mapState.value.lastKnownGood.center,
      ];
    }

    mapState.value.userChangedZoomOrCenter = false;
    mapIsReady.value = true;

    updateHeatmapLayer();

    // Initialize stable bounds for track visibility calculation
    stableBounds.value = map.getBounds();

    // Initialize clustering
    initializeClustering(map);

    emit("mapReady", map);

    // Initialize E2E hooks for testing
    e2eHooks.initE2E(map);

    // Expose map instance via E2E adapter for cross-tool access
    e2eAdapter.expose({
      _lastMapInstance: map,
      lastGapLineExists: false,
      lastHighlightedColor: null,
    });

    // Apply bounds if they were set before map was ready
    if (
      props.bounds &&
      Array.isArray(props.bounds) &&
      props.bounds.length === 2
    ) {
      try {
        const options = props.selectedTrackDetail
          ? getDetailPanelFitBoundsOptions()
          : { padding: [20, 20] };
        console.log(
          "[TrackMap] onMapReady - fitting bounds with options:",
          options,
          "bounds:",
          props.bounds
        );
        map.fitBounds(props.bounds, options);
      } catch (error) {
        console.error("[TrackMap] Error applying initial bounds:", error);
      }
    } else {
      console.log("[TrackMap] onMapReady - no bounds to fit", {
        bounds: props.bounds,
        selectedTrackDetail: !!props.selectedTrackDetail,
      });
    }

    // Enhance fitBounds for selected track detail
    const origFitBounds = map.fitBounds.bind(map);
    map.fitBounds = function (boundsArg, options = {}) {
      if (
        props.selectedTrackDetail &&
        !options.paddingBottomRight &&
        !options.paddingTopLeft
      ) {
        options = { ...options, ...getDetailPanelFitBoundsOptions() };
      }
      return origFitBounds(boundsArg, options);
    };
  } catch (error) {
    console.error("[TrackMap] Error in onMapReady logic:", error, {
      eventPayload: e,
    });
    if (!mapIsReady.value) mapIsReady.value = true;
    emit("mapReady", e);
  }
}

watch(
  () => props.selectedTrackDetail,
  async (newDetail, oldDetail) => {
    if (newDetail && newDetail.id) {
      // Only handle track selection if it's a different track ID
      // This prevents map zoom changes during data updates for the same track
      if (!oldDetail || oldDetail.id !== newDetail.id) {
        await handleTrackSelected(newDetail);
      }
    } else if (!newDetail && oldDetail) {
      // Set transitioning state to prevent L-geo-json rendering during cleanup
      isTransitioning.value = true;

      try {
        // Handle track deselection logic
        await handleTrackDeselected();

        // Ensure all reactive updates complete before the next render cycle
        await nextTick();
        await nextTick();

        // Only force re-render if we actually need to show different data
        // This prevents unnecessary layer key updates that cause flicker
        if (
          geojsonData.value &&
          geojsonData.value.features &&
          geojsonData.value.features.length > 0
        ) {
          layerKey.value++;
        }

        // Allow one more tick for the new component to initialize
        await nextTick();
      } finally {
        // Clear transitioning state to allow L-geo-json to render again
        isTransitioning.value = false;
      }
    }
  }
);

// Control when L-geo-json component should be rendered to prevent race conditions
const shouldRenderGeoJson = computed(() => {
  if (isUnmounting.value || !mapIsReady.value) return false;

  // Don't render during transitions to prevent unmount/remount race conditions
  if (isTransitioning.value) return false;

  // ALWAYS keep tracks visible - don't hide during zoom/pan operations
  // This prevents the flicker/migration issue
  return !!(
    geojsonData.value &&
    geojsonData.value.features &&
    geojsonData.value.features.length > 0 &&
    (displayMode.value === "tracks" || displayMode.value === "detail")
  );
});

// Watch for changes in filtered tracks to update clustering (debounced)
let tracksWatchTimeout = null;
watch(
  () => filteredTracks.value,
  () => {
    if (clustering.clusterGroup.value && displayMode.value === "cluster") {
      clearTimeout(tracksWatchTimeout);
      tracksWatchTimeout = setTimeout(() => {
        if (!isUnmounting.value && !isPanningOrZooming.value) {
          updateClustering();
        }
      }, 300); // Increased debounce for better performance
    }
  },
  { deep: true }
);

// Watch for display mode changes to update clustering
watch(
  () => displayMode.value,
  (newMode, oldMode) => {
    if (newMode !== oldMode) {
      // Remove polyline and restore marker if needed
      const map = getMapObject("displayModeChange");
      removeMarkerPolyline(map);
      // Hide tooltip via event
      const vm = getCurrentInstance();
      if (vm && vm.emit) {
        vm.emit("trackMouseOut", {});
      } else if (emit) {
        emit("trackMouseOut", {});
      }
      // Use debounced clustering update instead of immediate timeout
      debouncedUpdateClustering();
    }
  }
);

// Watch for clustering configuration changes (less frequent)
watch(
  () => clustering.shouldCluster.value,
  (shouldCluster) => {
    // Use debounced clustering update for better performance
    debouncedUpdateClustering();
  }
);

// Watch for zoom animation state changes to clean up hover polylines
watch(
  () => isZoomAnimating.value,
  (isAnimating) => {
    if (isAnimating) {
      const map = getMapObject("zoomAnimationWatch");
      removeMarkerPolyline(map);
    }
  }
);

// Watch for bounds prop changes to fit track to bounds
watch(
  () => props.bounds,
  (newBounds) => {
    if (newBounds && mapIsReady.value) {
      const map = getMapObject("boundsWatch");
      if (map && Array.isArray(newBounds) && newBounds.length === 2) {
        try {
          // Use fitBounds with proper options for track detail view
          const options = props.selectedTrackDetail
            ? getDetailPanelFitBoundsOptions()
            : { padding: [20, 20] };
          console.log("[TrackMap] Fitting bounds with options:", options);
          map.fitBounds(newBounds, options);
        } catch (error) {
          console.error("[TrackMap] Error fitting bounds:", error);
        }
      }
    }
  },
  { immediate: true }
);

watch(
  () => [props.showHeatmap, props.heatmapPoints],
  () => {
    updateHeatmapLayer();
  },
  { deep: true }
);

// Cleanup function for component unmounting
function cleanup() {
  clearBoundsTimeout();
  clearAnimationTimeout();
  clearClusteringUpdateTimeout();
  clearMapUpdateTimeout();
  clearFilterUpdateTimeout();

  // Clean up debounced filter functions
  if (batchedFilterUpdate && batchedFilterUpdate.cancel) {
    batchedFilterUpdate.cancel();
  }

  // Clean up hover polylines
  const map = getMapObject("cleanup");
  if (map) {
    removeMarkerPolyline(map);
  }
  removeHeatmapLayer();

  // Clear tracks watch timeout
  if (tracksWatchTimeout) {
    clearTimeout(tracksWatchTimeout);
    tracksWatchTimeout = null;
  }

  // Clean up clustering resources
  if (clustering.clusterGroup.value) {
    clustering.cleanup();
  }
  clusterAdapter.cleanup();
}

// Cleanup on unmount
onUnmounted(() => {
  // Set unmounting flag to prevent further operations
  isUnmounting.value = true;

  // Force clear zoom animation state to prevent issues
  isZoomAnimating.value = false;

  const map = getMapObject("cleanup");
  if (map) {
    // Stop any ongoing map animations
    try {
      map.stop(); // Stop all animations
    } catch (error) {
      console.warn("[TrackMap] Error stopping map animations:", error);
    }

    removeMarkerPolyline(map);
  }

  // Unbind the Leaflet adapter
  leafletAdapter.setMap(null);

  // Clear any pending zoom-related timeouts immediately
  clearAnimationTimeout();
  clearClusteringUpdateTimeout();

  cleanup();

  // Cleanup E2E hooks
  e2eHooks.cleanup();
  e2eAdapter.cleanup();
});

defineExpose({ leafletMap });

// Watch for incoming marker updates and update segment highlight
watch(
  () => props.markerLatLng,
  (newVal) => {
    try {
      const map = getMapObject("markerWatcher");
      // Do not return early if map is missing - allow highlighting in test/headless environments
      if (!newVal) {
        clearSegmentHighlight(map);
        return;
      }

      // Auto-pan only when a real map instance exists
      if (props.autoPanOnChartHover && map && newVal.latlng) {
        try {
          // Use a dedicated function to perform auto-pan (test-friendly)
          nextTick(() => {
            try {
              performAutoPan(newVal.latlng, map);
            } catch (e) {
              // ignore
            }
          });
        } catch (e) {
          // Ignore pan errors in test or headless environments
        }
      }

      // Highlight segment for this marker (works even without a live map)
      highlightSegmentForMarker(newVal);
    } catch (e) {
      console.warn("[TrackMap] Error in marker watcher:", e);
    }
  }
);

</script>

<style scoped>
.fullscreen-map {
  height: 100vh;
  width: 100vw;
  top: 0;
  left: 0;
  z-index: 0;
}
.track-zoom-animating {
  transition: weight 1.2s cubic-bezier(0.25, 1, 0.5, 1),
    opacity 1.2s cubic-bezier(0.25, 1, 0.5, 1);
}
:deep(.track-zoom-animating) path {
  transform-origin: center center;
  animation: track-zoom-out-anim 0.5s cubic-bezier(0.22, 1.1, 0.36, 1) both;
  transition: stroke-width 0.75s cubic-bezier(0.34, 1.56, 0.64, 1),
    stroke-opacity 0.75s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.75s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes track-zoom-out-anim {
  0% {
    transform: scale(1.28);
    filter: drop-shadow(0 0 16px #1976d2cc) brightness(1.28);
    stroke-width: 10;
    opacity: 0.5;
  }
  30% {
    transform: scale(1.12);
    filter: drop-shadow(0 0 10px #1976d2bb) brightness(1.14);
    stroke-width: 7.5;
    opacity: 0.8;
  }
  60% {
    transform: scale(1.02);
    filter: drop-shadow(0 0 5px #1976d2aa) brightness(1.04);
    stroke-width: 5.5;
    opacity: 0.97;
  }
  100% {
    transform: scale(1);
    filter: none;
    stroke-width: 4;
    opacity: 1;
  }
}

/* Chart hover marker styles */
:deep(.chart-hover-marker) {
  z-index: 850 !important;
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease;
}

:deep(.chart-fixed-marker) {
  animation: marker-pulse 2s ease-in-out infinite;
}

@keyframes marker-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

/* Highlighted segment style */
:deep(.chart-hover-segment) {
  stroke-width: 6 !important;
  stroke-opacity: 1 !important;
  transition: stroke-width 100ms ease, stroke-opacity 100ms ease;
  filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.08));
}

/* Gap line from marker to nearest point */
:deep(.chart-gap-line) {
  stroke-dasharray: 4 4;
  opacity: 0.6;
  transition: opacity 120ms ease;
}

:deep(.marker-tooltip) {
  font-size: 12px;
  line-height: 1.4;
  min-width: 80px;
}

:deep(.marker-tooltip .fixed-hint) {
  font-size: 10px;
  color: #666;
  margin-top: 4px;
  font-style: italic;
}
</style>  30% {
    transform: scale(1.12);
    filter: drop-shadow(0 0 10px #1976d2bb) brightness(1.14);
    stroke-width: 7.5;
    opacity: 0.8;
  }
  60% {
    transform: scale(1.02);
    filter: drop-shadow(0 0 5px #1976d2aa) brightness(1.04);
    stroke-width: 5.5;
    opacity: 0.97;
  }
  100% {
    transform: scale(1);
    filter: none;
    stroke-width: 4;
    opacity: 1;
  }
}

/* Performance optimizations for smooth map rendering */
:deep(.leaflet-container) {
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
}

:deep(.leaflet-zoom-animated) {
  will-change: transform;
}

:deep(.leaflet-interactive) {
  will-change: transform;
  backface-visibility: hidden;
}

/* Optimize GeoJSON layers for smoother interactions */
:deep(.leaflet-overlay-pane svg) {
  will-change: transform;
  transform: translateZ(0);
}

:deep(.leaflet-overlay-pane path) {
  will-change: transform, stroke-width, stroke-opacity;
  backface-visibility: hidden;
  /* Smooth transitions for better visual experience */
  transition: stroke-width 0.1s ease, stroke-opacity 0.1s ease;
}

/* Optimize zoom animations - keep paths visible during zoom */
:deep(.leaflet-zoom-anim .leaflet-overlay-pane path) {
  /* Disable expensive transitions only during zoom, keep visibility */
  transition: none !important;
  animation: none !important;
}

/* Chart hover marker styles */
:deep(.chart-hover-marker) {
  z-index: 850 !important;
  pointer-events: none;
  transition: all 0.2s ease;
}

:deep(.chart-fixed-marker) {
  animation: marker-pulse 2s ease-in-out infinite;
}

@keyframes marker-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

:deep(.marker-tooltip) {
  font-size: 12px;
  line-height: 1.4;
  min-width: 80px;
}

:deep(.marker-tooltip .fixed-hint) {
  font-size: 10px;
  color: #666;
  margin-top: 4px;
  font-style: italic;
}

/* Fixed icon inside marker */
:deep(.fixed-icon) {
  font-size: 14px;
  line-height: 1;
  text-align: center;
}

:deep(.chart-fixed-marker) :deep(.fixed-icon) {
  transform: translateY(-2px);
}

:deep(.chart-fixed-marker) {
  /* Slightly larger and pulsing already defined */
}