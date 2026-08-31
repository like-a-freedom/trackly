<template>
  <section
    class="track-editor-segments-card"
    data-testid="track-editor-segments-card"
  >
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
  </section>
</template>

<script setup>
import TrackEditorInspectorSegments from "./TrackEditorInspectorSegments.vue";

defineProps({
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  highlightedSegmentIndex: { type: Number, default: null },
});

defineEmits([
  "addSegment",
  "setActiveSegment",
  "hoverSegment",
  "leaveSegment",
  "updateSegmentName",
  "updateSegmentColor",
  "joinSegments",
  "newTrackFromSegment",
  "reverseSegment",
  "deleteSegment",
]);
</script>

<style scoped>
.track-editor-segments-card {
  min-width: 0;
}
</style>
