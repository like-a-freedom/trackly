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
    <l-tile-layer :url="url" :attribution="attribution"></l-tile-layer>
    <template v-if="mapIsReady && shouldRenderGeoJson && displayMode === 'tracks'">
      <l-geo-json
        :key="layerKey"
        :geojson="geojsonData"
        :options="{
          onEachFeature: onEachFeature,
          filter: geoJsonFilter
        }"
        :options-style="geoJsonStyle"
      />
    </template>
    <template v-if="mapIsReady && shouldRenderGeoJson && displayMode === 'detail'">
      <l-geo-json
        :key="`detail-${layerKey}`"
        :geojson="geojsonData"
        :options="{
          onEachFeature: onEachFeature,
          filter: geoJsonFilter
        }"
        :options-style="geoJsonStyle"
      />
    </template>
        <TrackFilterControl
      v-if="!props.selectedTrackDetail"
      class="map-filter-control"
      :categories="allCategories"
      :minLength="minTrackLength"
      :maxLength="maxTrackLength"
      :minElevationGain="minElevationGain"
      :maxElevationGain="maxElevationGain"
      :minSlope="minSlope"
      :maxSlope="maxSlope"
      :globalCategories="globalCategories"
      :globalMinLength="globalMinTrackLength"
      :globalMaxLength="globalMaxTrackLength"
      :globalMinElevationGain="globalMinElevationGain"
      :globalMaxElevationGain="globalMaxElevationGain"
      :globalMinSlope="globalMinSlope"
      :globalMaxSlope="globalMaxSlope"
      :hasElevationData="hasElevationData"
      :hasSlopeData="hasSlopeData"
      :hasTracksInViewport="!!(props.polylines && props.polylines.length > 0)"
      @update:filter="onFilterChange"
    />
    <div class="map-controls">
      <SearchButton 
        v-if="!props.selectedTrackDetail"
        @open-search="$emit('open-search')"
      />
      <GeolocationButton 
        v-if="!props.selectedTrackDetail"
        @location-found="onLocationFound"
      />
    </div>
    <slot></slot>
  </l-map>
</template>

<script setup>
import { LMap, LTileLayer, LPolyline, LGeoJson } from "@vue-leaflet/vue-leaflet";
import { ref, onMounted, onUnmounted, computed, watch, nextTick, getCurrentInstance, provide } from 'vue';
import { latLngBounds } from 'leaflet';
import {
  getDetailPanelFitBoundsOptions,
  POLYLINE_WEIGHT_ACTIVE,
  POLYLINE_WEIGHT_SELECTED_DETAIL,
  POLYLINE_WEIGHT_DEFAULT,
  POLYLINE_OPACITY_ACTIVE,
  POLYLINE_OPACITY_HOVER_DIM,
  POLYLINE_OPACITY_SELECTED_DETAIL,
  POLYLINE_OPACITY_DEFAULT
} from '../utils/mapConstants.js';
import TrackFilterControl from './TrackFilterControl.vue';
import SearchButton from './SearchButton.vue';
import GeolocationButton from './GeolocationButton.vue';
import { useTrackClustering } from '../composables/useTrackClustering.js';
import { useAdvancedDebounce, useThrottle } from '../composables/useAdvancedDebounce.js';
// Import clustering styles
import '../styles/track-clustering.css';

// Constants
const ANIMATION_DURATION_MS = 1100;
const HIGHLIGHT_PANE_Z_INDEX = 750;
const FAKE_BOUNDS = [[0, 0], [0, 0]];

const props = defineProps({
  polylines: Array,
  zoom: Number,
  center: Array,
  bounds: Array,
  url: String,
  attribution: String,
  activeTrackId: [String, Number, null],
  selectedTrackDetail: Object
});

const emit = defineEmits([
  'mapReady', 'trackClick', 'trackMouseOver', 'trackMouseMove', 'trackMouseOut',
  'update:center', 'update:zoom', 'update:bounds', 'open-search'
]);

// State management for map and animations
const leafletMap = ref(null);

// Provide leaflet map instance to child components in slot
provide('leafletMap', leafletMap);

const bounds = ref(null);
const mapKey = ref(0);
const layerKey = ref(0); // For forcing GeoJSON layer re-renders when filter changes
const mapIsReady = ref(false);
const trackZoomAnimating = ref(false);
const isTransitioning = ref(false); // Prevents filter changes during detail view transitions

// Track clustering functionality
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
  animateAddingMarkers: true
}));

// Centralized map state management
const mapState = ref({
  lastKnownGood: {
    zoom: props.zoom,
    center: props.center ? [...props.center] : null
  },
  preSelection: {
    zoom: props.zoom, 
    center: props.center ? [...props.center] : null
  },
  userChangedZoomOrCenter: false,
  pendingRestoreCenterZoom: false
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
function debouncedUpdateClustering() {
  clearClusteringUpdateTimeout();
  
  clusteringUpdateTimeout = setTimeout(() => {
    try {
      updateClustering();
    } catch (error) {
      console.error('[TrackMap] Error in debounced clustering update:', error);
    }
  }, 100); // Reduced from 200ms for faster clustering updates
}

// Debounced filter update function with reduced re-rendering
function debouncedFilterUpdate() {
  clearFilterUpdateTimeout();
  
  filterUpdateTimeout = setTimeout(() => {
    try {
      // Only force layer key update if we actually need to re-render the layers
      // This prevents unnecessary re-renders that cause flicker
      if (!isTransitioning.value && mapIsReady.value && !isPanningOrZooming.value) {
        layerKey.value += 1;
      }
    } catch (error) {
      console.error('[TrackMap] Error in debounced filter update:', error);
    }
  }, 200); // Increased debounce to reduce frequency further
}

// Use stable category set that doesn't disappear when user moves to areas without tracks
// Track session-wide categories that only expand, never shrink when new tracks are loaded
const sessionCategories = ref(new Set());

// Use stable min/max length values that don't change with viewport to prevent filter slider jumping
// Track session-wide range that only expands, never shrinks when new tracks are loaded
const sessionTrackLengths = ref(new Set());
const sessionElevationGains = ref(new Set());
const sessionSlopeValues = ref(new Set());

// Watch for new tracks and update session categories
// Watch for new tracks and update session data (categories, lengths, elevation gains, slopes)
// Combined watcher to prevent multiple reactive cycles
watch(() => props.polylines, (newPolylines) => {
  if (newPolylines) {
    newPolylines.forEach(poly => {
      // Update session categories
      if (poly.properties && Array.isArray(poly.properties.categories)) {
        poly.properties.categories.forEach(cat => {
          if (cat && typeof cat === 'string') {
            sessionCategories.value.add(cat);
          }
        });
      }
      
      // Update session lengths
      const length = poly.properties?.length_km;
      if (typeof length === 'number' && length >= 0) {
        sessionTrackLengths.value.add(length);
      }
      
      // Update session elevation gains
      const elevationGain = poly.properties?.elevation_gain;
      const elevationUp = poly.properties?.elevation_up;
      const effectiveGain = (typeof elevationGain === 'number' && elevationGain >= 0) ? elevationGain : 
                           (typeof elevationUp === 'number' && elevationUp >= 0) ? elevationUp : null;
      
      if (effectiveGain !== null) {
        sessionElevationGains.value.add(effectiveGain);
      }
      
      // Update session slope values
      const slopeMin = poly.properties?.slope_min;
      const slopeMax = poly.properties?.slope_max;
      if (typeof slopeMin === 'number') {
        sessionSlopeValues.value.add(slopeMin);
      }
      if (typeof slopeMax === 'number') {
        sessionSlopeValues.value.add(slopeMax);
      }
    });
  }
}, { immediate: true, deep: true });

// Compute categories with smart fallback logic:
// - If there are tracks in viewport: show only their categories
// - If no tracks in viewport: show all session categories to preserve user selection
const allCategories = computed(() => {
  const currentPolylines = props.polylines || [];
  
  if (currentPolylines.length > 0) {
    // There are tracks in viewport - show only their categories
    const currentCategories = new Set();
    currentPolylines.forEach(poly => {
      if (poly.properties && Array.isArray(poly.properties.categories)) {
        poly.properties.categories.forEach(cat => {
          if (cat && typeof cat === 'string') {
            currentCategories.add(cat);
          }
        });
      }
    });
    return Array.from(currentCategories).sort();
  } else {
    // No tracks in viewport - show all session categories to preserve filter state
    return Array.from(sessionCategories.value).sort();
  }
});

// Use stable default range with reasonable bounds that don't change with viewport
// This prevents the filter slider from jumping when user scrolls to different areas
// min/max длины только по видимым трекам (props.polylines)
const minTrackLength = computed(() => {
  const polylines = props.polylines || [];
  const lengths = polylines
    .map(poly => poly.properties?.length_km)
    .filter(len => typeof len === 'number' && len >= 0);
  if (lengths.length > 0) {
    return Math.min(...lengths);
  }
  return 0;
});

const maxTrackLength = computed(() => {
  const polylines = props.polylines || [];
  const lengths = polylines
    .map(poly => poly.properties?.length_km)
    .filter(len => typeof len === 'number' && len >= 0);
  if (lengths.length > 0) {
    return Math.max(...lengths);
  }
  return 50;
});

// Elevation gain bounds for current viewport
// Use elevation_gain if available, fallback to elevation_up for backward compatibility
const minElevationGain = computed(() => {
  const polylines = props.polylines || [];
  const elevationGains = polylines
    .map(poly => {
      const gain = poly.properties?.elevation_gain;
      const up = poly.properties?.elevation_up;
      // Use elevation_gain if available, fallback to elevation_up
      return (typeof gain === 'number' && gain >= 0) ? gain : 
             (typeof up === 'number' && up >= 0) ? up : null;
    })
    .filter(gain => gain !== null);
  if (elevationGains.length > 0) {
    return Math.min(...elevationGains);
  }
  return 0;
});

const maxElevationGain = computed(() => {
  const polylines = props.polylines || [];
  const elevationGains = polylines
    .map(poly => {
      const gain = poly.properties?.elevation_gain;
      const up = poly.properties?.elevation_up;
      // Use elevation_gain if available, fallback to elevation_up
      return (typeof gain === 'number' && gain >= 0) ? gain : 
             (typeof up === 'number' && up >= 0) ? up : null;
    })
    .filter(gain => gain !== null);
  if (elevationGains.length > 0) {
    return Math.max(...elevationGains);
  }
  return 2000;
});

// Slope bounds for current viewport
const minSlope = computed(() => {
  const polylines = props.polylines || [];
  const slopes = polylines
    .map(poly => poly.properties?.slope_min)
    .filter(slope => slope !== null && slope !== undefined && typeof slope === 'number');
  if (slopes.length > 0) {
    return Math.min(...slopes);
  }
  return 0;
});

const maxSlope = computed(() => {
  const polylines = props.polylines || [];
  const slopes = polylines
    .map(poly => poly.properties?.slope_max)
    .filter(slope => slope !== null && slope !== undefined && typeof slope === 'number');
  if (slopes.length > 0) {
    return Math.max(...slopes);
  }
  return 20;
});

// Global session-based min/max lengths for reset functionality
// These represent the full range across all tracks seen in the session
const globalMinTrackLength = computed(() => {
  const sessionLengths = Array.from(sessionTrackLengths.value);
  if (sessionLengths.length > 0) {
    return Math.min(...sessionLengths);
  }
  return 0;
});

const globalMaxTrackLength = computed(() => {
  const sessionLengths = Array.from(sessionTrackLengths.value);
  if (sessionLengths.length > 0) {
    return Math.max(...sessionLengths);
  }
  return 50;
});

// Global session-based min/max elevation gain for reset functionality
const globalMinElevationGain = computed(() => {
  const elevationGains = Array.from(sessionElevationGains.value);
  if (elevationGains.length > 0) {
    return Math.min(...elevationGains);
  }
  return 0;
});

const globalMaxElevationGain = computed(() => {
  const elevationGains = Array.from(sessionElevationGains.value);
  if (elevationGains.length > 0) {
    return Math.max(...elevationGains);
  }
  return 2000;
});

// Global session-based slope bounds for reset functionality
const globalMinSlope = computed(() => {
  const slopes = Array.from(sessionSlopeValues.value);
  if (slopes.length > 0) {
    return Math.min(...slopes);
  }
  return 0;
});

const globalMaxSlope = computed(() => {
  const slopes = Array.from(sessionSlopeValues.value);
  if (slopes.length > 0) {
    return Math.max(...slopes);
  }
  return 20;
});

// Global session categories for reset functionality
const globalCategories = computed(() => {
  return Array.from(sessionCategories.value).sort();
});

// Check if there's elevation data available in tracks
const hasElevationData = computed(() => {
  if (!props.polylines || !props.polylines.length) return false;
  return props.polylines.some(track => track.properties && track.properties.elevation_gain != null);
});

// Check if there's slope data available in tracks
const hasSlopeData = computed(() => {
  if (!props.polylines || !props.polylines.length) return false;
  return props.polylines.some(track => track.properties && (
    track.properties.slope_min != null || 
    track.properties.slope_max != null || 
    track.properties.slope_avg != null
  ));
});

// Initialize filter state properly with watchers to update when track data changes
const filterState = ref({ 
  categories: [], 
  lengthRange: [0, 0],
  elevationGainRange: [0, 2000],
  slopeRange: [0, 20]
});

// Convert polylines to GeoJSON format (no filtering here - use native Leaflet filter)
const geojsonData = computed(() => {
  if (!props.polylines || !props.polylines.length) {
    return {
      type: "FeatureCollection",
      features: []
    };
  }

  const features = props.polylines.map((poly) => {
    return {
      type: "Feature",
      properties: {
        ...poly.properties,
        color: poly.color, // Use original color
        id: poly.properties?.id ?? poly.keyFallback
      },
      geometry: {
        type: "LineString",
        coordinates: poly.latlngs.map(point => [point[1], point[0]]) // [lng, lat] for GeoJSON
      }
    };
  });

  return {
    type: "FeatureCollection", 
    features
  };
});

// Determine display mode based on zoom level and settings
const displayMode = computed(() => {
  if (props.selectedTrackDetail) {
    return 'detail'; // Show only selected track
  }
  
  if (clustering.shouldCluster.value) {
    return 'cluster'; // Show clusters
  }
  
  return 'tracks'; // Show individual tracks
});

// Tracks that pass the current filter
const filteredTracks = computed(() => {
  if (!props.polylines || !props.polylines.length) {
    return [];
  }
  
  return props.polylines.filter(track => {
    const feature = {
      properties: track.properties
    };
    return geoJsonFilter(feature, null);
  });
});

// Native Leaflet filter function - more efficient than pre-filtering data
function geoJsonFilter(feature, layer) {
  // During transition, maintain the same filter behavior as before the transition
  // to prevent layers from being removed during L-geo-json cleanup
  if (isTransitioning.value) {
    // Keep showing the tracks that were visible before transition started
    // This prevents the dramatic filter behavior change that causes race condition
    const cats = feature.properties?.categories || [];
    const len = feature.properties?.length_km;
    
    // If we have selected categories, use them; otherwise show all tracks
    if (filterState.value.categories.length > 0) {
      const catMatch = filterState.value.categories.some(cat => cats.includes(cat));
      const EPSILON = 0.5;
      const min = filterState.value.lengthRange[0];
      const max = filterState.value.lengthRange[1];
      const lenMatch = len >= (min - EPSILON) && len <= (max + EPSILON);
      
      // Elevation gain filtering with fallback
      const elevationGain = feature.properties?.elevation_gain;
      const elevationUp = feature.properties?.elevation_up;
      const effectiveGain = (typeof elevationGain === 'number') ? elevationGain : 
                           (typeof elevationUp === 'number') ? elevationUp : null;
      
      const elevationMin = filterState.value.elevationGainRange[0];
      const elevationMax = filterState.value.elevationGainRange[1];
      const EPSILON_ELEVATION = 10; // Larger tolerance for elevation (10 meters) to handle boundary cases
      const elevationMatch = effectiveGain === null || 
        (effectiveGain >= (elevationMin - EPSILON_ELEVATION) && effectiveGain <= (elevationMax + EPSILON_ELEVATION));
      
      // Slope filtering
      const slopeMin = feature.properties?.slope_min;
      const slopeMax = feature.properties?.slope_max;
      const slopeFilterMin = filterState.value.slopeRange?.[0] ?? 0;
      const slopeFilterMax = filterState.value.slopeRange?.[1] ?? 20;
      const EPSILON_SLOPE = 0.1; // Small tolerance for slope (0.1%) to handle boundary cases
      
      // Track matches if its slope range overlaps with the filter range
      const slopeMatch = (slopeMin === null || slopeMin === undefined || slopeMax === null || slopeMax === undefined) ||
        (slopeMax >= (slopeFilterMin - EPSILON_SLOPE) && slopeMin <= (slopeFilterMax + EPSILON_SLOPE));
      
      // Debug logging for slope filtering
      if (feature.properties?.name && feature.properties.name.includes('алма')) {
        console.log(`Track "${feature.properties.name}": slope[${slopeMin}, ${slopeMax}], filter[${slopeFilterMin}, ${slopeFilterMax}], match: ${slopeMatch}`);
      }
      
      return catMatch && lenMatch && elevationMatch && slopeMatch;
    } else {
      // During transition with no categories selected, show all tracks to prevent cleanup issues
      return true;
    }
  }

  // When track detail panel is open, show ONLY the selected track
  if (props.selectedTrackDetail && props.selectedTrackDetail.id) {
    return feature.properties && feature.properties.id === props.selectedTrackDetail.id;
  }

  // Apply category and length filters (only when no track detail is selected)
  const cats = feature.properties?.categories || [];
  const len = feature.properties?.length_km;
  
  // If no categories are selected, show nothing (test expectation)
  if (filterState.value.categories.length === 0) {
    return false;
  }
  
  const catMatch = filterState.value.categories.some(cat => cats.includes(cat));
  
  // Use epsilon for both min and max to handle rounding errors
  const EPSILON = 0.5; // Increased epsilon to handle rounding better
  const min = filterState.value.lengthRange[0];
  const max = filterState.value.lengthRange[1];
  const lenMatch = len >= (min - EPSILON) && len <= (max + EPSILON);
  
  // Elevation gain filtering with fallback and larger tolerance for boundary values
  const elevationGain = feature.properties?.elevation_gain;
  const elevationUp = feature.properties?.elevation_up;
  const effectiveGain = (typeof elevationGain === 'number') ? elevationGain : 
                       (typeof elevationUp === 'number') ? elevationUp : null;
  
  const elevationMin = filterState.value.elevationGainRange[0];
  const elevationMax = filterState.value.elevationGainRange[1];
  const EPSILON_ELEVATION = 10; // Larger tolerance for elevation (10 meters) to handle boundary cases
  const elevationMatch = effectiveGain === null || 
    (effectiveGain >= (elevationMin - EPSILON_ELEVATION) && effectiveGain <= (elevationMax + EPSILON_ELEVATION));
  
  // Slope filtering
  const slopeMin = feature.properties?.slope_min;
  const slopeMax = feature.properties?.slope_max;
  const slopeFilterMin = filterState.value.slopeRange?.[0] ?? 0;
  const slopeFilterMax = filterState.value.slopeRange?.[1] ?? 20;
  const EPSILON_SLOPE = 0.1; // Small tolerance for slope (0.1%) to handle boundary cases
  
  // Track matches if its slope range overlaps with the filter range
  const slopeMatch = (slopeMin === null || slopeMin === undefined || slopeMax === null || slopeMax === undefined) ||
    (slopeMax >= (slopeFilterMin - EPSILON_SLOPE) && slopeMin <= (slopeFilterMax + EPSILON_SLOPE));
  
  return catMatch && lenMatch && elevationMatch && slopeMatch;
}

// Handle filter changes from the control component with proper debouncing
const debouncedOnFilterChange = useAdvancedDebounce((newFilterState) => {
  filterState.value = { ...newFilterState };
  // Use debounced filter update to prevent excessive re-renders
  debouncedFilterUpdate();
}, 150, { leading: false, trailing: true });

function onFilterChange(newFilterState) {
  if (import.meta.env.MODE === 'test') {
    // In test mode, update immediately without debouncing
    filterState.value = { ...newFilterState };
    debouncedFilterUpdate();
  } else {
    // In production, use debounced function to prevent excessive updates
    debouncedOnFilterChange(newFilterState);
  }
}

// Watch for changes in track ranges and update filter accordingly (only for initialization)
// Use a single batched watcher to prevent multiple simultaneous updates
const batchedFilterUpdate = useAdvancedDebounce(() => {
  // Force a single filter update after all range changes are processed
  debouncedFilterUpdate();
}, 50, { leading: false, trailing: true });

watch([minTrackLength, maxTrackLength, minElevationGain, maxElevationGain, minSlope, maxSlope], 
([minLen, maxLen, minElev, maxElev, minSlopeVal, maxSlopeVal]) => {
  let hasUpdates = false;
  
  // Only update if the current range is uninitialized
  // Length range
  if (filterState.value.lengthRange[0] === 0 && filterState.value.lengthRange[1] === 0) {
    filterState.value.lengthRange = [minLen, maxLen];
    hasUpdates = true;
  }
  
  // Elevation gain range
  if (filterState.value.elevationGainRange[0] === 0 && filterState.value.elevationGainRange[1] === 2000) {
    filterState.value.elevationGainRange = [minElev, maxElev];
    hasUpdates = true;
  }
  
  // Slope range
  if ((filterState.value.slopeRange?.[0] ?? 0) === 0 && (filterState.value.slopeRange?.[1] ?? 20) === 20) {
    if (!filterState.value.slopeRange) {
      filterState.value.slopeRange = [0, 20];
    }
    filterState.value.slopeRange = [minSlopeVal, maxSlopeVal];
    hasUpdates = true;
  }
  
  // Only trigger update if we actually changed something
  if (hasUpdates) {
    batchedFilterUpdate();
  }
}, { immediate: true });

// LocalStorage operations with proper error handling
const storageKeys = {
  preSelectionZoom: 'trackly_preSelectionZoom',
  preSelectionCenterLat: 'trackly_preSelectionCenterLat', 
  preSelectionCenterLng: 'trackly_preSelectionCenterLng'
};

function saveMapStateToStorage(zoom, center) {
  try {
    if (zoom !== undefined) {
      localStorage.setItem(storageKeys.preSelectionZoom, zoom.toString());
    }
    if (center && center.length >= 2) {
      localStorage.setItem(storageKeys.preSelectionCenterLat, center[0].toString());
      localStorage.setItem(storageKeys.preSelectionCenterLng, center[1].toString());
    }
  } catch (error) {
    console.warn('[TrackMap] Failed to save state to localStorage:', error);
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
        center: [parseFloat(storedLat), parseFloat(storedLng)]
      };
    }
  } catch (error) {
    console.warn('[TrackMap] Failed to load state from localStorage:', error);
  }
  return null;
}

/**
 * Gets the current map object, ensuring it's valid
 * @returns {Object|null} The Leaflet map object or null if not available
 */
function getMapObject(context = '') {
  try {
    if (leafletMap.value && leafletMap.value.mapObject) {
      return leafletMap.value.mapObject;
    }
    // Try to access it through alternative means if available
    const mapInstance = leafletMap.value?.leafletObject || leafletMap.value?.mapObject;
    if (mapInstance && typeof mapInstance.getZoom === 'function') {
      return mapInstance;
    }
    // Don't log warnings during cleanup or unmounting
    if (context !== 'cleanup' && !isUnmounting.value) {
      console.warn(`[TrackMap] Map object not available${context ? ' in ' + context : ''}`);
    }
    return null;
  } catch (error) {
    // Don't log errors during cleanup or unmounting
    if (context !== 'cleanup' && !isUnmounting.value) {
      console.error(`[TrackMap] Error accessing map object${context ? ' in ' + context : ''}:`, error);
    }
    return null;
  }
}

/**
 * Calculates the weight for a given polyline based on the current map state.
 * @param {Object} poly - The polyline object.
 * @returns {number} The weight for the polyline.
 */
function getPolylineWeight(poly) {
  if (poly.properties && poly.properties.id === props.activeTrackId) {
    return POLYLINE_WEIGHT_ACTIVE;
  }
  if (props.selectedTrackDetail) {
    return POLYLINE_WEIGHT_SELECTED_DETAIL;
  }
  return POLYLINE_WEIGHT_DEFAULT;
}

/**
 * Calculates the opacity for a given polyline based on the current map state.
 * @param {Object} poly - The polyline object.
 * @returns {number} The opacity for the polyline.
 */
function getPolylineOpacity(poly) {
  if (props.activeTrackId) {
    return (poly.properties && poly.properties.id === props.activeTrackId) ? POLYLINE_OPACITY_ACTIVE : POLYLINE_OPACITY_HOVER_DIM;
  }
  if (props.selectedTrackDetail) {
    return POLYLINE_OPACITY_SELECTED_DETAIL;
  }
  return POLYLINE_OPACITY_DEFAULT;
}

/**
 * Calculates the weight for a given GeoJSON feature based on the current map state.
 * @param {Object} feature - The GeoJSON feature object.
 * @returns {number} The weight for the feature.
 */
function getFeatureWeight(feature) {
  if (feature.properties && feature.properties.id === props.activeTrackId) {
    return POLYLINE_WEIGHT_ACTIVE;
  }
  if (props.selectedTrackDetail) {
    return POLYLINE_WEIGHT_SELECTED_DETAIL;
  }
  return POLYLINE_WEIGHT_DEFAULT;
}

/**
 * Calculates the opacity for a given GeoJSON feature based on the current map state.
 * @param {Object} feature - The GeoJSON feature object.
 * @returns {number} The opacity for the feature.
 */
function getFeatureOpacity(feature) {
  if (props.activeTrackId) {
    return (feature.properties && feature.properties.id === props.activeTrackId) ? POLYLINE_OPACITY_ACTIVE : POLYLINE_OPACITY_HOVER_DIM;
  }
  if (props.selectedTrackDetail) {
    return POLYLINE_OPACITY_SELECTED_DETAIL;
  }
  return POLYLINE_OPACITY_DEFAULT;
}

// GeoJSON layer styling function
function geoJsonStyle(feature) {
  return {
    color: feature.properties.color,
    weight: getFeatureWeight(feature),
    opacity: getFeatureOpacity(feature)
  };
}

// Function to bind events to each feature
function onEachFeature(feature, layer) {
  layer.on({
    click: (event) => onGeoJsonClick(event),
    mouseover: (event) => onGeoJsonMouseOver(event),
    mousemove: (event) => onTrackMouseMove(event),
    mouseout: (event) => onGeoJsonMouseOut(event)
  });
}

// Event handlers for GeoJSON layer
function onGeoJsonClick(event) {
  // In GeoJSON layer events, the feature is accessed via event.target.feature
  const layer = event.target;
  const feature = layer?.feature;
  
  if (!feature?.properties?.id) {
    return;
  }
  
  const poly = props.polylines.find(p => p.properties?.id === feature.properties.id);
  if (poly) {
    emit('trackClick', poly, event);
  }
}

function onGeoJsonMouseOver(event) {
  // Skip hover events during zoom animations or panning to reduce processing
  if (props.selectedTrackDetail || isZoomAnimating.value || isPanningOrZooming.value) return;

  const layer = event.target;
  const feature = layer?.feature;
  
  if (!feature?.properties?.id) {
    return;
  }

  // Bring the layer to front
  if (layer && typeof layer.bringToFront === 'function') {
    layer.bringToFront();
  }
  
  const poly = props.polylines.find(p => p.properties?.id === feature.properties.id);
  if (poly) {
    emit('trackMouseOver', poly, event);
  }
}

function onGeoJsonMouseOut(event) {
  if (props.selectedTrackDetail) return;
  emit('trackMouseOut', event);
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
    mapState.value.lastKnownGood.center = [map.getCenter().lat, map.getCenter().lng];
    
    // When no detail view is active, also update preSelection values
    // to match the current state for next time a track is selected
    mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
    mapState.value.preSelection.center = [...mapState.value.lastKnownGood.center];
    
    mapState.value.userChangedZoomOrCenter = true;
  }
}

async function onMapReady(e) {
  try {
    const map = e; // Leaflet map instance
    if (!map || typeof map.getZoom !== 'function') {
      console.error('[TrackMap] Error in onMapReady: Invalid map instance received.', { eventPayload: e });
      mapIsReady.value = true;
      emit('mapReady', e);
      return;
    }

    // Handle pending restoration
    if (mapState.value.pendingRestoreCenterZoom && !props.selectedTrackDetail) {
      const preSelection = mapState.value.preSelection;
      const lastKnownGood = mapState.value.lastKnownGood;
      
      if (preSelection.center && preSelection.zoom !== undefined) {
        emit('update:center', Array.isArray(preSelection.center) ? 
          preSelection.center : [preSelection.center.lat, preSelection.center.lng]);
        await nextTick();
        emit('update:zoom', preSelection.zoom);
      } else if (lastKnownGood.center && lastKnownGood.zoom !== undefined) {
        emit('update:center', Array.isArray(lastKnownGood.center) ? 
          lastKnownGood.center : [lastKnownGood.center.lat, lastKnownGood.center.lng]);
        await nextTick();
        emit('update:zoom', lastKnownGood.zoom);
      }
      mapState.value.pendingRestoreCenterZoom = false;
    }

    // Update current state
    mapState.value.lastKnownGood.zoom = map.getZoom();
    mapState.value.lastKnownGood.center = [map.getCenter().lat, map.getCenter().lng];
    
    // Move attribution control to bottom-left to avoid collision with panel toggle
    if (map.attributionControl) {
      map.removeControl(map.attributionControl);
      map.attributionControl.setPosition('bottomleft');
      map.addControl(map.attributionControl);
    }
    
    // Also update preSelection values if no track is selected
    if (!props.selectedTrackDetail) {
      mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
      mapState.value.preSelection.center = [...mapState.value.lastKnownGood.center];
    }
    
    mapState.value.userChangedZoomOrCenter = false;
    mapIsReady.value = true;
    
    // Initialize stable bounds for track visibility calculation
    stableBounds.value = map.getBounds();
    
    // Initialize clustering
    initializeClustering(map);
    
    emit('mapReady', map);
    
    // Apply bounds if they were set before map was ready
    if (props.bounds && Array.isArray(props.bounds) && props.bounds.length === 2) {
      try {
        const options = props.selectedTrackDetail ? 
          getDetailPanelFitBoundsOptions() : 
          { padding: [20, 20] };
        console.log('[TrackMap] onMapReady - fitting bounds with options:', options, 'bounds:', props.bounds);
        map.fitBounds(props.bounds, options);
      } catch (error) {
        console.error('[TrackMap] Error applying initial bounds:', error);
      }
    } else {
      console.log('[TrackMap] onMapReady - no bounds to fit', { bounds: props.bounds, selectedTrackDetail: !!props.selectedTrackDetail });
    }
    
    // Enhance fitBounds for selected track detail
    const origFitBounds = map.fitBounds.bind(map);
    map.fitBounds = function(boundsArg, options = {}) {
      if (props.selectedTrackDetail && !options.paddingBottomRight && !options.paddingTopLeft) {
        options = { ...options, ...getDetailPanelFitBoundsOptions() };
      }
      return origFitBounds(boundsArg, options);
    };
    
  } catch (error) {
    console.error('[TrackMap] Error in onMapReady logic:', error, { eventPayload: e });
    if (!mapIsReady.value) mapIsReady.value = true; 
    emit('mapReady', e);
  }
}

/**
 * Initialize clustering functionality
 * @param {L.Map} map - Leaflet map instance
 */
function initializeClustering(map) {
  try {
    // Initialize cluster group with custom configuration
    const clusterGroup = clustering.initializeClusterGroup(clusteringConfig.value);
    
    // Set up cluster event handlers with error handling
    clusterGroup.on('clusterclick', (e) => {
      try {
        onClusterClick(e);
      } catch (error) {
        console.error('[TrackMap] Error in cluster click handler:', error);
      }
    });
    
    // Set up individual marker event handlers within clusters
    clusterGroup.on('click', (e) => {
      try {
        onClusterMarkerClick(e);
      } catch (error) {
        console.error('[TrackMap] Error in marker click handler:', error);
      }
    });
    
    clusterGroup.on('mouseover', (e) => {
      const marker = e.layer || e.target;
      if (marker.trackData && !marker.getAllChildMarkers && !isZoomAnimating.value) {
        showMarkerPolyline(marker.trackData, map, marker);
        emit('trackMouseOver', marker.trackData, e.originalEvent || e);
      }
    });
    clusterGroup.on('mouseout', (e) => {
      const marker = e.layer || e.target;
      if (marker.trackData && !marker.getAllChildMarkers) {
        removeMarkerPolyline(map);
        emit('trackMouseOut', e.originalEvent || e);
      }
    });
    
    // Add cluster group to map
    map.addLayer(clusterGroup);
    
    // Set initial zoom level for clustering
    clustering.updateZoomLevel(map.getZoom());
    
    // Perform initial clustering update with delay to ensure map is ready
    setTimeout(() => {
      updateClustering();
    }, 100);
  } catch (error) {
    console.error('[TrackMap] Error initializing clustering:', error);
  }
}

const hoveredMarkerPolyline = ref(null);
const hoveredMarker = ref(null);

function showMarkerPolyline(track, map, marker) {
  // Prevent hover polylines during zoom animations or unmounting to avoid conflicts
  if (!track || !track.latlngs || !map || isZoomAnimating.value || isUnmounting.value) return;
  
  try {
    removeMarkerPolyline(map);
    if (marker) {
      marker.setOpacity(0); // Hide marker
      hoveredMarker.value = marker;
    }
    hoveredMarkerPolyline.value = L.polyline(track.latlngs, {
      color: track.color || '#3388ff',
      weight: POLYLINE_WEIGHT_ACTIVE,
      opacity: POLYLINE_OPACITY_ACTIVE,
      pane: 'overlayPane',
      interactive: false
    }).addTo(map);
  } catch (error) {
    console.warn('[TrackMap] Error adding hover polyline:', error);
    // Clean up on error
    removeMarkerPolyline(map);
  }
}

function removeMarkerPolyline(map) {
  try {
    if (hoveredMarkerPolyline.value && map) {
      map.removeLayer(hoveredMarkerPolyline.value);
      hoveredMarkerPolyline.value = null;
    }
    if (hoveredMarker.value) {
      hoveredMarker.value.setOpacity(1); // Restore marker
      hoveredMarker.value = null;
    }
  } catch (error) {
    console.warn('[TrackMap] Error removing hover polyline:', error);
    // Force clear references even on error
    hoveredMarkerPolyline.value = null;
    hoveredMarker.value = null;
  }
}

/**
 * Handle cluster click events
 * @param {Event} e - Cluster click event
 */
function onClusterClick(e) {
  const cluster = e.layer || e.target;
  
  if (cluster.getAllChildMarkers) {
    // This is a cluster, zoom in to show individual tracks
    const map = getMapObject('onClusterClick');
    if (map && cluster.getBounds) {
      // Clean up hover polylines before fitting bounds
      removeMarkerPolyline(map);
      const bounds = cluster.getBounds();
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }
}

/**
 * Handle individual marker click within cluster
 * @param {Event} e - Marker click event
 */
function onClusterMarkerClick(e) {
  const marker = e.layer || e.target;
  
  // Check if this is an individual marker (not a cluster)
  if (marker.trackData && !marker.getAllChildMarkers) {
    // Emit track click event with track data
    emit('trackClick', marker.trackData, e);
  }
}

/**
 * Update clustering based on current tracks and filters with debouncing
 */
function updateClustering() {
  if (!clustering.clusterGroup.value || displayMode.value === 'detail') {
    return;
  }

  // Clear any pending clustering updates to debounce
  clearClusteringUpdateTimeout();
  
  clusteringUpdateTimeout = setTimeout(() => {
    try {
      if (displayMode.value === 'cluster') {
        // Add filtered tracks to cluster
        clustering.addTracksToCluster(
          filteredTracks.value,
          clustering.clusterGroup.value,
          null,
          'center' // Use center point strategy
        );
      } else {
        // Clear clusters when showing individual tracks
        if (clustering.clusterGroup.value.getLayers && clustering.clusterGroup.value.getLayers().length > 0) {
          clustering.clusterGroup.value.clearLayers();
        }
      }
    } catch (error) {
      console.error('[TrackMap] Error updating clustering:', error);
    }
    clusteringUpdateTimeout = null;
  }, 150); // Debounce clustering updates by 150ms
}

function onMoveStart(e) {
  // Set panning state to optimize certain operations during pan
  isPanningOrZooming.value = true;
  // Remove hover polylines during move to prevent visual glitches
  const map = e.target;
  removeMarkerPolyline(map);
}

function onMoveEnd(e) {
  const map = e.target;
  const center_val = map.getCenter();
  const mapBounds = map.getBounds();
  
  // Clear panning state immediately
  isPanningOrZooming.value = false;
  
  // Update stable bounds with debouncing to reduce reactive updates
  updateStableBounds(mapBounds);
  
  // Only emit center update if it's meaningfully different to prevent oscillation
  const newCenter = [center_val.lat, center_val.lng];
  if (!props.center || 
      Math.abs(newCenter[0] - props.center[0]) > 0.0001 || 
      Math.abs(newCenter[1] - props.center[1]) > 0.0001) {
    emit('update:center', newCenter);
  }
  
  emit('update:bounds', mapBounds);
  updateInitialMapState(e);
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
        emit('update:zoom', currentZoom);
      }
      
      // Clear zoom animating state after debounced update
      isZoomAnimating.value = false;
    } catch (error) {
      console.error('[TrackMap] Error updating clustering zoom level:', error);
      // Ensure states are cleared even on error
      isZoomAnimating.value = false;
    }
  }, 100); // Slightly increased debounce time to prevent rapid-fire updates
  
  emit('update:zoom', map.getZoom());
  updateInitialMapState(e);
}

function onTrackClick(poly, event) { 
  emit('trackClick', poly, event); 
}

function onTrackMouseOver(poly, event) {
  // Skip hover events during zoom animations or panning to reduce processing
  if (props.selectedTrackDetail || isZoomAnimating.value || isPanningOrZooming.value) return;

  const leafletLayer = event.target;
  if (leafletLayer && typeof leafletLayer.bringToFront === 'function') {
    leafletLayer.bringToFront();
  }
  emit('trackMouseOver', poly, event);
}

function onTrackMouseMove(event) {
  // Skip mouse move events during active operations
  if (!isPanningOrZooming.value && !isZoomAnimating.value) {
    emit('trackMouseMove', event);
  }
}

function onTrackMouseOut(event) {
  if (props.selectedTrackDetail) return;
  emit('trackMouseOut', event);
}

/**
 * Handle geolocation results from the GeolocationButton component
 * @param {Object} location - Location object with latitude, longitude, or error
 */
function onLocationFound(location) {
  if (location.error) {
    console.warn('[TrackMap] Geolocation error:', location.error);
    return;
  }

  const map = getMapObject('onLocationFound');
  if (!map) {
    console.warn('[TrackMap] Map not available for geolocation');
    return;
  }

  try {
    // Center the map on the user's location
    // Check if component is still mounted before flying
    if (isUnmounting.value) return;
    
    map.flyTo([location.latitude, location.longitude], 15, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  } catch (error) {
    console.error('[TrackMap] Error centering map on user location:', error);
  }
}

/**
 * Handles logic when a track detail is selected.
 * @param {Object} newDetail - The new track detail object.
 */
async function handleTrackSelected(newDetail) {
  try {
    // If bounds prop is provided, let the bounds watch handle positioning
    // This prevents double-positioning and conflicts
    if (props.bounds && Array.isArray(props.bounds) && props.bounds.length === 2) {
      console.log('[TrackMap] Bounds provided, skipping handleTrackSelected flyToBounds');
      // Just save pre-selection state for returning later
      const map = getMapObject('handleTrackSelected-saveState');
      if (map) {
        mapState.value.preSelection.zoom = map.getZoom();
        mapState.value.preSelection.center = [map.getCenter().lat, map.getCenter().lng];
        saveMapStateToStorage(mapState.value.preSelection.zoom, mapState.value.preSelection.center);
      }
      return;
    }

    const selectedPolyline = props.polylines.find(
      poly => poly.properties && poly.properties.id === newDetail.id
    );
    if (!selectedPolyline || !selectedPolyline.latlngs || !selectedPolyline.latlngs.length) return;

    const map = getMapObject('handleTrackSelected');
    if (map) {
      // Clean up any hover polylines before flying to track
      removeMarkerPolyline(map);
      
      // Save current state before flying to track
      mapState.value.preSelection.zoom = map.getZoom();
      mapState.value.preSelection.center = [map.getCenter().lat, map.getCenter().lng];
      saveMapStateToStorage(mapState.value.preSelection.zoom, mapState.value.preSelection.center);
      
      map.flyToBounds(selectedPolyline.latlngs, {
        ...getDetailPanelFitBoundsOptions(),
        duration: 1.5,
        easeLinearity: 0.25
      });
    } else {
      // Fallback when map object is not available
      if (mapState.value.lastKnownGood.zoom !== undefined && mapState.value.lastKnownGood.center) {
        mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
        mapState.value.preSelection.center = [...mapState.value.lastKnownGood.center];
        saveMapStateToStorage(mapState.value.preSelection.zoom, mapState.value.preSelection.center);
      }
      
      bounds.value = null;
      await nextTick();
      bounds.value = latLngBounds(selectedPolyline.latlngs);
    }
  } catch (error) {
    console.error('[TrackMap] Error in handleTrackSelected:', error, { newDetail });
  }
}

/**
 * Handles logic when a track detail is deselected (closed).
 */
async function handleTrackDeselected() {
  try {
    setTrackZoomAnimating(true);
    const map = getMapObject('handleTrackDeselected');
    
    // Clean up any hover polylines before flying back
    removeMarkerPolyline(map);
    
    bounds.value = null;
    
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
            easeLinearity: 0.25
          });
          // Update state after successful fly
          mapState.value.lastKnownGood.center = Array.isArray(center) ? [...center] : [center.lat, center.lng];
          mapState.value.lastKnownGood.zoom = zoom;
        } catch (flyError) {
          console.warn('[TrackMap] flyTo failed, trying setView:', flyError);
          try {
            if (!isUnmounting.value) {
              map.setView(center, zoom, { animate: false }); // Disable animation on fallback
            }
          } catch (setViewError) {
            console.error('[TrackMap] setView also failed:', setViewError);
          }
        }
      }, 50);
    }
  } catch (error) {
    console.error('[TrackMap] Error in handleTrackDeselected:', error);
    // Recovery attempt
    try {
      const map = getMapObject('handleTrackDeselected-recovery');
      if (map && !isUnmounting.value) {
        const center = mapState.value.preSelection.center || mapState.value.lastKnownGood.center;
        const zoom = mapState.value.preSelection.zoom || mapState.value.lastKnownGood.zoom;
        if (center && zoom !== undefined) {
          map.setView(center, zoom, { animate: false }); // Disable animation in recovery
        }
      }
    } catch (recoveryError) {
      console.error('[TrackMap] Failed to recover from deselection error:', recoveryError);
    }
  }
}

watch(() => props.selectedTrackDetail, async (newDetail, oldDetail) => {
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
      if (geojsonData.value && geojsonData.value.features && geojsonData.value.features.length > 0) {
        layerKey.value++;
      }
      
      // Allow one more tick for the new component to initialize
      await nextTick();
    } finally {
      // Clear transitioning state to allow L-geo-json to render again
      isTransitioning.value = false;
    }
  }
});

// Control when L-geo-json component should be rendered to prevent race conditions
const shouldRenderGeoJson = computed(() => {
  if (isUnmounting.value || !mapIsReady.value) return false;
  
  // Don't render during transitions to prevent unmount/remount race conditions
  if (isTransitioning.value) return false;
  
  // ALWAYS keep tracks visible - don't hide during zoom/pan operations
  // This prevents the flicker/migration issue
  return !!(geojsonData.value && 
           geojsonData.value.features && 
           geojsonData.value.features.length > 0 &&
           (displayMode.value === 'tracks' || displayMode.value === 'detail'));
});

// Watch for changes in filtered tracks to update clustering (debounced)
let tracksWatchTimeout = null;
watch(() => filteredTracks.value, () => {
  if (clustering.clusterGroup.value && displayMode.value === 'cluster') {
    clearTimeout(tracksWatchTimeout);
    tracksWatchTimeout = setTimeout(() => {
      if (!isUnmounting.value && !isPanningOrZooming.value) {
        updateClustering();
      }
    }, 300); // Increased debounce for better performance
  }
}, { deep: true });

// Watch for display mode changes to update clustering
watch(() => displayMode.value, (newMode, oldMode) => {
  if (newMode !== oldMode) {
    // Remove polyline and restore marker if needed
    const map = getMapObject('displayModeChange');
    removeMarkerPolyline(map);
    // Hide tooltip via event
    const vm = getCurrentInstance();
    if (vm && vm.emit) {
      vm.emit('trackMouseOut', {});
    } else if (emit) {
      emit('trackMouseOut', {});
    }
    // Use debounced clustering update instead of immediate timeout
    debouncedUpdateClustering();
  }
});

// Watch for clustering configuration changes (less frequent)
watch(() => clustering.shouldCluster.value, (shouldCluster) => {
  // Use debounced clustering update for better performance
  debouncedUpdateClustering();
});

// Watch for zoom animation state changes to clean up hover polylines
watch(() => isZoomAnimating.value, (isAnimating) => {
  if (isAnimating) {
    const map = getMapObject('zoomAnimationWatch');
    removeMarkerPolyline(map);
  }
});

// Watch for bounds prop changes to fit track to bounds
watch(() => props.bounds, (newBounds) => {
  if (newBounds && mapIsReady.value) {
    const map = getMapObject('boundsWatch');
    if (map && Array.isArray(newBounds) && newBounds.length === 2) {
      try {
        // Use fitBounds with proper options for track detail view
        const options = props.selectedTrackDetail ? 
          getDetailPanelFitBoundsOptions() : 
          { padding: [20, 20] };
        console.log('[TrackMap] Fitting bounds with options:', options);
        map.fitBounds(newBounds, options);
      } catch (error) {
        console.error('[TrackMap] Error fitting bounds:', error);
      }
    }
  }
}, { immediate: true });

// Cleanup function for component unmounting
function cleanup() {
  clearBoundsTimeout();
  clearAnimationTimeout();
  clearClusteringUpdateTimeout();
  clearMapUpdateTimeout();
  clearFilterUpdateTimeout();
  
  // Clean up new debounced functions
  if (debouncedOnFilterChange && debouncedOnFilterChange.cancel) {
    debouncedOnFilterChange.cancel();
  }
  if (batchedFilterUpdate && batchedFilterUpdate.cancel) {
    batchedFilterUpdate.cancel();
  }
  
  // Clean up hover polylines
  const map = getMapObject('cleanup');
  if (map) {
    removeMarkerPolyline(map);
  }
  
  // Clear tracks watch timeout
  if (tracksWatchTimeout) {
    clearTimeout(tracksWatchTimeout);
    tracksWatchTimeout = null;
  }
  
  // Clean up clustering resources
  if (clustering.clusterGroup.value) {
    clustering.cleanup();
  }
}

// Cleanup on unmount
onUnmounted(() => {
  // Set unmounting flag to prevent further operations
  isUnmounting.value = true;
  
  // Force clear zoom animation state to prevent issues
  isZoomAnimating.value = false;
  
  const map = getMapObject('cleanup');
  if (map) {
    // Stop any ongoing map animations
    try {
      map.stop(); // Stop all animations
    } catch (error) {
      console.warn('[TrackMap] Error stopping map animations:', error);
    }
    
    removeMarkerPolyline(map);
  }
  
  // Clear any pending zoom-related timeouts immediately
  clearAnimationTimeout();
  clearClusteringUpdateTimeout();
  
  cleanup();
});

defineExpose({ leafletMap });
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
  animation: track-zoom-out-anim 0.5s cubic-bezier(.22,1.1,.36,1) both;
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

.map-controls {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Mobile adjustments for map controls - match other components */
@media (max-width: 640px) {
  .map-controls {
    top: 12px;
    left: 12px;
  }
}
</style>
