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
import { ref, reactive, watch, shallowRef, computed, provide, onActivated, onDeactivated } from 'vue';
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

// Define component name for keep-alive
defineOptions({
  name: 'HomeView'
});

const router = useRouter();

const url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const attribution = '&copy; <a target="_blank" href="http://osm.org/copyright">OpenStreetMap</a> contributors';
const zoom = shallowRef(11);
const pendingZoomRestore = ref(null);
const center = shallowRef([56.04028, 37.83185]);
const markerLatLng = ref(center.value);
const bounds = ref(null);
const dragActive = ref(false);
const uploadFormExpanded = ref(false); // По умолчанию свернута
const { polylines, fetchTracksInBounds, uploadTrack, error } = useTracks();
const tooltip = reactive({ visible: false, x: 0, y: 0, data: null });
const { showToast, toast } = useToast();
const { clearSearchState, searchResults, searchQuery, hasSearchState } = useSearchState();
const activeTrackId = ref(null);
const sessionId = getSessionId();

// Search state
const searchVisible = ref(false);

// Tooltip timeout for better performance
let tooltipTimeout = null;



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
});

watch(error, (val) => {
  if (val) showToast('Error: ' + val, 'error');
});

// Clear tooltip when navigating away from this route
watch(() => router.currentRoute.value.path, (newPath) => {
  if (newPath !== '/') {
    // Clear tooltip when leaving home page
    hideTooltip();
  }
});

function onMapReady(e) {
  const map = e.target || e;
  bounds.value = map.getBounds();
  fetchTracksInBounds(bounds.value);
}

function onBoundsUpdate(newBounds) {
  // Update bounds immediately for visual responsiveness
  bounds.value = newBounds;
  
  // Clear and restart tooltip timeout
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
  }
  
  // Debounce only the API call, with very short delay
  tooltipTimeout = setTimeout(() => {
    hideTooltip();
    fetchTracksInBounds(newBounds);
  }, 50); // Very short debounce for smooth experience
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
  updateTooltipPosition(event); 
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
  // Clear any pending tooltip timeout
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
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
  if (bounds.value) fetchTracksInBounds(bounds.value);
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
  if (isValidZoom(val)) zoom.value = val;
}

function handleCenterUpdate(val) {
  // Only update if valid
  if (isValidLatLng(val)) center.value = val;
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
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
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
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
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

/* Responsive design for smaller screens */
@media (max-width: 480px) {
  .upload-form-container {
    bottom: 16px;
    right: 16px;
  }
  
  .upload-form-expanded {
    min-width: 260px;
    max-width: calc(100vw - 32px);
  }
}
</style>
