<template>
  <section
    class="track-editor-actions-card"
    data-testid="track-editor-actions-card"
  >
    <TrackEditorInspectorTrackActions
      @duplicate-track="$emit('duplicateTrack')"
      @reverse-track="$emit('reverseTrack')"
    />

    <TrackEditorInspectorSummary
      :total-distance-km="totalDistanceKm"
      :estimated-time-minutes="estimatedTimeMinutes"
      :total-points="totalPoints"
      :segment-count="segmentCount"
      :poi-count="poiCount"
      @close-loop="$emit('closeLoop')"
      @close-loop-same-way="$emit('closeLoopSameWay')"
      @close-loop-different-route="$emit('closeLoopDifferentRoute')"
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

    <TrackEditorInspectorFragmentTools
      v-if="fragmentInfo"
      :fragment-info="fragmentInfo"
      @clear-fragment="$emit('clearFragment')"
      @reroute-fragment="$emit('rerouteFragment')"
      @delete-fragment-connect="$emit('deleteFragmentConnect')"
      @delete-fragment-split="$emit('deleteFragmentSplit')"
      @reverse-fragment="$emit('reverseFragment')"
      @export-fragment="$emit('exportFragment')"
    />
  </section>
</template>

<script setup>
import TrackEditorInspectorFragmentTools from "./TrackEditorInspectorFragmentTools.vue";
import TrackEditorInspectorOptimizer from "./TrackEditorInspectorOptimizer.vue";
import TrackEditorInspectorSummary from "./TrackEditorInspectorSummary.vue";
import TrackEditorInspectorTrackActions from "./TrackEditorInspectorTrackActions.vue";

defineProps({
  totalDistanceKm: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  segmentCount: { type: Number, default: 0 },
  poiCount: { type: Number, default: 0 },
  fragmentInfo: { type: Object, default: null },
  optimizerTargetRatio: { type: Number, default: 0.1 },
  optimizerPreview: { type: Object, default: null },
  optimizerStats: { type: Object, default: null },
  optimizerLoading: { type: Boolean, default: false },
  optimizerError: { type: String, default: null },
});

defineEmits([
  "duplicateTrack",
  "reverseTrack",
  "closeLoop",
  "closeLoopSameWay",
  "closeLoopDifferentRoute",
  "update:optimizerTargetRatio",
  "previewOptimization",
  "applyOptimization",
  "clearOptimization",
  "downloadOptimization",
  "clearFragment",
  "rerouteFragment",
  "deleteFragmentConnect",
  "deleteFragmentSplit",
  "reverseFragment",
  "exportFragment",
]);
</script>

<style scoped>
.track-editor-actions-card {
  display: grid;
  gap: 1px;
  min-width: 0;
}
</style>
