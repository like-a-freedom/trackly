<template>
  <aside
    class="track-editor-left-panel"
    data-testid="track-editor-left-panel"
  >
    <!-- ─── Tabs ─── -->
    <nav
      class="panel-tabs"
      aria-label="Panel sections"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="panel-tab"
        :class="{ 'panel-tab--active': activeTab === tab.id }"
        :data-testid="`panel-tab-${tab.id}`"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- ─── Tab content ─── -->
    <div class="panel-content">
      <!-- Segments tab -->
      <div
        v-show="activeTab === 'segments'"
        class="panel-tab-body"
      >
        <div
          v-if="totalPoints < 2"
          class="panel-empty-tip"
          data-testid="panel-tip"
        >
          Click on the map to draw your first point
        </div>
        <TrackEditorSegmentsCard
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
      </div>

      <!-- Info tab: metadata + actions -->
      <div
        v-show="activeTab === 'info'"
        class="panel-tab-body"
      >
        <TrackEditorMetaCard
          :track-name="trackName"
          :track-description="trackDescription"
          :track-categories="trackCategories"
          :total-points="totalPoints"
          @update:track-name="$emit('update:trackName', $event)"
          @update:track-description="$emit('update:trackDescription', $event)"
          @update:track-categories="$emit('update:trackCategories', $event)"
        />
        <div class="panel-inner-divider" />
        <TrackEditorActionsCard
          :total-distance-km="totalDistanceKm"
          :estimated-time-minutes="estimatedTimeMinutes"
          :total-points="totalPoints"
          :segment-count="segmentStats.length"
          :poi-count="pois.length"
          :fragment-info="fragmentInfo"
          :optimizer-target-ratio="optimizerTargetRatio"
          :optimizer-preview="optimizerPreview"
          :optimizer-stats="optimizerStats"
          :optimizer-loading="optimizerLoading"
          :optimizer-error="optimizerError"
          @duplicate-track="$emit('duplicateTrack')"
          @reverse-track="$emit('reverseTrack')"
          @close-loop="$emit('closeLoop')"
          @close-loop-same-way="$emit('closeLoopSameWay')"
          @close-loop-different-route="$emit('closeLoopDifferentRoute')"
          @update:optimizer-target-ratio="
            $emit('update:optimizerTargetRatio', $event)
          "
          @preview-optimization="$emit('previewOptimization')"
          @apply-optimization="$emit('applyOptimization')"
          @clear-optimization="$emit('clearOptimization')"
          @download-optimization="$emit('downloadOptimization')"
          @clear-fragment="$emit('clearFragment')"
          @reroute-fragment="$emit('rerouteFragment')"
          @delete-fragment-connect="$emit('deleteFragmentConnect')"
          @delete-fragment-split="$emit('deleteFragmentSplit')"
          @reverse-fragment="$emit('reverseFragment')"
          @export-fragment="$emit('exportFragment')"
        />
      </div>

      <!-- Elevation tab -->
      <div
        v-show="activeTab === 'elevation'"
        class="panel-tab-body"
      >
        <TrackEditorChartCard
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
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref } from "vue";
import TrackEditorActionsCard from "./TrackEditorActionsCard.vue";
import TrackEditorChartCard from "./TrackEditorChartCard.vue";
import TrackEditorMetaCard from "./TrackEditorMetaCard.vue";
import TrackEditorSegmentsCard from "./TrackEditorSegmentsCard.vue";

const props = defineProps({
  // Track identity
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
  totalPoints: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  // Segments
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  highlightedSegmentIndex: { type: Number, default: null },
  // POIs
  pois: { type: Array, default: () => [] },
  // Elevation
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
  coordinateData: { type: Array, default: () => [] },
  // Fragment & optimizer
  fragmentInfo: { type: Object, default: null },
  optimizerTargetRatio: { type: Number, default: 0.1 },
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
  "newTrackFromSegment",
  "hoverSegment",
  "leaveSegment",
  "clearFragment",
  "deleteFragmentConnect",
  "deleteFragmentSplit",
  "reverseFragment",
  "rerouteFragment",
  "exportFragment",
  "closeLoop",
  "closeLoopSameWay",
  "closeLoopDifferentRoute",
  "reverseTrack",
  "duplicateTrack",
  "update:optimizerTargetRatio",
  "previewOptimization",
  "applyOptimization",
  "clearOptimization",
  "downloadOptimization",
  "chart-point-hover",
  "chart-point-leave",
  "chart-point-click",
]);

const activeTab = ref("segments");

const tabs = [
  { id: "segments", label: "Segments" },
  { id: "info", label: "Info" },
  { id: "elevation", label: "Elevation" },
];
</script>

<style scoped>
/* ── Container ── */
.track-editor-left-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.1),
    0 2px 8px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ── Tabs ── */
.panel-tabs {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  border-bottom: 1px solid rgba(226, 232, 240, 0.75);
  background: rgba(248, 250, 252, 0.6);
}

.panel-tab {
  flex: 1;
  height: 37px;
  padding: 0;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.79rem;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.12s;
  letter-spacing: -0.01em;
}

.panel-tab:hover {
  color: #334155;
}

.panel-tab--active {
  color: #2563eb;
  font-weight: 650;
}

.panel-tab--active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 12%;
  right: 12%;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #2563eb;
}

/* ── Content ── */
.panel-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.panel-tab-body {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 10px 14px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
}

.panel-tab-body::-webkit-scrollbar {
  width: 4px;
}

.panel-tab-body::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.4);
  border-radius: 4px;
}

.panel-inner-divider {
  height: 1px;
  background: rgba(226, 232, 240, 0.8);
  margin: 8px 0;
}

.panel-empty-tip {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 500;
  text-align: center;
}
</style>
