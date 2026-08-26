<template>
  <section
    class="track-editor-bottom-deck"
    data-testid="track-editor-bottom-deck"
  >
    <article class="deck-card deck-card--wide">
      <TrackEditorMetaCard
        :track-name="trackName"
        :track-description="trackDescription"
        :track-categories="trackCategories"
        :total-points="totalPoints"
        @update:track-name="$emit('update:trackName', $event)"
        @update:track-description="$emit('update:trackDescription', $event)"
        @update:track-categories="$emit('update:trackCategories', $event)"
      />
    </article>

    <article class="deck-card deck-card--wide">
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
    </article>

    <article class="deck-card">
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
    </article>

    <article class="deck-card deck-card--wide">
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
    </article>
  </section>
</template>

<script setup>
import TrackEditorActionsCard from "./TrackEditorActionsCard.vue";
import TrackEditorChartCard from "./TrackEditorChartCard.vue";
import TrackEditorMetaCard from "./TrackEditorMetaCard.vue";
import TrackEditorSegmentsCard from "./TrackEditorSegmentsCard.vue";

defineProps({
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  pois: { type: Array, default: () => [] },
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
  coordinateData: { type: Array, default: () => [] },
  highlightedSegmentIndex: { type: Number, default: null },
  fragmentInfo: { type: Object, default: null },
  optimizerTargetRatio: { type: Number, default: 0.1 },
  optimizerPreview: { type: Object, default: null },
  optimizerStats: { type: Object, default: null },
  optimizerLoading: { type: Boolean, default: false },
  optimizerError: { type: String, default: null },
});

defineEmits([
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
  "hoverSegment",
  "leaveSegment",
]);
</script>

<style scoped>
.track-editor-bottom-deck {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: 1fr;
  gap: 8px;
  width: 100%;
  height: 100%;
}

.deck-card,
.deck-card--wide {
  box-sizing: border-box;
  grid-column: span 1;
  min-width: 0;
  height: 100%;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

@media (max-width: 768px) {
  .track-editor-bottom-deck {
    grid-template-columns: 1fr;
  }
}
</style>
