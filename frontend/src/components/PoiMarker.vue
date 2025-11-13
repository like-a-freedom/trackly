<template>
  <LMarker
    v-if="coordinates && coordinates.length === 2"
    :lat-lng="coordinates"
    @click="handleClick"
  >
    <LIcon
      :icon-url="iconUrl"
      :icon-size="iconSize"
      :icon-anchor="iconAnchor"
      :class-name="iconClassName"
    />
    <LTooltip v-if="showTooltip">
      <div class="poi-tooltip">
        <div class="poi-name">{{ poi.poi?.name || poi.name }}</div>
        <div v-if="poi.poi?.description || poi.description" class="poi-description">
          {{ poi.poi?.description || poi.description }}
        </div>
        <div class="poi-meta">
          <span v-if="poi.poi?.category || poi.category" class="poi-category">
            {{ poi.poi?.category || poi.category }}
          </span>
          <span v-if="poi.poi?.elevation || poi.elevation" class="poi-elevation">
            {{ formatElevation(poi.poi?.elevation || poi.elevation) }}
          </span>
          <span v-if="poi.distance_from_start_m !== null && poi.distance_from_start_m !== undefined" class="poi-distance">
            {{ formatDistance(poi.distance_from_start_m) }}
          </span>
        </div>
      </div>
    </LTooltip>
  </LMarker>
</template>

<script setup>
import { computed } from 'vue';
import { LMarker, LIcon, LTooltip } from '@vue-leaflet/vue-leaflet';

const props = defineProps({
  poi: {
    type: Object,
    required: true,
  },
  showTooltip: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['click']);

// Extract coordinates from GeoJSON geometry
const coordinates = computed(() => {
  const geom = props.poi.poi?.geom || props.poi.geom;
  if (!geom) return null;
  
  // GeoJSON format: [lon, lat]
  // Leaflet format: [lat, lon]
  if (geom.type === 'Point' && geom.coordinates && geom.coordinates.length === 2) {
    return [geom.coordinates[1], geom.coordinates[0]];
  }
  return null;
});

// Icon configuration
const iconUrl = computed(() => {
  const category = (props.poi.poi?.category || props.poi.category || 'generic').toLowerCase();
  // Use a simple marker icon - you can customize this based on category
  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="8" fill="#ff6b6b" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="3" fill="#fff"/>
    </svg>
  `)}`;
});

const iconSize = computed(() => [32, 32]);
const iconAnchor = computed(() => [16, 32]);
const iconClassName = computed(() => 'poi-marker');

function handleClick() {
  emit('click', props.poi);
}

function formatElevation(elevation) {
  if (elevation === null || elevation === undefined) return '';
  return `${Math.round(elevation)}m`;
}

function formatDistance(distance) {
  if (distance === null || distance === undefined) return '';
  if (distance < 1000) {
    return `${Math.round(distance)}m from start`;
  }
  return `${(distance / 1000).toFixed(1)}km from start`;
}
</script>

<style scoped>
.poi-tooltip {
  font-family: system-ui, -apple-system, sans-serif;
  min-width: 150px;
}

.poi-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  color: #2c3e50;
}

.poi-description {
  font-size: 12px;
  color: #555;
  margin-bottom: 6px;
  line-height: 1.4;
}

.poi-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: #666;
}

.poi-category {
  background: #e3f2fd;
  padding: 2px 6px;
  border-radius: 3px;
  color: #1976d2;
}

.poi-elevation {
  background: #f3e5f5;
  padding: 2px 6px;
  border-radius: 3px;
  color: #7b1fa2;
}

.poi-distance {
  background: #e8f5e9;
  padding: 2px 6px;
  border-radius: 3px;
  color: #388e3c;
}

:deep(.poi-marker) {
  z-index: 600 !important;
}
</style>
