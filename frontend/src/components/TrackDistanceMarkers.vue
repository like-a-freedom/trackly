<template>
  <LMarker
    v-for="marker in visibleMarkers"
    :key="marker.id"
    :lat-lng="marker.position"
    :options="{ interactive: false }"
  >
    <LIcon
      :icon-url="dotIconUrl"
      :icon-size="[8, 8]"
      :icon-anchor="[4, 4]"
      :class-name="'km-dot'"
    />
  </LMarker>
  <!-- Labels as separate markers for better positioning -->
  <LMarker
    v-for="marker in visibleMarkers"
    :key="`label-${marker.id}`"
    :lat-lng="marker.position"
    @click="handleMarkerClick(marker)"
  >
    <LIcon
      :icon-url="getLabelIconUrl(marker.distanceKm)"
      :icon-size="[40, 16]"
      :icon-anchor="[-6, 8]"
      :class-name="'km-label'"
    />
  </LMarker>
</template>

<script setup>
import { computed, watch } from 'vue';
import { LMarker, LIcon, LTooltip } from '@vue-leaflet/vue-leaflet';
import { 
  computeDistanceMarkers, 
  getMarkerInterval
} from '../utils/trackGeometry.js';

const props = defineProps({
  latlngs: {
    type: Array,
    required: true,
    default: () => []
  },
  trackId: {
    type: String,
    required: true
  },
  zoom: {
    type: Number,
    required: true
  },
  trackLengthKm: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['marker-click']);

// Determine if markers should be shown based on zoom
const shouldShow = computed(() => {
  return props.zoom > 10 && props.trackLengthKm >= 0.1; // At least 100m
});

// Calculate marker interval based on zoom and track length
const interval = computed(() => {
  if (!shouldShow.value) return 0;
  return getMarkerInterval(props.zoom, props.trackLengthKm);
});

// Compute marker positions
const markers = computed(() => {
  if (!props.latlngs || props.latlngs.length < 2 || interval.value <= 0) {
    return [];
  }
  
  return computeDistanceMarkers(
    props.latlngs,
    interval.value,
    100 // Max markers
  ).map(m => ({
    ...m,
    id: `${props.trackId}-${m.id}`
  }));
});

// Visible markers (filtered by shouldShow)
const visibleMarkers = computed(() => {
  if (!shouldShow.value) return [];
  return markers.value;
});

// Simple dot icon (white circle with dark border)
const dotIconUrl = computed(() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="8" height="8">
    <circle cx="4" cy="4" r="3" fill="#fff" stroke="#333" stroke-width="1.5"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
});

// Generate label icon (text with background)
function getLabelIconUrl(distanceKm) {
  const label = formatDistanceLabel(distanceKm);
  const width = label.length * 7 + 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 16" width="${width}" height="16">
    <rect x="0" y="0" width="${width}" height="16" rx="3" fill="rgba(255,255,255,0.92)" stroke="#ccc" stroke-width="0.5"/>
    <text x="${width/2}" y="12" text-anchor="middle" fill="#333" font-size="11" font-weight="500" font-family="system-ui, -apple-system, sans-serif">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Format distance for label
function formatDistanceLabel(distanceKm) {
  if (distanceKm >= 1) {
    return `${distanceKm} km`;
  }
  return `${Math.round(distanceKm * 1000)} m`;
}

// Handle marker click
function handleMarkerClick(marker) {
  emit('marker-click', {
    distanceKm: marker.distanceKm,
    position: marker.position
  });
}
</script>

<style scoped>
/* Import shared styles */
@import '../styles/track-overlays.css';
</style>
