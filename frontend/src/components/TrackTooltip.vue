<template>
  <div v-if="visible && data" class="custom-tooltip" :style="{ left: x + 'px', top: y + 'px', position: 'fixed', zIndex: 2000 }">
    <div class="upload-form">
      <div v-if="data.name" class="upload-label name">{{ data.name }}</div>
      <div v-if="data.description" class="upload-label description">{{ data.description }}</div>
      <div v-if="data.length_km" class="upload-label">Distance: {{ data.length_km.toFixed(2) }} km</div>
      <div v-if="data.recorded_at" class="upload-label meta">Recorded: {{ formatDateTime(data.recorded_at) }}</div>
      <div v-if="data.created_at" class="upload-label meta">Added: {{ formatDateTime(data.created_at) }}</div>
      <div v-if="data.updated_at" class="upload-label meta">Updated: {{ formatDateTime(data.updated_at) }}</div>
      <div v-if="data.elevation_gain">
        <div v-if="data.elevation_gain" class="upload-label">Elevation gain: {{ Math.round(data.elevation_gain) }} m</div>
        <div v-if="data.elevation_dataset" class="upload-label">Data source: {{ formatDataset(data.elevation_dataset) }}</div>
      </div>
      <div v-if="data.categories && data.categories.length" class="upload-label categories-section">
        Categories:
        <span class="category-tags">
          <span v-for="cat in data.categories" :key="cat" class="category-tag">{{ cat }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
<script setup>
import { toRefs } from 'vue';
const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  data: Object
});
const { visible, x, y, data } = toRefs(props);

// Format date and time in 24-hour format
function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  try {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false // Force 24-hour format
    };
    return new Date(dateString).toLocaleString(undefined, options);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

// Format dataset name for display
function formatDataset(dataset) {
  if (!dataset) return 'Unknown';
  
  // Handle common dataset names
  const datasetNames = {
    'original_gpx': 'Original GPX',
    'original': 'Original',
    'aster30m': 'ASTER 30m',
    'srtm30m': 'SRTM 30m',
    'srtm90m': 'SRTM 90m',
    'mapzen': 'Mapzen',
    'eudem25m': 'EU-DEM 25m',
    'ned10m': 'NED 10m',
    'open-elevation': 'Open-Elevation'
  };
  
  return datasetNames[dataset] || dataset.charAt(0).toUpperCase() + dataset.slice(1);
}
</script>
<style scoped>
.custom-tooltip {
  position: fixed;
  background: rgba(255,255,255,0.98);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.18);
  padding: 10px 16px 12px 16px; /* increased padding for better spacing */
  color: #222;
  font-size: 15px;
  min-width: 260px;
  max-width: 500px;
  width: auto;
  min-height: unset; /* remove fixed min-height */
  max-height: 440px;
  height: auto;
  white-space: normal;
  border: 1px solid #e0e0e0;
  opacity: 0.98;
  z-index: 2000;
  left: 0;
  top: 0;
  box-sizing: border-box;
  transition: opacity 0.22s;
  overflow-y: auto;
  overflow-x: hidden;
}
.custom-tooltip > div { pointer-events: none; }
.upload-form { background: none; box-shadow: none; border-radius: 0; padding: 0; gap: 0; height: auto; }
.upload-label {
  font-size: 13px;
  margin-bottom: 4px; /* increased space between attributes */
  line-height: 1.35; /* more readable line height */
  padding: 0 1px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.upload-label:last-child { margin-bottom: 0; }
.upload-label.name {
  font-weight: 600;
  font-size: 16px;
  margin-top: 4px; /* more space from top */
  margin-bottom: 10px; /* more space below header */
}
.upload-label.description {
  font-size: 14px;
  color: #444;
  margin-bottom: 10px; /* more space below description */
}
.upload-label.meta {
  font-size: 13px;
  color: #000000;
  margin-bottom: 4px;
}
.upload-label.categories-section {
  margin-bottom: 4px;
  margin-top: 4px;
}
.upload-label.share-section {
  margin-top: 8px;
  margin-bottom: 4px;
}
.category-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: 4px;
  vertical-align: middle;
}
.category-tag {
  display: inline-block;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 6px;
  padding: 2px 10px 2px 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  border: 1px solid #bbdefb;
  box-shadow: 0 1px 2px rgba(25,118,210,0.04);
  user-select: none;
  transition: background 0.18s, color 0.18s;
}
.category-tag:hover {
  background: #bbdefb;
  color: #0d47a1;
}
@media (max-width: 600px) {
  .custom-tooltip {
    font-size: 13px;
    min-width: 200px;
    max-width: 95vw;
    width: auto;
    padding: 8px 12px 10px 12px;
    height: auto;
    min-height: unset;
    max-height: 350px;
    overflow-x: hidden;
  }
}
</style>
