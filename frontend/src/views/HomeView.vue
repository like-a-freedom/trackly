<template>
  <div class="app-container">
    <TrackMap
      v-if="mapReadyToShow"
      key="home-map"
      :polylines="polylines"
      :zoom="zoom"
      :center="center"
      :markerLatLng="markerLatLng"
      :url="url"
      :attribution="attribution"
      :activeTrackId="activeTrackId"
      :selectedTrackDetail="null" 
      @mapReady="onMapReady"
      @update:center="handleCenterUpdate"
      @update:zoom="handleZoomUpdate"
      @update:bounds="onBoundsUpdate"
      @trackClick="onTrackClick"
      @trackMouseOver="onTrackMouseOver"
      @trackMouseMove="onTrackMouseMove"
      @trackMouseOut="onTrackMouseOut"
      @open-search="openSearch"
    >
      <TrackTooltip
        :visible="tooltip.visible && !!tooltip.data"
        :x="tooltip.x"
        :y="tooltip.y"
        :data="tooltip.data"
      />
      <div class="upload-form-container">
        <div class="collapsible-upload" :class="{ 'expanded': uploadFormExpanded }">
          <!-- Collapsed state: compact upload button -->
          <div 
            v-if="!uploadFormExpanded" 
            class="upload-button-compact"
            @click="toggleUploadForm"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
            :class="{ 'drag-active': dragActive }"
            title="Upload track file"
          >
            <svg class="upload-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              <path d="M12,11L16,15H13V19H11V15H8L12,11Z" />
            </svg>
          </div>
          
          <!-- Expanded state: full upload form -->
          <div v-if="uploadFormExpanded" class="upload-form-expanded">
            <div class="upload-form-header">
              <span class="upload-form-title">Upload Track</span>
              <button 
                class="collapse-button"
                @click="toggleUploadForm"
                title="Collapse upload form"
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
                </svg>
              </button>
            </div>
            <UploadForm 
              @upload="handleUpload" 
              @uploaded="handleUploadCompleted" 
              :dragActive="dragActive" 
              @update:dragActive="dragActive = $event" 
            />
          </div>
        </div>
      </div>
      
      <Toast
        :message="(toast.value && toast.value.message) || ''"
        :type="(toast.value && toast.value.type) || 'info'"
        :duration="(toast.value && toast.value.duration) || 3000"
      />

    </TrackMap>
    <TrackSearch
      :isVisible="searchVisible"
      @close="closeSearch"
      @track-selected="onTrackSelected"
    />
  </div>
</template>

<script setup>
// Import the logic from App.vue
import { ref, reactive, watch, shallowRef, computed, provide, onActivated, onDeactivated, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import TrackMap from '../components/TrackMap.vue';
import TrackTooltip from '../components/TrackTooltip.vue';
import UploadForm from '../components/UploadForm.vue';
import Toast from '../components/Toast.vue';
import TrackSearch from '../components/TrackSearch.vue';
import { useTracks } from '../composables/useTracks';
import { useToast } from '../composables/useToast';
import { useSearchState } from '../composables/useSearchState';
import { getSessionId } from '../utils/session';
import { useAdvancedDebounce, useThrottle } from '../composables/useAdvancedDebounce';

// Define component name for keep-alive
defineOptions({
  name: 'HomeView'
});

const router = useRouter();

const url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const attribution = '&copy; <a target="_blank" href="http://osm.org/copyright">OpenStreetMap</a> contributors';

// Load saved map position or use defaults
const savedPosition = loadMapPosition();
const zoom = shallowRef(savedPosition?.zoom || 11);
const center = shallowRef(savedPosition?.center || [56.04028, 37.83185]);

const pendingZoomRestore = ref(null);
const markerLatLng = ref(center.value);
const bounds = ref(null);
const dragActive = ref(false);
const uploadFormExpanded = ref(false); // По умолчанию свернута
const { polylines, fetchTracksInBounds, uploadTrack, error, updateTrackInPolylines } = useTracks();
const tooltip = reactive({ visible: false, x: 0, y: 0, data: null });
const { showToast, toast } = useToast();
const { clearSearchState, searchResults, searchQuery, hasSearchState } = useSearchState();
const activeTrackId = ref(null);
const sessionId = getSessionId();

// Search state
const searchVisible = ref(false);

// Map position persistence
const MAP_POSITION_STORAGE_KEY = 'trackly_map_position';

function saveMapPosition(centerValue, zoomValue) {
  try {
    const position = {
      center: centerValue,
      zoom: zoomValue,
      timestamp: Date.now()
    };
    localStorage.setItem(MAP_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch (error) {
    console.warn('[HomeView] Failed to save map position:', error);
  }
}

function loadMapPosition() {
  try {
    const stored = localStorage.getItem(MAP_POSITION_STORAGE_KEY);
    if (!stored) return null;
    
    const position = JSON.parse(stored);
    
    // Validate stored position
    if (!position || 
        !Array.isArray(position.center) || 
        position.center.length !== 2 ||
        typeof position.zoom !== 'number' ||
        typeof position.center[0] !== 'number' ||
        typeof position.center[1] !== 'number' ||
        isNaN(position.center[0]) || 
        isNaN(position.center[1]) ||
        isNaN(position.zoom) ||
        position.center[0] === null ||
        position.center[1] === null ||
        position.zoom === null) {
      return null;
    }
    
    return position;
  } catch (error) {
    console.warn('[HomeView] Failed to load map position:', error);
    return null;
  }
}

// Debounced and throttled functions for performance
// Increased debounce to 500ms to reduce multiple requests as recommended in optimization spec
const debouncedFetchTracks = useAdvancedDebounce((bounds) => {
  hideTooltip();
  // Pass current zoom level for backend optimization
  const options = { 
    zoom: zoom.value, 
    mode: 'overview' // Use overview mode for track lists
  };
  fetchTracksInBounds(bounds, options);
}, 500, { leading: false, trailing: true, maxWait: 1000 });

const throttledTooltipUpdate = useThrottle((event) => {
  updateTooltipPosition(event);
}, 16); // ~60fps

// Debounced function to save map position
const debouncedSavePosition = useAdvancedDebounce(() => {
  saveMapPosition(center.value, zoom.value);
}, 1000, { leading: false, trailing: true }); // Save after 1 second of inactivity



// --- Map gating logic ---
function isValidLatLng(val) {
  return Array.isArray(val) && val.length === 2 &&
    typeof val[0] === 'number' && typeof val[1] === 'number' &&
    !isNaN(val[0]) && !isNaN(val[1]);
}
function isValidZoom(val) {
  return typeof val === 'number' && !isNaN(val);
}
const mapReadyToShow = computed(() => isValidLatLng(center.value) && isValidZoom(zoom.value));
// --- End gating logic ---

// Provide toast for child components
provide('toast', toast);

// Clear tooltip state when component is activated (returning from keep-alive)
onActivated(() => {
  // Clear any lingering tooltip state
  hideTooltip();
  
  // Check if we need to restore search state (returning from track details)
  if (hasSearchState()) {
    openSearch();
  }
});

// Clear tooltip state when component is deactivated (going to keep-alive)
onDeactivated(() => {
  // Clear tooltip state to prevent it from appearing when returning
  hideTooltip();
  // Save current map position when component is deactivated
  saveMapPosition(center.value, zoom.value);
});

watch(error, (val) => {
  if (val) showToast('Error: ' + val, 'error');
});

// Clear tooltip when navigating away from this route
watch(() => router.currentRoute.value.path, (newPath) => {
  if (newPath !== '/') {
    // Clear tooltip when leaving home page
    hideTooltip();
    // Save current map position when leaving home page
    saveMapPosition(center.value, zoom.value);
  }
});

function onMapReady(e) {
  const map = e.target || e;
  bounds.value = map.getBounds();
  const options = { 
    zoom: zoom.value, 
    mode: 'overview' 
  };
  fetchTracksInBounds(bounds.value, options);
}

function onBoundsUpdate(newBounds) {
  // Update bounds immediately for visual responsiveness
  bounds.value = newBounds;
  
  // Use debounced function for API calls
  debouncedFetchTracks(newBounds);
}

async function onTrackClick(poly, event) {
  // Clear search state when clicking track on map (not from search)
  clearSearchState();
  
  // Navigate to track detail route instead of opening details here
  const id = poly.properties && poly.properties.id;
  if (id) {
    router.push(`/track/${id}`);
  }
}

function onTrackMouseOver(poly, event) {
  tooltip.data = poly.properties;
  updateTooltipPosition(event);
  tooltip.visible = true;
  activeTrackId.value = poly.properties && poly.properties.id;
}

function onTrackMouseMove(event) { 
  throttledTooltipUpdate(event);
}

function onTrackMouseOut(event) {
  // Check if the mouse is moving to another interactive layer or outside the map
  const relatedTarget = event.originalEvent ? event.originalEvent.relatedTarget : event.relatedTarget;
  if (!relatedTarget || !relatedTarget.closest('.leaflet-interactive')) {
    hideTooltip();
  }
}

// Helper function to hide tooltip consistently
function hideTooltip() {
  // Cancel any pending debounced operations
  if (debouncedFetchTracks.pending()) {
    // Don't cancel track fetching, just clean tooltip
  }
  
  tooltip.visible = false;
  tooltip.data = null;
  tooltip.x = 0;
  tooltip.y = 0;
  activeTrackId.value = null;
}

function updateTooltipPosition(event) {
  const offsetX = 18, offsetY = 12;
  let x = event.originalEvent ? event.originalEvent.clientX : event.clientX;
  let y = event.originalEvent ? event.originalEvent.clientY : event.clientY;
  tooltip.x = x + offsetX;
  tooltip.y = y + offsetY;
}

function refreshTracks() {
  if (bounds.value) {
    const options = { 
      zoom: zoom.value, 
      mode: 'overview',
      forceRefresh: true // Force refresh to bypass cache
    };
    fetchTracksInBounds(bounds.value, options);
  }
}

async function handleUpload({ file, name, categories }) {
  try {
    await uploadTrack({ file, name, categories });
    showToast('Track uploaded successfully!', 'success');
    refreshTracks();
  } catch (e) {
    showToast('Upload error: ' + e.message, 'error');
  }
}

function handleUploadCompleted() {
  refreshTracks();
  // Не сворачиваем автоматически - пользователь сам решает
}

function toggleUploadForm() {
  uploadFormExpanded.value = !uploadFormExpanded.value;
}

function handleDragOver(event) {
  event.preventDefault();
  dragActive.value = true;
  // Форма уже развернута по умолчанию
}

function handleDragLeave(event) {
  event.preventDefault();
  dragActive.value = false;
}

function handleDrop(event) {
  event.preventDefault();
  dragActive.value = false;
  // Форма уже развернута по умолчанию
  // Forward the drop event to the UploadForm component if expanded
  // The UploadForm will handle the file processing
}

function handleZoomUpdate(val) {
  // Only update if valid
  if (isValidZoom(val)) {
    zoom.value = val;
    // Save position to localStorage with debouncing
    debouncedSavePosition();
  }
}

function handleCenterUpdate(val) {
  // Only update if valid
  if (isValidLatLng(val)) {
    center.value = val;
    // Save position to localStorage with debouncing
    debouncedSavePosition();
  }
}



// Search functions
function openSearch() {
  searchVisible.value = true;
}

function closeSearch() {
  searchVisible.value = false;
  // Don't clear search state when manually closing search
}

async function onTrackSelected(track) {
  // Don't need to save search state here - it's already managed by TrackSearch component
  // The search state is already saved when search is performed
  
  // Navigate to track detail route
  router.push(`/track/${track.id}`);
  closeSearch();
}

// Track deletion handling
function removeTrackLocally(id) {
  if (!id) return;
  // Remove matching polylines
  polylines.value = polylines.value.filter(p => p.properties?.id !== id);
}

// Track update handling
function handleTrackNameUpdated(event) {
  const { trackId, newName } = event.detail || {};
  if (trackId && newName) {
    updateTrackInPolylines(trackId, { name: newName });
  }
}

function handleTrackDescriptionUpdated(event) {
  const { trackId, newDescription } = event.detail || {};
  if (trackId) {
    updateTrackInPolylines(trackId, { description: newDescription });
  }
}

function handleTrackDeleted(event) {
  const id = event.detail?.id;
  removeTrackLocally(id);
  // Optionally refetch for consistency (cheap because bbox filtered)
  refreshTracks();
  // Clear any active tooltip related to removed track
  if (activeTrackId.value === id) {
    hideTooltip();
  }
}

// Save map position before page unload
function handleBeforeUnload() {
  saveMapPosition(center.value, zoom.value);
}

onMounted(() => {
  window.addEventListener('track-deleted', handleTrackDeleted);
  window.addEventListener('track-name-updated', handleTrackNameUpdated);
  window.addEventListener('track-description-updated', handleTrackDescriptionUpdated);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('track-deleted', handleTrackDeleted);
  window.removeEventListener('track-name-updated', handleTrackNameUpdated);
  window.removeEventListener('track-description-updated', handleTrackDescriptionUpdated);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  // Save final position before unmounting
  saveMapPosition(center.value, zoom.value);
});
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
}

/* Hide Leaflet Ukraine flag */
.leaflet-control-attribution .leaflet-attribution-flag {
  display: none !important;
}

/* Additional selectors to ensure flag is hidden */
.leaflet-attribution-flag,
.leaflet-control-attribution a[href*="ukraine"],
.leaflet-control-attribution img[alt*="ukraine"],
.leaflet-control-attribution img[src*="ukraine"] {
  display: none !important;
}

.app-container {
  height: 100vh;
  width: 100vw;
  position: relative;
  /* Optimize rendering performance */
  will-change: transform, opacity;
  transform: translateZ(0); /* Force hardware acceleration */
  backface-visibility: hidden;
  /* Optimize font rendering */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.upload-form-container {
  /* Fix visibility on mobile Safari: pin to viewport and respect safe areas */
  position: fixed;
  right: 16px;
  bottom: 16px;
  /* iOS safe area support (older constant() first, then env()) */
  right: calc(16px + constant(safe-area-inset-right));
  right: calc(16px + env(safe-area-inset-right));
  bottom: calc(16px + constant(safe-area-inset-bottom));
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 2000; /* Above map panes and controls */
  /* Optimize for smooth animations */
  will-change: transform;
  backface-visibility: hidden;
  /* Remove any inherited sizing */
  width: auto;
  height: auto;
  padding: 0;
  background: none;
  box-shadow: none;
  border-radius: 0;
  pointer-events: auto;
}

.collapsible-upload {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 6px;
  /* Adaptive sizing */
  width: auto;
  height: auto;
}

.collapsible-upload.expanded {
  /* Стили фона и теней теперь применяются к .upload-form-expanded */
  border-radius: 8px;
}

/* Compact upload button styles */
.upload-button-compact {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.08);
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  color: #666;
  /* Ensure visibility across different zoom levels */
  position: relative;
  z-index: 1100;
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
}

.upload-button-compact:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.upload-button-compact.drag-active {
  border-color: #2196f3;
  background: rgba(227, 242, 253, 0.95);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.25);
}

.upload-icon {
  width: 24px;
  height: 24px;
  color: #1976d2;
  transition: color 0.2s;
}

.upload-button-compact:hover .upload-icon {
  color: #1565c0;
}

/* Expanded form styles */
.upload-form-expanded {
  width: 320px;
  min-width: 210px;
  max-width: 320px;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  animation: expandForm 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
  font-size: 0.87rem;
}

@keyframes expandForm {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.upload-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e5e5;
}

.upload-form-title {
  font-size: 0.87rem;
  font-weight: 500;
  color: #333;
}

.collapse-button {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  transition: all 0.2s;
  padding: 0;
}

.collapse-button:hover {
  background: #f5f5f5;
  color: #333;
}

.collapse-button svg {
  width: 18px;
  height: 18px;
}

/* Responsive design for smaller screens - matching other components */
@media (max-width: 640px) {
  .upload-form-container {
  /* Safe-area aware offsets on small screens */
  right: calc(12px + constant(safe-area-inset-right));
  right: calc(12px + env(safe-area-inset-right));
  bottom: calc(12px + constant(safe-area-inset-bottom));
  bottom: calc(12px + env(safe-area-inset-bottom));
  }
  
  .upload-button-compact {
    width: 44px; /* Same as other buttons */
    height: 44px;
    border-radius: 10px;
    /* Solid background for better visibility */
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .upload-icon {
    width: 22px; /* Match other icons */
    height: 22px;
    color: #1976d2 !important;
  }
  
  .upload-form-expanded {
    min-width: 260px;
    max-width: calc(100vw - 32px);
  }
}

/* Safari-specific mobile fixes */
@supports (-webkit-appearance: none) {
  @media (max-width: 640px) {
    .upload-button-compact {
      /* Force visibility in Safari mobile with solid background */
      background: #ffffff !important;
      backdrop-filter: none !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      /* Prevent Safari rendering issues */
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      /* Ensure proper layer composition */
      isolation: isolate;
    }
    
    .upload-button-compact .upload-icon {
      /* Make icon more prominent in Safari */
      color: #1976d2 !important;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
    }
  }
}
</style>
