<template>
  <div class="app-container" v-if="!loading">
    <TrackMap
      v-if="track && polylines.length > 0 && trackBounds"
      key="track-detail-map"
      :polylines="polylines"
      :zoom="zoom"
      :center="center"
      :bounds="trackBounds"
      :markerLatLng="markerLatLng"
      :url="url"
      :attribution="attribution"
      :activeTrackId="track.id"
      :selectedTrackDetail="track" 
      @mapReady="onMapReady"
      @update:center="handleCenterUpdate"
      @update:zoom="handleZoomUpdate"
    >
      <!-- POI Markers with Clustering -->
      <PoiClusterGroup
        v-if="pois.length > 0 && mapIsReady"
        :pois="pois"
        :disableClusteringAtZoom="15"
        :maxClusterRadius="32"
        @poi-click="handlePoiClick"
      />
      
      <!-- Track Direction & Distance Visualization -->
      <TrackDirectionLayer
        v-if="track?.latlngs && track.latlngs.length >= 2"
        :latlngs="track.latlngs"
        :color="getColorForId(track.id)"
        :zoom="zoom"
      />
      <LPolyline
        v-for="gap in pauseGapLines"
        :key="gap.id"
        :lat-lngs="gap.latlngs"
        :color="gap.color"
        :weight="4"
        :opacity="0.7"
        :dashArray="'8 8'"
      >
        <LTooltip sticky>{{ gap.label }}</LTooltip>
      </LPolyline>
      <TrackDistanceMarkers
        v-if="track?.latlngs && track.latlngs.length >= 2"
        :latlngs="track.latlngs"
        :trackId="track.id"
        :zoom="zoom"
        :trackLengthKm="track.length_km || 0"
        @marker-click="handleDistanceMarkerClick"
      />
      <TrackEndpoints
        v-if="track?.latlngs && track.latlngs.length >= 2"
        :startPosition="track.latlngs[0]"
        :endPosition="track.latlngs[track.latlngs.length - 1]"
        :isLoop="isTrackLoop"
        :startTime="track.recorded_at"
        :endTime="endTime"
        @marker-click="handleEndpointClick"
      />
      <LCircleMarker
        v-for="gap in segmentGapMarkers"
        :key="gap.id"
        :lat-lng="gap.position"
        :radius="6"
        color="#1f2937"
        fillColor="#ffffff"
        :fillOpacity="1"
        :weight="2"
      >
        <LTooltip :permanent="false">
          {{ gap.label }}<br />
          {{ gap.detail }}
        </LTooltip>
      </LCircleMarker>
      <LCircleMarker
        v-for="boundary in segmentBoundaryMarkers"
        :key="boundary.id"
        :lat-lng="boundary.position"
        :radius="5"
        :color="boundary.color"
        fillColor="#ffffff"
        :fillOpacity="1"
        :weight="2"
      >
        <LTooltip :permanent="false">
          {{ boundary.label }}
        </LTooltip>
      </LCircleMarker>
      
      <Toast
        :message="(toast.value && toast.value.message) || ''"
        :type="(toast.value && toast.value.type) || 'info'"
        :duration="(toast.value && toast.value.duration) || 3000"
      />
      <TrackDetailPanel 
        v-if="track"
        :track="track"
        :isOwner="isOwner"
        :sessionId="sessionId"
        @close="goHome"
        @description-updated="handleDescriptionUpdated"
        @name-updated="handleNameUpdated"
      />
    </TrackMap>
    <div v-if="track && polylines.length === 0" class="error-message">
      <h2>Loading track data...</h2>
      <p>Processing track geometry, please wait...</p>
    </div>
    <div v-if="!track && !loading" class="error-message">
      <h2>Track not found</h2>
      <p>The track you're looking for doesn't exist or has been removed.</p>
      <button @click="goHome" class="btn-home">Go to Home</button>
    </div>
  </div>
  <div v-else class="loading-container">
    <div class="loading-spinner">Loading track...</div>
  </div>
</template>

<script setup>
import { LCircleMarker, LPolyline, LTooltip } from '@vue-leaflet/vue-leaflet';
import { ref, onMounted, computed, provide, watch, onUnmounted, onActivated, onDeactivated, nextTick, shallowRef } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TrackMap from '../components/TrackMap.vue';
import Toast from '../components/Toast.vue';
import TrackDetailPanel from '../components/TrackDetailPanel.vue';
import PoiClusterGroup from '../components/PoiClusterGroup.vue';
import TrackEndpoints from '../components/TrackEndpoints.vue';
import TrackDistanceMarkers from '../components/TrackDistanceMarkers.vue';
import TrackDirectionLayer from '../components/TrackDirectionLayer.vue';
import { useToast } from '../composables/useToast';
import { useTracks } from '../composables/useTracks';
import { usePois } from '../composables/usePois';
import { useSearchState } from '../composables/useSearchState';
import { getSessionId } from '../utils/session';
import { useAdvancedDebounce } from '../composables/useAdvancedDebounce';
import { isLoopTrack } from '../utils/trackGeometry.js';
import { buildBoundaryMarkers, buildPauseGapLines, buildSegmentColors, buildSegmentGapMarkers } from '../utils/gapVisualization';
import '../styles/track-overlays.css';

// Define component name for keep-alive
defineOptions({
  name: 'TrackView'
});

// Simple color generation function
function getColorForId(id) {
  if (!id) return '#3498db';
  
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f'
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

function extractSegments(geomGeojson) {
  if (!geomGeojson || !geomGeojson.coordinates) return [];

  if (geomGeojson.type === 'MultiLineString') {
    return geomGeojson.coordinates.map(line => line.map(([lng, lat]) => [lat, lng]));
  }

  if (geomGeojson.type === 'LineString') {
    return [geomGeojson.coordinates.map(([lng, lat]) => [lat, lng])];
  }

  return [];
}

const router = useRouter();
const route = useRoute();

// Get id from route params
const trackId = computed(() => props.id || route.params.id);

// Props from router
const props = defineProps({
  id: {
    type: String,
    required: false
  }
});

// State
const loading = ref(true);
const track = shallowRef(null); // Use shallowRef for better performance
const sessionId = getSessionId();
const lastFetchZoom = ref(null); // Track last zoom used for fetching to avoid duplicates
const isInitialLoad = ref(true); // Track if this is the first load to prevent redundant fetches
const currentTrackId = ref(null); // Track current processing track ID to prevent race conditions
const mapStabilizationTimer = ref(null); // Timer to wait for map stabilization
const STABILIZATION_DELAY = 3000; // 3 seconds to wait for map auto-zoom to stabilize
const lastPoiFetchedTrackId = ref(null); // Track which track ID has had POIs fetched to prevent duplicates
const mapIsReady = ref(false); // Track if map is ready for POI clustering

// Use tracks composable
const { fetchTrackDetail } = useTracks();

// Use POIs composable
const { pois, fetchTrackPois } = usePois();

// Use search state to determine where to return
const { hasSearchState, restoreSearchState } = useSearchState();

// Debounced track fetching with zoom and mode support
const debouncedFetchTrack = useAdvancedDebounce(async (id, zoomLevel) => {
  try {
    // Always use the current route ID as the source of truth
    const currentRouteId = route.params.id;
    
    // Check if this request is still relevant (prevent race conditions)
    if (id !== currentRouteId) {
      console.log(`Skipping fetch for ${id} - current route track is ${currentRouteId}`);
      return;
    }

    // Use detail mode for track view with current zoom for optimal data
    const trackData = await fetchTrackDetail(id, zoomLevel, 'detail');
    
    // Double-check if this is still the current route track
    if (id !== route.params.id) {
      console.log(`Discarding fetch result for ${id} - current route track is ${route.params.id}`);
      return;
    }
    
    track.value = trackData;
    
    // Process track data to create latlngs (same logic as before)
    if (track.value) {
      const segments = extractSegments(track.value.geom_geojson);
      track.value.segments = segments;
      track.value.latlngs = segments.length > 0 ? segments[0] : [];

      // Fallback: if track has path field, use it
      if ((!track.value.latlngs || track.value.latlngs.length === 0) && track.value.path) {
        track.value.latlngs = track.value.path;
      }
      
      // Track positioning is handled entirely by TrackMap's fitBounds with trackBounds
      // and getDetailPanelFitBoundsOptions(). We don't set center/zoom here to avoid
      // conflicting with fitBounds which properly accounts for the detail panel.
      
      // Fetch POIs for this track (only once per track)
      if (track.value && track.value.id && lastPoiFetchedTrackId.value !== track.value.id) {
        console.log(`[TrackView] Fetching POIs for track ${track.value.id}`);
        lastPoiFetchedTrackId.value = track.value.id; // Mark as fetched
        fetchTrackPois(track.value.id).catch(err => {
          console.error('[TrackView] Failed to fetch POIs:', err);
          // Don't fail the whole view if POI fetch fails
        });
      }
    }
  } catch (error) {
    console.error('Failed to fetch track:', error);
    // Only clear track if this was for the current route track
    if (id === route.params.id) {
      track.value = null;
    }
  } finally {
    // Only update loading state if this was for the current route track
    if (id === route.params.id) {
      loading.value = false;
    }
  }
}, 300, { leading: false, trailing: true });

// Computed polylines for TrackMap (converted from track data)
const segmentColors = computed(() => buildSegmentColors(track.value?.segments?.length || (track.value?.latlngs ? 1 : 0)));

const polylines = computed(() => {
  if (!track.value) return [];

  const segments = track.value.segments || (track.value.latlngs ? [track.value.latlngs] : []);
  return segments.map((segment, index) => ({
    latlngs: segment,
    color: segmentColors.value[index] || getColorForId(track.value.id),
    properties: {
      id: track.value.id,
      name: track.value.name,
      description: track.value.description,
      categories: track.value.categories,
      length_km: track.value.length_km,
      duration_seconds: track.value.duration_seconds,
      elevation_gain: track.value.elevation_gain,
      elevation_loss: track.value.elevation_loss,
      max_speed: track.value.max_speed,
      avg_speed: track.value.avg_speed,
      created_at: track.value.created_at
    },
    showTooltip: false
  }));
});

const segmentGapMarkers = computed(() => buildSegmentGapMarkers(track.value?.segment_gaps));

const pauseGapLines = computed(() => buildPauseGapLines(track.value?.pause_gaps));

const segmentBoundaryMarkers = computed(() => {
  return buildBoundaryMarkers(track.value?.segments, segmentColors.value);
});

// Computed properties
const isOwner = computed(() => {
  if (!track.value) return false;
  return sessionId === track.value.session_id;
});

// Check if track is a loop (start and finish within 15m)
const isTrackLoop = computed(() => {
  const latlngs = track.value?.latlngs;
  if (!latlngs || latlngs.length < 2) return false;
  return isLoopTrack(latlngs);
});

// Compute endTime: try time_data last non-null entry, fallback to recorded_at + duration_seconds
const endTime = computed(() => {
  if (!track.value) return null;
  const tdata = track.value.time_data;
  if (Array.isArray(tdata) && tdata.length > 0) {
    for (let i = tdata.length - 1; i >= 0; i--) {
      if (tdata[i]) return tdata[i];
    }
  }
  if (track.value.recorded_at && track.value.duration_seconds) {
    try {
      const recorded = new Date(track.value.recorded_at);
      if (!isNaN(recorded.getTime())) {
        const end = new Date(recorded.getTime() + track.value.duration_seconds * 1000);
        return end.toISOString();
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
});

// Map settings
const zoom = ref(14);
const bounds = ref(null);
const markerLatLng = ref(null);
const url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Computed center based on track - avoids showing default St. Petersburg coordinates
const center = computed(() => {
  const segments = track.value?.segments || (track.value?.latlngs ? [track.value.latlngs] : []);
  const latlngs = segments.flat();
  if (!latlngs || latlngs.length === 0) return [0, 0];

  const trackBoundsData = calculateBounds(latlngs);
  if (!trackBoundsData) return [0, 0];

  return [
    (trackBoundsData.north + trackBoundsData.south) / 2,
    (trackBoundsData.east + trackBoundsData.west) / 2
  ];
});

// Computed bounds for track - padding is handled by TrackMap with getDetailPanelPadding()
const trackBounds = computed(() => {
  const segments = track.value?.segments || (track.value?.latlngs ? [track.value.latlngs] : []);
  const latlngs = segments.flat();
  if (!latlngs || latlngs.length === 0) return null;

  const bounds = calculateBounds(latlngs);
  if (!bounds) return null;

  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east]
  ];
});

// Toast
const { toast, showToast } = useToast();
provide('toast', toast);

async function fetchTrack(zoomLevel = null, forceTrackId = null) {
  // Use explicit track ID or current route track ID
  const id = forceTrackId || trackId.value;
  if (!id) {
    console.error('No track ID provided');
    track.value = null;
    loading.value = false;
    return;
  }
  
  // Prevent fetching if this track is already being processed
  if (currentTrackId.value === id && !isInitialLoad.value) {
    console.log(`Already processing track ${id}, skipping duplicate fetch`);
    return;
  }
  
  // Use debounced function for performance
  const currentZoom = zoomLevel || zoom.value || 10;
  const roundedZoom = Math.round(currentZoom);
  
  // Skip if same zoom was already fetched for current track (prevent duplicates)
  if (!isInitialLoad.value && lastFetchZoom.value === roundedZoom && currentTrackId.value === id) {
    console.log(`Skip duplicate fetch - zoom ${roundedZoom} already fetched for track ${id}`);
    return;
  }
  
  console.log(`Fetching track ${id} with zoom ${roundedZoom} for performance optimization`);
  currentTrackId.value = id; // Mark this track as being processed
  lastFetchZoom.value = roundedZoom;
  
  await debouncedFetchTrack(id, roundedZoom);
  
  // Start stabilization timer only on initial load to prevent zoom-triggered fetches
  if (isInitialLoad.value) {
    // Clear any existing timer
    if (mapStabilizationTimer.value) {
      clearTimeout(mapStabilizationTimer.value);
    }
    
    // Set timer to mark map as stabilized after delay
    mapStabilizationTimer.value = setTimeout(() => {
      isInitialLoad.value = false;
      console.log(`Map stabilization complete for track ${id}`);
    }, STABILIZATION_DELAY);
  } else {
    isInitialLoad.value = false; // Mark that initial load is complete for non-initial fetches
  }
}

function calculateBounds(latlngs) {
  if (!latlngs || latlngs.length === 0) return null;
  
  let north = -90, south = 90, east = -180, west = 180;
  
  latlngs.forEach(point => {
    const lat = point[0];
    const lng = point[1];
    
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  });
  
  return { north, south, east, west };
}

function onMapReady() {
  console.log('Map is ready');
  mapIsReady.value = true;
}

function handleCenterUpdate(newCenter) {
  // Center is now computed from track data, no need to update manually
  // The map's center is controlled by fitBounds with trackBounds
}

// Handle zoom updates for adaptive loading
const debouncedZoomUpdate = useAdvancedDebounce((newZoom, targetTrackId) => {
  // CRITICAL: Only process if this is still the current route track
  if (targetTrackId !== route.params.id) {
    console.log(`Skip zoom update for ${targetTrackId} - current route track is ${route.params.id}`);
    return;
  }
  
  // Only process if this is still the current track and not during initial load
  if (track.value?.id === targetTrackId && !isInitialLoad.value) {
    // Round zoom to prevent floating point precision issues
    const roundedZoom = Math.round(newZoom);
    
    // Skip if this zoom level was already fetched recently
    if (lastFetchZoom.value === roundedZoom) {
      console.log(`Skip refetch - zoom ${roundedZoom} already fetched`);
      return;
    }
    
    console.log(`Zoom changed to ${roundedZoom}, refetching track with adaptive detail`);
    fetchTrack(roundedZoom, targetTrackId); // Pass explicit track ID
  }
}, 1500, { leading: false, trailing: true }); // Increased delay to 1.5s to avoid refetch during auto-zoom

function handleZoomUpdate(newZoom) {
  const currentZoom = zoom.value;
  const roundedNewZoom = Math.round(newZoom);
  const roundedCurrentZoom = Math.round(currentZoom);
  
  // Always update zoom value
  zoom.value = newZoom;
  
  // Skip zoom-based fetching during initial load (auto-zoom phase)
  if (isInitialLoad.value) {
    console.log(`Skip zoom fetch during initial load/stabilization: ${roundedNewZoom}`);
    return;
  }
  
  // Only trigger fetch if zoom changed by at least 4 levels to reduce unnecessary requests
  if (Math.abs(roundedNewZoom - roundedCurrentZoom) >= 4) {
    console.log(`Significant zoom change: ${roundedCurrentZoom} -> ${roundedNewZoom}`);
    // Pass current route track ID to ensure we only update if it's still the current route
    const currentRouteTrackId = route.params.id;
    debouncedZoomUpdate(roundedNewZoom, currentRouteTrackId);
  } else {
    console.log(`Ignoring minor zoom change: ${roundedCurrentZoom} -> ${roundedNewZoom} (diff: ${Math.abs(roundedNewZoom - roundedCurrentZoom)})`);
  }
}

function goHome() {
  // Check if user came from search results
  if (hasSearchState()) {
    // Return to home page and restore search state
    router.push('/').then(() => {
      // Use nextTick to ensure the HomeView is mounted before restoring search
      nextTick(() => {
        restoreSearchState();
      });
    });
  } else {
    // Regular return to home page
    router.push('/');
  }
}

// Handle ESC key to exit track details
function handleKeyDown(event) {
  if (event.key === 'Escape') {
    // Only handle ESC if we're not in an input field or modal
    const activeElement = document.activeElement;
    const isInInput = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );
    
    if (!isInInput) {
      event.preventDefault();
      goHome();
    }
  }
}



// Handle track elevation updates from TrackDetailPanel
function handleTrackElevationUpdated(event) {
  const { 
    trackId, 
    elevation_gain, 
    elevation_loss, 
    elevation_min, 
    elevation_max, 
    elevation_dataset, 
    elevation_profile, 
    elevation_enriched_at 
  } = event.detail;
  
  // Only update if this is the current track
  if (track.value && track.value.id === trackId) {
    console.info(`[TrackView] Updating elevation data for track ${trackId}`);
    
    // Create a new track object to trigger reactivity with shallowRef
    track.value = {
      ...track.value,
      elevation_enriched: true,
      elevation_gain,
      elevation_loss,
      elevation_min,
      elevation_max,
      elevation_dataset,
      elevation_profile,
      elevation_enriched_at: elevation_enriched_at || new Date().toISOString()
    };
    
    console.info(`[TrackView] Track object updated, new elevation_gain: ${track.value.elevation_gain}`);
  }
}

function handleDescriptionUpdated(newDescription) {
  if (track.value) {
    track.value.description = newDescription;
    showToast('Description updated successfully', 'success');
  }
}

function handleNameUpdated(newName) {
  if (track.value) {
    track.value.name = newName;
    showToast('Track name updated successfully', 'success');
  }
}

function handlePoiClick(poi) {
  console.log('[TrackView] POI clicked:', poi);
  // You can add more functionality here, like showing a popup with POI details
  const poiData = poi.poi || poi;
  const name = poiData.name || 'Unknown POI';
  const description = poiData.description || '';
  const category = poiData.category || '';
  
  let message = `${name}`;
  if (category) message += ` (${category})`;
  if (description) message += `: ${description}`;
  
  showToast(message, 'info', 5000);
}

function handleDistanceMarkerClick(data) {
  console.log('[TrackView] Distance marker clicked:', data);
  const distanceKm = data.distanceKm;
  if (distanceKm < 1) {
    showToast(`${Math.round(distanceKm * 1000)} m from start`, 'info', 3000);
  } else {
    showToast(`${distanceKm} km from start`, 'info', 3000);
  }
}

function handleEndpointClick(data) {
  console.log('[TrackView] Endpoint clicked:', data);
  const { type, position } = data;
  
  if (type === 'loop') {
    showToast('Start / Finish (loop track)', 'info', 3000);
  } else if (type === 'start') {
    showToast('Start point', 'info', 3000);
  } else if (type === 'finish') {
    showToast('Finish point', 'info', 3000);
  }
}

// Initialize
onMounted(async () => {
  const currentRouteId = route.params.id;
  console.log('TrackView mounted, trackId:', currentRouteId);
  
  // Only fetch if this component should handle this track and it's not already being processed
  // AND if the track hasn't been fetched by route watcher already
  if (currentRouteId && currentRouteId !== currentTrackId.value && !track.value) {
    await fetchTrack(null, currentRouteId); // Pass explicit track ID
  }
  
  // Add ESC key listener
  document.addEventListener('keydown', handleKeyDown);
  // Add track elevation update listener
  window.addEventListener('track-elevation-updated', handleTrackElevationUpdated);
});

// Cleanup on unmount
onUnmounted(() => {
  // Remove ESC key listener
  document.removeEventListener('keydown', handleKeyDown);
  // Remove track elevation update listener
  window.removeEventListener('track-elevation-updated', handleTrackElevationUpdated);
  
  // Clear stabilization timer
  if (mapStabilizationTimer.value) {
    clearTimeout(mapStabilizationTimer.value);
    mapStabilizationTimer.value = null;
  }
});

// Handle keep-alive activation
onActivated(() => {
  // Add ESC key listener when component is activated from keep-alive
  document.addEventListener('keydown', handleKeyDown);
  // Add track elevation update listener
  window.addEventListener('track-elevation-updated', handleTrackElevationUpdated);
});

// Handle keep-alive deactivation
onDeactivated(() => {
  // Remove ESC key listener when component is deactivated to keep-alive
  document.removeEventListener('keydown', handleKeyDown);
  // Remove track elevation update listener
  window.removeEventListener('track-elevation-updated', handleTrackElevationUpdated);
  
  // Clear stabilization timer
  if (mapStabilizationTimer.value) {
    clearTimeout(mapStabilizationTimer.value);
    mapStabilizationTimer.value = null;
  }
});

// Handle route changes for keep-alive
watch(() => route.params.id, async (newId, oldId) => {
  if (newId && newId !== oldId) {
    console.log(`Route changed from ${oldId} to ${newId}, preparing for new track`);
    
    // Cancel any pending debounced operations for old track
    debouncedFetchTrack.cancel();
    debouncedZoomUpdate.cancel();
    
    // Reset state for new track
    lastFetchZoom.value = null;
    isInitialLoad.value = true;
    currentTrackId.value = newId; // Set this immediately to prevent race with onMounted
    lastPoiFetchedTrackId.value = null; // Reset POI fetch tracking for new track
    mapIsReady.value = false; // Reset map ready state for new track
    // Center is computed from track data, no need to reset
    loading.value = true; // Set loading state
    
    // Clear stabilization timer for old track
    if (mapStabilizationTimer.value) {
      clearTimeout(mapStabilizationTimer.value);
      mapStabilizationTimer.value = null;
    }
    
    // Small delay to ensure route is fully updated
    await nextTick();
    
    // Fetch new track with explicit ID
    if (newId === route.params.id) { // Double-check route hasn't changed again
      await fetchTrack(null, newId);
    }
  }
}, { immediate: false });
</script>

<style scoped>
.app-container {
  position: relative;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  /* Optimize rendering performance */
  will-change: auto;
  transform: translateZ(0); /* Force hardware acceleration */
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  background: #f5f5f5;
}

.loading-spinner {
  font-size: 18px;
  color: #666;
}

.error-message {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  background: #f5f5f5;
  text-align: center;
  padding: 20px;
}

.error-message h2 {
  color: #333;
  margin-bottom: 10px;
}

.error-message p {
  color: #666;
  margin-bottom: 20px;
}

.btn-home {
  background: #2196f3;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s;
}

.btn-home:hover {
  background: #1976d2;
}
</style>
