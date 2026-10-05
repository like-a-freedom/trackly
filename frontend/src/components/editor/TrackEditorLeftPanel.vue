<template>
  <aside
    class="track-editor-left-panel flex h-full min-h-0 flex-col bg-surface"
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
        :aria-pressed="activeTab === tab.id"
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
        v-show="activeTab === 'route'"
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
        <slot name="context" />
      </div>

      <!-- Info tab: metadata + actions -->
      <div
        v-show="activeTab === 'description'"
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
      </div>

      <!-- Elevation tab -->
      <div
        v-show="activeTab === 'review'"
        class="panel-tab-body"
      >
        <TrackEditorChartCard
          :recorded-series="recordedSeries"
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
  recordedSeries: { type: Object, default: null },
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

const activeTab = ref("route");

const tabs = [
  { id: "route", label: "Route" },
  { id: "description", label: "Description" },
  { id: "review", label: "Review" },
];
</script>

<style scoped>
.panel-tabs { display:flex; flex-shrink:0; border-bottom:1px solid var(--color-line); }
.panel-tab { flex:1; min-height:44px; background:transparent; border:0; border-bottom:3px solid transparent; color:var(--color-muted); cursor:pointer; }
.panel-tab--active { color:var(--color-action); border-bottom-color:var(--color-action); font-weight:600; }
.panel-content { flex:1; min-height:0; overflow:hidden; }
.panel-tab-body { height:100%; overflow:auto; padding:16px; box-sizing:border-box; }
.panel-inner-divider { border-top:1px solid var(--color-line); margin:20px 0; }
.panel-empty-tip { padding:12px; margin-bottom:16px; background:#eff6ff; color:#194aa5; line-height:1.5; }
</style>
