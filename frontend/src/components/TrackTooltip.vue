<template>
  <div
    v-if="visible && data"
    class="custom-tooltip"
    :style="{ left: x + 'px', top: y + 'px', position: 'fixed', zIndex: 2000 }"
  >
    <div class="upload-form">
      <div
        v-if="data.name"
        class="upload-label name"
      >
        {{ data.name }}
      </div>
      <div
        v-if="data.description"
        class="upload-label description"
      >
        {{ data.description }}
      </div>
      <div
        v-if="data.length_km"
        class="upload-label"
      >
        Distance: {{ data.length_km.toFixed(2) }} km
      </div>
      <div
        v-if="data.recorded_at"
        class="upload-label meta"
      >
        Recorded: {{ formatDateTime(data.recorded_at) }}
      </div>
      <div
        v-if="data.created_at"
        class="upload-label meta"
      >
        Added: {{ formatDateTime(data.created_at) }}
      </div>
      <div
        v-if="data.updated_at"
        class="upload-label meta"
      >
        Updated: {{ formatDateTime(data.updated_at) }}
      </div>
      <div v-if="data.elevation_gain">
        <div
          v-if="data.elevation_gain"
          class="upload-label"
        >
          Elevation gain: {{ Math.round(data.elevation_gain) }} m
        </div>
        <div
          v-if="data.elevation_dataset"
          class="upload-label"
        >
          Data source: {{ formatDataset(data.elevation_dataset) }}
        </div>
      </div>
      <div
        v-if="data.categories && data.categories.length"
        class="upload-label categories-section"
      >
        Categories:
        <span class="category-tags">
          <span
            v-for="cat in data.categories"
            :key="cat"
            class="category-tag"
          >{{ capitalize(cat) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from 'vue';
import { formatDateTime } from '../utils/format';
import { capitalize } from '../utils/string';

interface TrackData {
  name?: string;
  description?: string;
  length_km?: number;
  recorded_at?: string;
  created_at?: string;
  updated_at?: string;
  elevation_gain?: number;
  elevation_dataset?: string;
  categories?: string[];
}

interface Props {
  visible: boolean;
  x: number;
  y: number;
  data: TrackData | null;
}

const props = defineProps<Props>();
const { visible, x, y, data } = toRefs(props);

// Format dataset name for display
function formatDataset(dataset: string | undefined): string {
  if (!dataset) return 'Unknown';

  // Handle common dataset names
  const datasetNames: Record<string, string> = {
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
  color: var(--color-ink);
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

/* Metric rows: distance, elevation, dates. Distances and elevations are
   read against each other, so they get tabular figures — proportional
   digits make two values of equal length look different widths. */
.upload-label {
  font-size: var(--text-xs);
  margin-bottom: 4px;
  line-height: var(--leading-snug);
  padding: 0 1px;
  overflow-wrap: break-word;
  font-variant-numeric: tabular-nums;
}
.upload-label:last-child { margin-bottom: 0; }
.upload-label.name {
  font-weight: var(--weight-bold);
  font-size: var(--text-md);
  line-height: var(--leading-tight);
  text-wrap: balance;
  margin-top: 4px;
  margin-bottom: 4px;
  font-variant-numeric: normal;
}
.upload-label.description {
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: #444;
  margin-bottom: 10px;
  text-wrap: pretty;
}
.upload-label.meta {
  font-size: var(--text-xs);
  color: var(--color-muted);
  margin-bottom: 4px;
}
.upload-label.categories-section {
  margin-bottom: 4px;
  margin-top: 8px;
}
.upload-label.share-section {
  margin-top: 8px;
  margin-bottom: 4px;
}
.category-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-inline-start: 4px;
  vertical-align: middle;
}
.category-tag {
  display: inline-block;
  background: #e3f2fd;
  color: var(--accent);
  border-radius: 6px;
  padding: 2px 10px 2px 8px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 1.3;
  border: 1px solid #bbdefb;
  box-shadow: 0 1px 2px rgba(25,118,210,0.04);
  user-select: none;
  white-space: nowrap;
  transition: background 0.18s, color 0.18s;
}
.category-tag:hover {
  background: #bbdefb;
  color: var(--accent-active);
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
