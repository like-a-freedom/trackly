<template>
  <div class="track-editor-sidebar" :class="{ collapsed }">
    <div class="sidebar-mobile-bar">
      <span class="mobile-bar-title">Editor panel</span>
      <button
        class="btn-icon-sm"
        data-testid="toggle-sidebar-btn"
        @click="$emit('toggleCollapse')"
      >
        {{ collapsed ? "▲" : "▼" }}
      </button>
    </div>
    <!-- Draft recovery banner -->
    <div v-if="showDraftBanner" class="draft-banner" data-testid="draft-banner">
      <p>An unsaved draft was found. Restore it?</p>
      <div class="draft-actions">
        <button class="btn-primary btn-sm" @click="$emit('restoreDraft')">
          Restore
        </button>
        <button class="btn-secondary btn-sm" @click="$emit('deleteDraft')">
          Delete
        </button>
      </div>
    </div>

    <!-- Error display -->
    <div v-if="error" class="error-banner" data-testid="error-banner">
      <p>{{ error }}</p>
    </div>

    <div v-if="totalPoints < 2" class="info-banner" data-testid="editor-tips">
      <p>
        Click on the map to add points. Use F1–F4 to switch modes and Ctrl+Z/Y
        for undo/redo.
      </p>
    </div>

    <!-- Metadata form -->
    <section class="sidebar-section">
      <h3 class="section-title">Track metadata</h3>
      <div class="form-group">
        <label for="track-name" class="form-label">
          Name <span class="required">*</span>
        </label>
        <input
          id="track-name"
          type="text"
          class="form-input"
          :value="trackName"
          maxlength="255"
          placeholder="Enter track name"
          data-testid="track-name-input"
          @input="$emit('update:trackName', $event.target.value)"
        />
        <span class="char-count">{{ trackName.length }} / 255</span>
      </div>

      <div class="form-group">
        <label for="track-desc" class="form-label">Description</label>
        <textarea
          id="track-desc"
          class="form-input form-textarea"
          :value="trackDescription"
          maxlength="5000"
          rows="3"
          placeholder="Route description (optional)"
          data-testid="track-desc-input"
          @input="$emit('update:trackDescription', $event.target.value)"
        />
        <span class="char-count">{{ trackDescription.length }} / 5000</span>
      </div>

      <div class="form-group">
        <label class="form-label">Categories</label>
        <div class="category-chips">
          <label
            v-for="cat in availableCategories"
            :key="cat.id"
            class="category-chip"
            :class="{ selected: trackCategories.includes(cat.id) }"
            :data-testid="`category-chip-${cat.id}`"
          >
            <input
              type="checkbox"
              :value="cat.id"
              :checked="trackCategories.includes(cat.id)"
              @change="handleCategoryToggle(cat.id)"
            />
            <span>{{ cat.icon }} {{ cat.label }}</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Segments list -->
    <section class="sidebar-section">
      <div class="section-header">
        <h3 class="section-title">Segments</h3>
        <button
          class="btn-icon"
          title="New segment (Ctrl+S)"
          data-testid="add-segment-btn"
          @click="$emit('addSegment')"
        >
          ＋
        </button>
      </div>
      <ul class="segment-list">
        <li
          v-for="(stat, i) in segmentStats"
          :key="i"
          class="segment-item"
          :class="{ active: i === activeSegmentIndex }"
          data-testid="segment-item"
          @click="$emit('setActiveSegment', i)"
        >
          <span class="segment-color" :style="{ background: stat.color }" />
          <span class="segment-info">
            {{ stat.displayName }}
            <small
              >{{ stat.pointCount }} points ·
              {{ formatDistance(stat.distanceKm) }}</small
            >
            <div class="segment-meta">
              <input
                class="form-input segment-name-input"
                type="text"
                :value="stat.name"
                :placeholder="`Day ${i + 1}`"
                maxlength="80"
                @click.stop
                @input="$emit('updateSegmentName', i, $event.target.value)"
              />
              <input
                class="segment-color-input"
                type="color"
                :value="stat.color"
                @click.stop
                @input="$emit('updateSegmentColor', i, $event.target.value)"
              />
            </div>
          </span>
          <div class="segment-actions">
            <button
              v-if="i < segmentStats.length - 1"
              class="btn-icon-sm"
              title="Merge with next (Ctrl+J)"
              data-testid="join-segment-btn"
              @click.stop="$emit('joinSegments', i, i + 1)"
            >
              ⇋
            </button>
            <button
              class="btn-icon-sm"
              title="Reverse"
              @click.stop="$emit('reverseSegment', i)"
            >
              ↔
            </button>
            <button
              class="btn-icon-sm danger"
              title="Delete segment"
              @click.stop="$emit('deleteSegment', i)"
            >
              ✕
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Fragment actions -->
    <section
      v-if="fragmentInfo"
      class="sidebar-section"
      data-testid="fragment-section"
    >
      <div class="section-header">
        <h3 class="section-title">Fragment tools</h3>
        <button
          class="btn-icon-sm"
          title="Clear selection"
          data-testid="fragment-clear-btn"
          @click="$emit('clearFragment')"
        >
          ✕
        </button>
      </div>
      <p class="fragment-meta">
        Segment {{ fragmentInfo.segIndex + 1 }} · Points:
        {{ fragmentInfo.points }}
        <span v-if="!fragmentInfo.complete"> · Select end point</span>
      </p>
      <div class="fragment-actions" v-if="fragmentInfo.complete">
        <button
          class="btn-secondary btn-sm"
          data-testid="fragment-reroute-btn"
          @click="$emit('rerouteFragment')"
        >
          Reroute
        </button>
        <button
          class="btn-secondary btn-sm"
          data-testid="fragment-delete-connect-btn"
          @click="$emit('deleteFragmentConnect')"
        >
          Delete + Connect
        </button>
        <button
          class="btn-secondary btn-sm"
          data-testid="fragment-delete-split-btn"
          @click="$emit('deleteFragmentSplit')"
        >
          Delete + Split
        </button>
        <button
          class="btn-secondary btn-sm"
          data-testid="fragment-reverse-btn"
          @click="$emit('reverseFragment')"
        >
          Reverse
        </button>
      </div>
    </section>

    <!-- POI list -->
    <section
      v-if="pois.length > 0"
      class="sidebar-section"
      data-testid="poi-section"
    >
      <div class="section-header">
        <h3 class="section-title">POI ({{ pois.length }})</h3>
      </div>
      <ul class="poi-list">
        <li
          v-for="(poi, i) in pois"
          :key="i"
          class="poi-item"
          data-testid="poi-item"
        >
          <span class="poi-icon">📍</span>
          <span class="poi-info">
            {{ poi.name || `POI ${i + 1}` }}
            <small v-if="poi.description">{{ poi.description }}</small>
            <small v-if="poi.distFromStart"
              >📏 {{ formatDistanceM(poi.distFromStart) }} from start</small
            >
            <small v-if="poi.isFarFromTrack" class="poi-warning"
              >⚠️ >1 km from track</small
            >
          </span>
          <button
            class="btn-icon-sm danger"
            title="Delete POI"
            @click.stop="$emit('deletePoi', i)"
          >
            ✕
          </button>
        </li>
      </ul>
    </section>

    <!-- Elevation profile -->
    <section class="sidebar-section" data-testid="elevation-section">
      <div class="section-header">
        <h3 class="section-title">Elevation profile</h3>
      </div>
      <div v-if="elevationLoading" class="elevation-status">
        Loading profile...
      </div>
      <div v-else-if="elevationError" class="elevation-status error">
        {{ elevationError }}
      </div>
      <ElevationChart
        v-else
        :elevationData="elevationProfile"
        :elevationStats="elevationStats"
        :totalDistance="totalDistanceKm"
        :coordinateData="coordinateData"
        chartMode="elevation"
        @chart-point-hover="$emit('chart-point-hover', $event)"
        @chart-point-leave="$emit('chart-point-leave', $event)"
        @chart-point-click="$emit('chart-point-click', $event)"
      />
    </section>

    <!-- Track optimizer -->
    <section class="sidebar-section" data-testid="optimizer-section">
      <div class="section-header">
        <h3 class="section-title">Track optimizer</h3>
      </div>
      <p class="optimizer-meta">Keep {{ optimizerPercent }}% of points</p>
      <input
        type="range"
        min="1"
        max="100"
        step="1"
        class="optimizer-range"
        :value="optimizerPercent"
        :disabled="totalPoints < 2"
        @input="handleOptimizerRatioInput"
      />
      <div class="optimizer-stats" v-if="optimizerStats">
        <span>
          Points: {{ optimizerStats.originalPoints }} →
          {{ optimizerStats.simplifiedPoints }}
        </span>
        <span>
          {{ Math.round((optimizerStats.compressionRatio || 0) * 100) }}%
        </span>
        <span>
          Tolerance: {{ optimizerStats.toleranceUsed?.toFixed(1) || 0 }} m
        </span>
      </div>
      <div v-if="optimizerLoading" class="optimizer-status">
        Building preview...
      </div>
      <div v-else-if="optimizerError" class="optimizer-status error">
        {{ optimizerError }}
      </div>
      <div class="optimizer-actions">
        <button
          class="btn-secondary btn-sm"
          :disabled="optimizerLoading || totalPoints < 2"
          data-testid="optimizer-preview-btn"
          @click="$emit('previewOptimization')"
        >
          Preview
        </button>
        <button
          class="btn-secondary btn-sm"
          :disabled="!hasOptimizerPreview"
          data-testid="optimizer-apply-btn"
          @click="$emit('applyOptimization')"
        >
          Apply
        </button>
        <button
          class="btn-secondary btn-sm"
          :disabled="!hasOptimizerPreview"
          data-testid="optimizer-clear-btn"
          @click="$emit('clearOptimization')"
        >
          Cancel
        </button>
        <button
          class="btn-secondary btn-sm"
          :disabled="!hasOptimizerPreview"
          data-testid="optimizer-download-btn"
          @click="$emit('downloadOptimization')"
        >
          Download GeoJSON
        </button>
      </div>
    </section>

    <!-- Summary -->
    <section
      class="sidebar-section summary-section"
      data-testid="track-summary"
    >
      <div class="summary-row">
        <span>Distance</span>
        <strong>{{ formatDistance(totalDistanceKm) }}</strong>
      </div>
      <div class="summary-row">
        <span>Time (estimate)</span>
        <strong>{{ timeDisplay }}</strong>
      </div>
      <div class="summary-row">
        <span>Points</span>
        <strong>{{ totalPoints }}</strong>
      </div>
      <div class="summary-row">
        <span>Segments</span>
        <strong>{{ segmentStats.length }}</strong>
      </div>
      <div v-if="pois.length > 0" class="summary-row">
        <span>POI</span>
        <strong>{{ pois.length }}</strong>
      </div>
      <div class="summary-row">
        <span>Loop</span>
        <button
          class="btn-secondary btn-sm"
          data-testid="loop-btn"
          @click="$emit('closeLoop')"
        >
          Close loop
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
const OPTIMIZER_DEFAULT_RATIO = 0.1;

const props = defineProps({
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  error: { type: String, default: null },
  showDraftBanner: { type: Boolean, default: false },
  pois: { type: Array, default: () => [] },
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
  coordinateData: { type: Array, default: () => [] },
  collapsed: { type: Boolean, default: false },
  fragmentSelection: { type: Object, default: () => ({}) },
  optimizerTargetRatio: { type: Number, default: OPTIMIZER_DEFAULT_RATIO },
  optimizerPreview: { type: Object, default: null },
  optimizerStats: { type: Object, default: null },
  optimizerLoading: { type: Boolean, default: false },
  optimizerError: { type: String, default: null },
});

const emit = defineEmits([
  "update:trackName",
  "update:trackDescription",
  "update:trackCategories",
  "updateSegmentName",
  "updateSegmentColor",
  "addSegment",
  "deleteSegment",
  "reverseSegment",
  "setActiveSegment",
  "joinSegments",
  "restoreDraft",
  "deleteDraft",
  "deletePoi",
  "toggleCollapse",
  "clearFragment",
  "deleteFragmentConnect",
  "deleteFragmentSplit",
  "reverseFragment",
  "rerouteFragment",
  "closeLoop",
  "update:optimizerTargetRatio",
  "previewOptimization",
  "applyOptimization",
  "clearOptimization",
  "downloadOptimization",
  "chart-point-hover",
  "chart-point-leave",
  "chart-point-click",
]);

const availableCategories = [
  { id: "hiking", label: "Hiking", icon: "🥾" },
  { id: "walking", label: "Walking", icon: "🚶" },
  { id: "running", label: "Running", icon: "🏃" },
  { id: "cycling", label: "Cycling", icon: "🚴" },
];

const fragmentInfo = computed(() => {
  const sel = props.fragmentSelection || {};
  if (
    sel.segIndex === null ||
    sel.segIndex === undefined ||
    sel.startIdx === null ||
    sel.startIdx === undefined
  ) {
    return null;
  }
  const end = sel.endIdx;
  const complete = end !== null && end !== undefined;
  const lo = complete ? Math.min(sel.startIdx, end) : sel.startIdx;
  const hi = complete ? Math.max(sel.startIdx, end) : sel.startIdx;
  const points = complete ? hi - lo + 1 : 1;
  return {
    segIndex: sel.segIndex,
    startIdx: lo,
    endIdx: complete ? hi : null,
    complete,
    points,
  };
});

function handleCategoryToggle(catId) {
  const current = [...props.trackCategories];
  const index = current.indexOf(catId);
  if (index >= 0) {
    current.splice(index, 1);
  } else {
    current.push(catId);
  }
  emit("update:trackCategories", current);
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

function formatDistanceM(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const optimizerPercent = computed(() => {
  const ratio = props.optimizerTargetRatio ?? OPTIMIZER_DEFAULT_RATIO;
  return Math.round(ratio * 100);
});

const hasOptimizerPreview = computed(() => {
  return !!(props.optimizerPreview && props.optimizerPreview.segments?.length);
});

function handleOptimizerRatioInput(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) return;
  emit("update:optimizerTargetRatio", value / 100);
}

import { computed } from "vue";
import ElevationChart from "./ElevationChart.vue";

const timeDisplay = computed(() => {
  const mins = props.estimatedTimeMinutes;
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
});
</script>

<style scoped>
.track-editor-sidebar {
  width: 320px;
  min-width: 280px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.sidebar-mobile-bar {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}

.mobile-bar-title {
  font-weight: 600;
  font-size: 12px;
  color: #444;
}

.draft-banner {
  background: #fff3e0;
  border-bottom: 1px solid #ffe0b2;
  padding: 10px 12px;
}

.draft-banner p {
  margin: 0 0 8px;
  font-size: 13px;
  color: #e65100;
}

.draft-actions {
  display: flex;
  gap: 8px;
}

.error-banner {
  background: #fce4ec;
  border-bottom: 1px solid #ef9a9a;
  padding: 10px 12px;
  color: #c62828;
}

.error-banner p {
  margin: 0;
}

.info-banner {
  background: #e8f0fe;
  border-bottom: 1px solid #c7d7fb;
  padding: 10px 12px;
  font-size: 12px;
  color: #1a4fa3;
}

.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px;
}

.form-group {
  margin-bottom: 10px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #555;
  margin-bottom: 4px;
}

.required {
  color: #d32f2f;
}

.form-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  color: #333;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #1976d2;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.category-chip input {
  display: none;
}

.category-chip:hover {
  border-color: #1976d2;
}

.category-chip.selected {
  background: #e8f0fe;
  border-color: #1976d2;
  color: #1565c0;
}

.segment-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.segment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.segment-item:hover {
  background: #f5f5f5;
}

.segment-item.active {
  background: #e8f0fe;
}

.segment-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.segment-info {
  flex: 1;
  min-width: 0;
}

.segment-info small {
  display: block;
  color: #888;
  font-size: 11px;
}

.segment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.segment-name-input {
  padding: 4px 6px;
  font-size: 11px;
}

.segment-color-input {
  width: 26px;
  height: 26px;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0;
  background: #fff;
}

.segment-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.segment-item:hover .segment-actions {
  opacity: 1;
}

.btn-icon {
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  line-height: 1;
}

.btn-icon:hover {
  background: #e8f0fe;
}

.btn-icon-sm {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 2px;
  color: #666;
}

.btn-icon-sm:hover {
  background: #e0e0e0;
}

.btn-icon-sm.danger:hover {
  background: #fce4ec;
  color: #c62828;
}

.btn-primary {
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-secondary {
  background: #eee;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-sm {
  padding: 4px 10px;
}

.summary-section {
  background: #fafafa;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  color: #555;
}

.summary-row strong {
  color: #333;
}

.fragment-meta {
  font-size: 12px;
  color: #555;
  margin: 4px 0 8px;
}

.fragment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.poi-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.poi-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.poi-item:hover {
  background: #f5f5f5;
}

.poi-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.poi-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.poi-info small {
  display: block;
  color: #888;
  font-size: 11px;
}

.poi-warning {
  color: #d32f2f;
  font-weight: 600;
}

.elevation-status {
  font-size: 12px;
  color: #555;
  padding: 6px 0;
}

.elevation-status.error {
  color: #c62828;
}

.optimizer-meta {
  font-size: 12px;
  color: #555;
  margin: 4px 0 8px;
}

.optimizer-range {
  width: 100%;
  margin-bottom: 8px;
}

.optimizer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.optimizer-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #555;
  margin: 6px 0;
}

.optimizer-status {
  font-size: 12px;
  color: #555;
}

.optimizer-status.error {
  color: #c62828;
}

@media (max-width: 640px) {
  .track-editor-sidebar {
    width: 100%;
    min-width: 0;
    border-left: none;
    border-top: 1px solid #e0e0e0;
    max-height: 40vh;
  }

  .sidebar-mobile-bar {
    display: flex;
  }

  .track-editor-sidebar.collapsed {
    max-height: 44px;
    overflow: hidden;
  }

  .track-editor-sidebar.collapsed .sidebar-section,
  .track-editor-sidebar.collapsed .draft-banner,
  .track-editor-sidebar.collapsed .error-banner,
  .track-editor-sidebar.collapsed .info-banner {
    display: none;
  }
}

@media (pointer: coarse) {
  .btn-icon,
  .btn-icon-sm,
  .btn-primary,
  .btn-secondary {
    padding: 6px 10px;
    font-size: 13px;
  }

  .form-input {
    padding: 8px 10px;
    font-size: 14px;
  }
}
</style>
