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
    <TrackEditorInspectorOverview
      :show-draft-banner="showDraftBanner"
      :error="error"
      :total-points="totalPoints"
      :track-name="trackName"
      :track-description="trackDescription"
      :track-categories="trackCategories"
      @restore-draft="$emit('restoreDraft')"
      @delete-draft="$emit('deleteDraft')"
      @update:track-name="$emit('update:trackName', $event)"
      @update:track-description="$emit('update:trackDescription', $event)"
      @update:track-categories="$emit('update:trackCategories', $event)"
    />

    <TrackEditorInspectorSegments
      :segment-stats="segmentStats"
      :active-segment-index="activeSegmentIndex"
      :highlighted-segment-index="highlightedSegmentIndex"
      @add-segment="$emit('addSegment')"
      @set-active-segment="$emit('setActiveSegment', $event)"
      @hover-segment="$emit('hoverSegment', $event)"
      @leave-segment="$emit('leaveSegment')"
      @update-segment-name="$emit('updateSegmentName', ...$event)"
      @update-segment-color="$emit('updateSegmentColor', ...$event)"
      @join-segments="$emit('joinSegments', ...$event)"
      @new-track-from-segment="$emit('newTrackFromSegment', $event)"
      @reverse-segment="$emit('reverseSegment', $event)"
      @delete-segment="$emit('deleteSegment', $event)"
    />

    <TrackEditorInspectorTrackActions
      @duplicate-track="$emit('duplicateTrack')"
      @reverse-track="$emit('reverseTrack')"
    />

    <TrackEditorInspectorFragmentTools
      :fragment-info="fragmentInfo"
      @clear-fragment="$emit('clearFragment')"
      @reroute-fragment="$emit('rerouteFragment')"
      @delete-fragment-connect="$emit('deleteFragmentConnect')"
      @delete-fragment-split="$emit('deleteFragmentSplit')"
      @reverse-fragment="$emit('reverseFragment')"
      @export-fragment="$emit('exportFragment')"
    />

    <TrackEditorInspectorPois
      :pois="pois"
      @delete-poi="$emit('deletePoi', $event)"
      @update-poi="$emit('updatePoi', ...$event)"
    />

    <TrackEditorInspectorElevation
      :elevation-profile="elevationProfile"
      :elevation-stats="elevationStats"
      :total-distance-km="totalDistanceKm"
      :coordinate-data="coordinateData"
      :elevation-loading="elevationLoading"
      :elevation-error="elevationError"
      @chart-point-hover="$emit('chart-point-hover', $event)"
      @chart-point-leave="$emit('chart-point-leave', $event)"
      @chart-point-click="$emit('chart-point-click', $event)"
    />

    <TrackEditorInspectorOptimizer
      :optimizer-target-ratio="optimizerTargetRatio"
      :optimizer-preview="optimizerPreview"
      :optimizer-stats="optimizerStats"
      :optimizer-loading="optimizerLoading"
      :optimizer-error="optimizerError"
      :total-points="totalPoints"
      @update:optimizer-target-ratio="
        $emit('update:optimizerTargetRatio', $event)
      "
      @preview-optimization="$emit('previewOptimization')"
      @apply-optimization="$emit('applyOptimization')"
      @clear-optimization="$emit('clearOptimization')"
      @download-optimization="$emit('downloadOptimization')"
    />

    <TrackEditorInspectorSummary
      :total-distance-km="totalDistanceKm"
      :estimated-time-minutes="estimatedTimeMinutes"
      :total-points="totalPoints"
      :segment-count="segmentStats.length"
      :poi-count="pois.length"
      @close-loop="$emit('closeLoop')"
      @close-loop-same-way="$emit('closeLoopSameWay')"
      @close-loop-different-route="$emit('closeLoopDifferentRoute')"
    />
  </div>
</template>

<script setup>
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
  optimizerTargetRatio: { type: Number, default: 0.1 },
  optimizerPreview: { type: Object, default: null },
  optimizerStats: { type: Object, default: null },
  optimizerLoading: { type: Boolean, default: false },
  optimizerError: { type: String, default: null },
  highlightedSegmentIndex: { type: Number, default: null },
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
  "updatePoi",
  "toggleCollapse",
  "clearFragment",
  "deleteFragmentConnect",
  "deleteFragmentSplit",
  "reverseFragment",
  "rerouteFragment",
  "closeLoop",
  "closeLoopSameWay",
  "closeLoopDifferentRoute",
  "exportFragment",
  "reverseTrack",
  "duplicateTrack",
  "newTrackFromSegment",
  "update:optimizerTargetRatio",
  "previewOptimization",
  "applyOptimization",
  "clearOptimization",
  "downloadOptimization",
  "chart-point-hover",
  "chart-point-leave",
  "chart-point-click",
  "hoverSegment",
  "leaveSegment",
]);

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

import { computed } from "vue";
import TrackEditorInspectorElevation from "./editor/TrackEditorInspectorElevation.vue";
import TrackEditorInspectorFragmentTools from "./editor/TrackEditorInspectorFragmentTools.vue";
import TrackEditorInspectorOptimizer from "./editor/TrackEditorInspectorOptimizer.vue";
import TrackEditorInspectorOverview from "./editor/TrackEditorInspectorOverview.vue";
import TrackEditorInspectorPois from "./editor/TrackEditorInspectorPois.vue";
import TrackEditorInspectorSegments from "./editor/TrackEditorInspectorSegments.vue";
import TrackEditorInspectorSummary from "./editor/TrackEditorInspectorSummary.vue";
import TrackEditorInspectorTrackActions from "./editor/TrackEditorInspectorTrackActions.vue";
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

.segment-item.highlighted {
  background: #fff9c4;
  box-shadow: inset 3px 0 0 #ffd600;
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

.poi-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.poi-edit-actions {
  display: flex;
  gap: 6px;
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

.track-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
