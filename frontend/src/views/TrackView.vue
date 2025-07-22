<template>
  <div class="app-container" v-if="!loading">
    <TrackMap
      v-if="track && polylines.length > 0"
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
      @update:bounds="onBoundsUpdate"
      @trackClick="onTrackClick"
    >
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
import { ref, onMounted, computed, provide, watch, onUnmounted, onActivated, onDeactivated, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TrackMap from '../components/TrackMap.vue';
import Toast from '../components/Toast.vue';
import TrackDetailPanel from '../components/TrackDetailPanel.vue';
import { useToast } from '../composables/useToast';
import { useTracks } from '../composables/useTracks';
import { useSearchState } from '../composables/useSearchState';
import { getSessionId } from '../utils/session';

// Define component name for keep-alive
defineOptions({
  name: 'TrackView'
});

// Simple color generation function
function getColorForId(id) {
  if (!id) return '#3498db';
  
  // Convert id to a hash
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate a color from the hash
  const colors = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f'
  ];
  
  return colors[Math.abs(hash) % colors.length];
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
const track = ref(null);
const sessionId = getSessionId();
const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

// Use tracks composable
const { fetchTrackDetail } = useTracks();

// Use search state to determine where to return
const { hasSearchState, restoreSearchState } = useSearchState();

// Computed polylines for TrackMap (converted from track data)
const polylines = computed(() => {
  if (!track.value || !track.value.latlngs) return [];
  
  return [{
    latlngs: track.value.latlngs,
    color: getColorForId(track.value.id), // Generate color based on track ID
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
  }];
});

// Computed properties
const isOwner = computed(() => {
  if (!track.value) return false;
  return sessionId === track.value.session_id;
});

// Map settings
const zoom = ref(14);
const center = ref([59.9311, 30.3609]);
const bounds = ref(null);
const markerLatLng = ref(null);
const url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Computed bounds for track with detail panel compensation
const trackBounds = computed(() => {
  // Only depend on track geometry data, not name/description to avoid unnecessary map repositioning
  const latlngs = track.value?.latlngs;
  if (!latlngs || latlngs.length === 0) {
    return null;
  }
  
  const bounds = calculateBounds(latlngs);
  if (!bounds) return null;
  
  // Calculate padding based on viewport and detail panel
  const viewportWidth = windowWidth.value;
  const viewportHeight = windowHeight.value;
  
  // Detail panel is a bottom flyout that takes ~50-80% of screen height
  const detailPanelHeight = Math.min(viewportHeight * 0.8, 600); // Max 80vh or 600px
  const effectiveMapHeight = viewportHeight - detailPanelHeight;
  
  // Calculate padding as percentage of track bounds
  const latRange = bounds.north - bounds.south;
  const lngRange = bounds.east - bounds.west;
  
  // Base padding: 10% of the track bounds
  const basePadding = 0.1;
  
  // Additional padding to compensate for detail panel (push track up)
  const latPaddingRatio = detailPanelHeight / effectiveMapHeight;
  const additionalLatPadding = latRange * latPaddingRatio * 0.3; // 30% of the panel height ratio
  
  const latPadding = latRange * basePadding;
  const lngPadding = lngRange * basePadding;
  
  return [
    [bounds.south - latPadding - additionalLatPadding, bounds.west - lngPadding],
    [bounds.north + latPadding, bounds.east + lngPadding]
  ];
});

// Toast
const { toast, showToast } = useToast();
provide('toast', toast);

async function fetchTrack() {
  try {
    loading.value = true;
    const id = trackId.value;
    
    if (!id) {
      console.error('No track ID provided');
      track.value = null;
      return;
    }
    
    const trackData = await fetchTrackDetail(id);
    
    if (!trackData) {
      console.log('Track not found for ID:', id);
      track.value = null;
      return;
    }
    
    // Use processed track data directly
    track.value = trackData;
    
    // Extract latlngs from geom_geojson if available
    if (track.value.geom_geojson && track.value.geom_geojson.coordinates) {
      if (track.value.geom_geojson.type === 'LineString') {
        track.value.latlngs = track.value.geom_geojson.coordinates.map(([lng, lat]) => [lat, lng]);
      } else if (track.value.geom_geojson.type === 'MultiLineString') {
        // Take the first line if it's a MultiLineString
        track.value.latlngs = track.value.geom_geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
      }
    }
    // Fallback: if track has path field, use it
    else if (track.value.path && !track.value.latlngs) {
      track.value.latlngs = track.value.path;
    }
    
    // Map bounds will be automatically calculated by trackBounds computed property

  } catch (error) {
    console.error('Error fetching track:', error);
    track.value = null;
  } finally {
    loading.value = false;
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
}

function handleCenterUpdate(newCenter) {
  center.value = newCenter;
}

function handleZoomUpdate(newZoom) {
  zoom.value = newZoom;
}

function onBoundsUpdate() {
  // Handle bounds update if needed
}

function onTrackClick() {
  // Already on track detail page
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

// Handle window resize to update bounds calculation
function handleResize() {
  windowWidth.value = window.innerWidth;
  windowHeight.value = window.innerHeight;
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

// Initialize
onMounted(async () => {
  console.log('TrackView mounted, trackId:', trackId.value);
  await fetchTrack();
  
  // Add ESC key listener
  document.addEventListener('keydown', handleKeyDown);
  // Add window resize listener
  window.addEventListener('resize', handleResize);
});

// Cleanup on unmount
onUnmounted(() => {
  // Remove ESC key listener
  document.removeEventListener('keydown', handleKeyDown);
  // Remove window resize listener
  window.removeEventListener('resize', handleResize);
});

// Handle keep-alive activation
onActivated(() => {
  // Add ESC key listener when component is activated from keep-alive
  document.addEventListener('keydown', handleKeyDown);
  // Add window resize listener
  window.addEventListener('resize', handleResize);
});

// Handle keep-alive deactivation
onDeactivated(() => {
  // Remove ESC key listener when component is deactivated to keep-alive
  document.removeEventListener('keydown', handleKeyDown);
  // Remove window resize listener
  window.removeEventListener('resize', handleResize);
});

// Handle route changes for keep-alive
watch(() => route.params.id, async (newId) => {
  if (newId && newId !== track.value?.id) {
    console.log('Route changed, fetching new track:', newId);
    await fetchTrack();
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
